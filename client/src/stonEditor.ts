import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import {
  parseSton,
  renderStonForm,
  findScalarByPath,
  serializeScalarLiteral,
  isStonParseError,
  friendlyClassName,
  valueRange,
  StonScalar,
  StonFilter,
  StonWarn,
} from './stonParser';
import { keyDoc } from './stonKeyDocs';
import { readRowanWorkspaceProject } from './rowanProject';
import { findRowanLoadSpecs } from './rowanLoad';
import { listPreloadDependencies, removePreloadDependency, RowanDependency } from './rowanDependency';
import type { ActiveSession } from './sessionManager';
import { listRowanProjects, diffRowanProject, formatRowanDiff } from './browserQueries';
import { GemStoneLogin, loginLabel } from './loginTypes';

// User-local, session-facing dependencies — kept out of the .ston files. Passed
// in (not imported from extension.ts) to avoid a circular dependency.
export interface StonEditorDeps {
  getSession(): ActiveSession | null;
  onDidChangeSession: vscode.Event<unknown>;
  getLogins(): GemStoneLogin[];
  loadProject(root: string): Promise<void>;
  commitProject(root: string): Promise<void>;
}

interface Section {
  uri: vscode.Uri;
  title: string;
  subtitle: string;
  text: string;
}

type ViewMode = 'overview' | 'edit';
interface ViewState { mode: ViewMode; filter: StonFilter; }

const FILTERS: { id: StonFilter; label: string }[] = [
  { id: 'simplified', label: 'Simplified' },
  { id: 'specified', label: 'Specified' },
  { id: 'different', label: 'Customized' },
  { id: 'all', label: 'All' },
];

// A custom text editor for .ston files styled like Xcode's build settings: a
// grouped "Setting → Value" grid, edited inline and written straight back to the
// file (which stays real text — git/diff intact) and saved on change. Opening a
// project's `project.ston` aggregates the whole project — its load specs and
// components — into one settings screen. Registered as the default editor for
// *.ston; "View as Text" / Reopen With… drops to the syntax-highlighted source.
export class StonEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'gemstone.ston';

  // Per-document Overview/Edit mode + settings filter, kept across re-renders.
  private readonly viewState = new Map<string, ViewState>();
  // Re-render callbacks for every open panel, fired when the session changes.
  private readonly renderers = new Set<() => void>();

  constructor(private readonly deps: StonEditorDeps) {
    deps.onDidChangeSession(() => {
      for (const rerender of this.renderers) rerender();
    });
  }

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    panel.webview.options = { enableScripts: true };

    const key0 = document.uri.toString();
    if (!this.viewState.has(key0)) {
      const isProject = path.basename(document.uri.fsPath).toLowerCase() === 'project.ston';
      this.viewState.set(key0, { mode: isProject ? 'overview' : 'edit', filter: 'all' });
    }

    // Per-panel state: which files this view renders, and the text of edits we
    // just made (so the resulting change events don't reset a focused input).
    let sectionUris = new Set<string>([document.uri.toString()]);
    const selfEdits = new Map<string, string>();

    const render = async () => {
      const built = await this.build(panel.webview, document);
      sectionUris = built.uris;
      panel.webview.html = built.html;
    };
    void render();

    const rerender = () => void render();
    this.renderers.add(rerender);
    panel.onDidDispose(() => this.renderers.delete(rerender));

    const changeSub = vscode.workspace.onDidChangeTextDocument(async (e) => {
      const key = e.document.uri.toString();
      if (!sectionUris.has(key)) return;
      if (selfEdits.get(key) === e.document.getText()) {
        selfEdits.delete(key);
        return;
      }
      await render();
    });
    panel.onDidDispose(() => changeSub.dispose());

    // The Package Dependencies group reads the pre-load doit files, which are
    // written by plain file writes (add/remove) — no document event — so watch
    // them and re-render on any change. (Scoped to the doits, not the .ston
    // files, so inline field edits don't lose input focus to a re-render.)
    if (path.basename(document.uri.fsPath).toLowerCase() === 'project.ston') {
      const root = path.dirname(path.dirname(document.uri.fsPath));
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(root, 'rowan/components/*.st'),
      );
      const onDoitChange = () => void render();
      watcher.onDidChange(onDoitChange);
      watcher.onDidCreate(onDoitChange);
      watcher.onDidDelete(onDoitChange);
      panel.onDidDispose(() => watcher.dispose());
    }

    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === 'edit') {
        void this.applyEdit(vscode.Uri.parse(msg.file), msg.path, msg.kind, msg.value, selfEdits);
      } else if (msg?.type === 'set') {
        void this.insertField(vscode.Uri.parse(msg.file), msg.key, msg.value);
      } else if (msg?.type === 'viewSource') {
        const uri = msg.file ? vscode.Uri.parse(msg.file) : document.uri;
        void vscode.commands.executeCommand('vscode.openWith', uri, 'default');
      } else if (msg?.type === 'addDependency') {
        // Don't await — the command ends on a persistent info toast; the file
        // watcher above refreshes the panel when the doit is actually written.
        void vscode.commands.executeCommand('gemstone.rowanAddPackage');
      } else if (msg?.type === 'viewRecipe') {
        if (msg.file) void vscode.commands.executeCommand('vscode.openWith', vscode.Uri.parse(msg.file), 'default');
      } else if (msg?.type === 'setMode') {
        const s = this.viewState.get(document.uri.toString());
        if (s && (msg.mode === 'overview' || msg.mode === 'edit')) { s.mode = msg.mode; await render(); }
      } else if (msg?.type === 'setFilter') {
        const s = this.viewState.get(document.uri.toString());
        if (s) { s.filter = msg.filter; await render(); }
      } else if (msg?.type === 'removeDependency') {
        const root = path.dirname(path.dirname(document.uri.fsPath));
        const dep = listPreloadDependencies(root).find((d) => d.repository === msg.repository);
        const choice = await vscode.window.showWarningMessage(
          `Remove dependency ${dep?.name ?? ''}?`, { modal: true }, 'Remove',
        );
        if (choice === 'Remove') {
          removePreloadDependency(root, msg.repository);
          await render();
        }
      } else if (msg?.type === 'connect') {
        const logins = this.deps.getLogins();
        if (logins.length === 0) {
          vscode.window.showErrorMessage('No logins configured yet — add one in the GemStone Logins view.');
          return;
        }
        const picked = await vscode.window.showQuickPick(
          logins.map((l) => ({ label: loginLabel(l), login: l })),
          { title: 'Connect to a stone', placeHolder: 'Pick a login' },
        );
        if (picked) await vscode.commands.executeCommand('gemstone.login', { login: picked.login });
      } else if (msg?.type === 'load') {
        const root = path.dirname(path.dirname(document.uri.fsPath));
        try {
          await this.deps.loadProject(root);
          await render();
        } catch (e: unknown) {
          vscode.window.showErrorMessage(`Load failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else if (msg?.type === 'commitToDisk') {
        const root = path.dirname(path.dirname(document.uri.fsPath));
        try {
          await this.deps.commitProject(root);
          await render();
        } catch (e: unknown) {
          vscode.window.showErrorMessage(`Commit to disk failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else if (msg?.type === 'reloadFromDisk') {
        // The inverse of Commit to Disk: reloading re-resolves the project from
        // its on-disk source, overwriting the image — so discard the image's
        // changes only on explicit confirmation.
        const root = path.dirname(path.dirname(document.uri.fsPath));
        const projectName = readRowanWorkspaceProject(root)?.name ?? path.basename(root);
        const choice = await vscode.window.showWarningMessage(
          `Reload "${projectName}" from disk?`,
          {
            modal: true,
            detail: 'This discards any changes in the image and reloads the project from its on-disk source.',
          },
          'Reload from Disk',
        );
        if (choice !== 'Reload from Disk') return;
        try {
          await this.deps.loadProject(root);
          await render();
        } catch (e: unknown) {
          vscode.window.showErrorMessage(`Reload failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else if (msg?.type === 'viewDrift') {
        const session = this.deps.getSession();
        if (!session) return;
        const root = path.dirname(path.dirname(document.uri.fsPath));
        const projectName = readRowanWorkspaceProject(root)?.name ?? path.basename(root);
        const diff = diffRowanProject(session, projectName);
        if (!diff.ok) {
          vscode.window.showErrorMessage(`Diff of "${projectName}" failed: ${diff.error}`);
          return;
        }
        const doc = await vscode.workspace.openTextDocument({
          content: formatRowanDiff(projectName, diff),
          language: 'markdown',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
      }
    });
  }

  private async build(
    webview: vscode.Webview,
    document: vscode.TextDocument,
  ): Promise<{ html: string; uris: Set<string> }> {
    const state = this.viewState.get(document.uri.toString()) ?? { mode: 'edit' as ViewMode, filter: 'all' as StonFilter };
    const isProject = path.basename(document.uri.fsPath).toLowerCase() === 'project.ston';
    const sections = await this.sections(document);
    const uris = new Set(sections.map((s) => s.uri.toString()));
    const nonce = makeNonce();
    const content = isProject && state.mode === 'overview'
      ? await this.renderOverview(document)
      : sections.map((s) => this.renderSection(s, state.filter)).join('') + this.renderDependencies(document);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>${CSS}</style>
</head>
<body>
${this.renderTopbar(isProject, state)}
<div class="ston-content">${content}</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
for (const el of document.querySelectorAll('[data-path]')) {
  el.addEventListener('change', () => {
    vscode.postMessage({
      type: 'edit',
      file: el.getAttribute('data-file'),
      path: JSON.parse(el.getAttribute('data-path')),
      kind: el.getAttribute('data-kind'),
      value: el.type === 'checkbox' ? String(el.checked) : el.value,
    });
  });
}
for (const btn of document.querySelectorAll('.ston-set')) {
  btn.addEventListener('click', () => {
    vscode.postMessage({
      type: 'set',
      file: btn.getAttribute('data-file'),
      key: btn.getAttribute('data-key'),
      value: btn.getAttribute('data-value'),
    });
  });
}
for (const btn of document.querySelectorAll('.ston-dep-add')) {
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); vscode.postMessage({ type: 'addDependency' }); });
}
for (const btn of document.querySelectorAll('.ston-dep-recipe')) {
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); vscode.postMessage({ type: 'viewRecipe', file: btn.getAttribute('data-recipe') }); });
}
for (const btn of document.querySelectorAll('.ston-dep-remove')) {
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); vscode.postMessage({ type: 'removeDependency', repository: btn.getAttribute('data-repo') }); });
}
for (const b of document.querySelectorAll('.ston-mode-tab')) {
  b.addEventListener('click', () => vscode.postMessage({ type: 'setMode', mode: b.getAttribute('data-mode') }));
}
for (const b of document.querySelectorAll('.ston-filter-tab')) {
  b.addEventListener('click', () => vscode.postMessage({ type: 'setFilter', filter: b.getAttribute('data-filter') }));
}
for (const b of document.querySelectorAll('[data-conn]')) {
  b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); vscode.postMessage({ type: b.getAttribute('data-conn') }); });
}
// section path → open that file as text (don't toggle the section)
for (const p of document.querySelectorAll('.ston-path')) {
  p.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    vscode.postMessage({ type: 'viewSource', file: p.getAttribute('data-file') });
  });
}
// remember which sections are collapsed across re-renders
const st = vscode.getState() || {};
const collapsed = st.collapsed || {};
for (const d of document.querySelectorAll('details[data-section]')) {
  const id = d.getAttribute('data-section');
  if (collapsed[id]) d.open = false;
  d.addEventListener('toggle', () => {
    const s = vscode.getState() || {};
    s.collapsed = s.collapsed || {};
    s.collapsed[id] = !d.open;
    vscode.setState(s);
  });
}
const vs = document.getElementById('viewSource');
if (vs) vs.addEventListener('click', () => vscode.postMessage({ type: 'viewSource' }));
</script>
</body>
</html>`;
    return { html, uris };
  }

  // The files this view shows. A project's `project.ston` aggregates the project
  // (its load specs and components); any other .ston shows just itself.
  private async sections(document: vscode.TextDocument): Promise<Section[]> {
    const single: Section = {
      uri: document.uri,
      title: titleFor(document.uri, document.getText()),
      subtitle: projectRelative(document.uri),
      text: document.getText(),
    };
    if (path.basename(document.uri.fsPath).toLowerCase() !== 'project.ston') return [single];

    const rowanDir = path.dirname(document.uri.fsPath);
    const root = path.dirname(rowanDir);
    const project = readRowanWorkspaceProject(root);
    const sections: Section[] = [{ ...single, title: 'Project' }];

    const read = async (uri: vscode.Uri, title: string): Promise<Section> => ({
      uri,
      title,
      subtitle: projectRelative(uri),
      text: (await vscode.workspace.openTextDocument(uri)).getText(),
    });

    const specsDir = path.join(root, project?.specsPath ?? 'rowan/specs');
    for (const spec of findRowanLoadSpecs(specsDir)) {
      sections.push(await read(vscode.Uri.file(spec.path), `Load Spec · ${spec.name}`));
    }
    const componentsDir = path.join(root, project?.componentsPath ?? 'rowan/components');
    for (const file of stonFilesIn(componentsDir)) {
      sections.push(await read(file, `Component · ${path.basename(file.fsPath, '.ston')}`));
    }
    return sections;
  }

  // The Swift-PM-style "Package Dependencies" group — the project's pre-load
  // Metacello dependencies, with repo + revision and add/remove. Only for a
  // project's project.ston (the aggregate view).
  private renderDependencies(document: vscode.TextDocument): string {
    if (path.basename(document.uri.fsPath).toLowerCase() !== 'project.ston') return '';
    const root = path.dirname(path.dirname(document.uri.fsPath));
    const deps = listPreloadDependencies(root);
    const rows = deps.length
      ? deps.map((d) => depRow(d)).join('')
      : `<div class="ston-dep-empty">No package dependencies yet.</div>`;
    return (
      `<details class="ston-group" open data-section="__deps__"><summary class="ston-group-head">` +
      `<span class="ston-group-title">Package Dependencies</span>` +
      `<span class="ston-dep-count">${deps.length}</span></summary>` +
      `<div class="ston-group-body ston-deps">${rows}` +
      `<div class="ston-dep-addrow"><button class="ston-dep-add">+ Add Package Dependency…</button></div>` +
      `</div></details>`
    );
  }

  // The Overview/Edit tabs and the settings filter, Xcode-style.
  private renderTopbar(isProject: boolean, state: ViewState): string {
    const modeTabs = isProject
      ? `<div class="ston-seg ston-modes">` +
        `<button class="ston-mode-tab${state.mode === 'overview' ? ' active' : ''}" data-mode="overview">Overview</button>` +
        `<button class="ston-mode-tab${state.mode === 'edit' ? ' active' : ''}" data-mode="edit">Edit</button></div>`
      : '';
    const showFilter = !isProject || state.mode === 'edit';
    const filterTabs = showFilter
      ? `<div class="ston-seg ston-filters">` +
        FILTERS.map((f) => `<button class="ston-filter-tab${state.filter === f.id ? ' active' : ''}" data-filter="${f.id}">${f.label}</button>`).join('') +
        `</div>`
      : '';
    const session = isProject ? this.deps.getSession() : null;
    const chip = isProject
      ? `<button class="ston-conn-chip" data-conn="connect" title="${session ? 'Connected — click to switch' : 'Connect to a stone'}">` +
        `<span class="ston-dot ${session ? 'on' : 'off'}"></span>${session ? escapeHtml(loginLabel(session.login)) : 'Not connected'}</button>`
      : '';
    return `<div class="ston-topbar">${modeTabs}<div class="ston-topbar-spacer"></div>${chip}${filterTabs}</div>`;
  }

  // The "landing page": an icon (placeholder), title, version, dependencies, and
  // change history — a beautiful read-only summary of the project.
  private async renderOverview(document: vscode.TextDocument): Promise<string> {
    const root = path.dirname(path.dirname(document.uri.fsPath));
    const project = readRowanWorkspaceProject(root);
    const name = project?.name ?? path.basename(root);
    const version = document.getText().match(/#projectVersion\s*:\s*'([^']*)'/)?.[1];
    const deps = listPreloadDependencies(root);
    const history = await gitHistory(root);
    const initial = escapeHtml((name.trim()[0] ?? '?').toUpperCase());
    return (
      `<div class="ston-overview"><div class="ov-hero">` +
      `<div class="ov-icon" title="Project icon — placeholder">${initial}</div>` +
      `<div class="ov-headings"><div class="ov-title">${escapeHtml(name)}</div>` +
      `<div class="ov-version">${version ? 'Version ' + escapeHtml(version) : 'No version set'}</div></div>` +
      `<button class="ston-mode-tab ov-edit" data-mode="edit">` +
      `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l8-8 1.77 1.77-8 8z"/></svg>` +
      `Edit Settings</button></div>` +
      `<div class="ov-cards">` +
      this.renderConnection(name) +
      `<section class="ov-card"><div class="ov-card-head">Dependencies<span class="ov-count">${deps.length}</span></div>` +
      (deps.length ? deps.map(ovDepRow).join('') : `<div class="ov-empty">No dependencies.</div>`) +
      `</section>` +
      `<section class="ov-card"><div class="ov-card-head">Change History</div>` +
      (history.length ? history.map(ovHistoryRow).join('') : `<div class="ov-empty">No history yet.</div>`) +
      `</section></div></div>`
    );
  }

  // The user-local Connection card: the live session and this project's status
  // against it (not loaded / in sync / drifted), with connect/load/drift actions.
  private renderConnection(projectName: string): string {
    const head = `<div class="ov-card-head">Connection</div>`;
    const session = this.deps.getSession();
    if (!session) {
      return (
        `<section class="ov-card ston-conn">${head}<div class="ston-conn-row">` +
        `<span class="ston-dot off"></span><span class="ston-conn-text">Not connected to a stone</span>` +
        `<button class="ston-conn-btn" data-conn="connect">Connect…</button></div></section>`
      );
    }
    let status: string;
    try {
      const { available, projects } = listRowanProjects(session);
      if (!available) {
        status = `<span class="ston-conn-status">Rowan is not installed in this stone</span>`;
      } else {
        const proj = projects.find((p) => p.name === projectName);
        if (!proj) {
          status = `<span class="ston-conn-status">Not loaded in this stone</span><button class="ston-conn-btn" data-conn="load">Load…</button>`;
        } else if (proj.isDirty) {
          status = `<span class="ston-conn-status drift">Loaded · image differs from disk</span>` +
            `<button class="ston-conn-btn" data-conn="commitToDisk">Commit to Disk</button>` +
            `<button class="ston-conn-btn ghost" data-conn="reloadFromDisk">Reload from Disk</button>` +
            `<button class="ston-conn-btn ghost" data-conn="viewDrift">View Drift</button>`;
        } else {
          status = `<span class="ston-conn-status insync">Loaded · in sync with disk ✓</span>`;
        }
      }
    } catch (e: unknown) {
      status = `<span class="ston-conn-status">Couldn't query the stone: ${escapeHtml(e instanceof Error ? e.message : String(e))}</span>`;
    }
    return (
      `<section class="ov-card ston-conn">${head}<div class="ston-conn-row">` +
      `<span class="ston-dot on"></span><span class="ston-conn-text">${escapeHtml(loginLabel(session.login))}</span>` +
      `<button class="ston-conn-btn ghost" data-conn="connect">Switch…</button></div>` +
      `<div class="ston-conn-row status">${status}</div></section>`
    );
  }

  private renderSection(s: Section, filter: StonFilter): string {
    const parsed = parseSton(s.text);
    const body = isStonParseError(parsed)
      ? `<div class="ston-error">Not valid STON — <code>${escapeHtml(parsed.error)}</code></div>`
      : renderStonForm(parsed, s.uri.toString(), filter, pathWarn(projectRootOf(s.uri.fsPath)));
    const id = escapeAttr(s.uri.toString());
    return (
      `<details class="ston-group" open data-section="${id}"><summary class="ston-group-head">` +
      `<span class="ston-group-title">${escapeHtml(s.title)}</span>` +
      `<button class="ston-path" data-file="${id}" title="Open ${escapeAttr(s.subtitle)} as text">${escapeHtml(s.subtitle)}</button>` +
      `</summary><div class="ston-group-body">${body}</div></details>`
    );
  }

  private async applyEdit(
    uri: vscode.Uri,
    keyPath: (string | number)[],
    kind: StonScalar['kind'],
    value: string,
    selfEdits: Map<string, string>,
  ): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(uri);
    const parsed = parseSton(doc.getText());
    if (isStonParseError(parsed)) return;
    const scalar = findScalarByPath(parsed, keyPath);
    if (!scalar) return;
    const literal = serializeScalarLiteral(kind, value);
    const text = doc.getText();
    if (text.slice(scalar.range[0], scalar.range[1]) === literal) return;
    selfEdits.set(uri.toString(), text.slice(0, scalar.range[0]) + literal + text.slice(scalar.range[1]));
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      uri,
      new vscode.Range(doc.positionAt(scalar.range[0]), doc.positionAt(scalar.range[1])),
      literal,
    );
    await vscode.workspace.applyEdit(edit);
    await doc.save();
  }

  // Add an available-but-unset key to a spec (from the "Set" affordance): insert
  // `#key : '<value>'` as a new last entry. Not suppressed — the view re-renders
  // so the key moves from "Available" into the editable settings.
  private async insertField(uri: vscode.Uri, key: string, value: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(uri);
    const parsed = parseSton(doc.getText());
    if (isStonParseError(parsed) || parsed.kind !== 'object') return;
    const text = doc.getText();
    const literal = `'${String(value).replace(/'/g, "''")}'`;
    let insertAt: number;
    let insertText: string;
    if (parsed.entries.length > 0) {
      insertAt = valueRange(parsed.entries[parsed.entries.length - 1].value)[1];
      insertText = `,\n\t#${key} : ${literal}`;
    } else {
      insertAt = text.indexOf('{', parsed.range[0]) + 1;
      insertText = `\n\t#${key} : ${literal}\n`;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, doc.positionAt(insertAt), insertText);
    await vscode.workspace.applyEdit(edit);
    await doc.save();
  }
}

function titleFor(uri: vscode.Uri, text: string): string {
  const parsed = parseSton(text);
  if (isStonParseError(parsed) || (parsed.kind !== 'object' && parsed.kind !== 'list')) {
    return path.basename(uri.fsPath);
  }
  return friendlyClassName(parsed.className);
}

// The Rowan project root for `fsPath` — the nearest ancestor with
// rowan/project.ston — or null when the file isn't inside a project.
export function projectRootOf(fsPath: string): string | null {
  let dir = path.dirname(fsPath);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'rowan', 'project.ston'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// The path of `uri` relative to its Rowan project root, else relative to the
// workspace folder.
function projectRelative(uri: vscode.Uri): string {
  const root = projectRootOf(uri.fsPath);
  return root ? path.relative(root, uri.fsPath) : vscode.workspace.asRelativePath(uri, false);
}

// A StonWarn that flags a path-valued key (one with a `pathKind`) whose value
// names a directory/file that isn't on disk, resolved against the project root.
// Empty values are left to the required-field check, not flagged as missing.
export function pathWarn(root: string | null): StonWarn | undefined {
  if (!root) return undefined;
  return (key, value) => {
    const kind = keyDoc(key)?.pathKind;
    if (!kind || value.trim() === '') return undefined;
    const target = path.join(root, value);
    if (fs.existsSync(target)) return undefined;
    return `${kind === 'dir' ? 'Directory' : 'File'} "${value}" does not exist under the project root.`;
  };
}

function stonFilesIn(dir: string): vscode.Uri[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.ston'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => vscode.Uri.file(path.join(dir, e.name)));
  } catch {
    return [];
  }
}

// A Swift-PM-style dependency row: name + repo on the left, the revision as a
// pill, and a hover remove button.
function depRow(d: RowanDependency): string {
  const { display, revision } = parseMetacelloRepo(d.repository);
  const rule = revision || d.baseline;
  const recipeUri = escapeAttr(vscode.Uri.file(d.doitFile).toString());
  return (
    `<div class="ston-dep"><div class="ston-dep-main">` +
    `<span class="ston-dep-name">${escapeHtml(d.name)}</span>` +
    `<span class="ston-dep-repo">${escapeHtml(display)}</span></div>` +
    (rule ? `<span class="ston-dep-rule">${escapeHtml(rule)}</span>` : '') +
    `<button class="ston-dep-recipe" data-recipe="${recipeUri}" title="View the load recipe">{ }</button>` +
    `<button class="ston-dep-remove" data-repo="${escapeAttr(d.repository)}" title="Remove ${escapeAttr(d.name)}">✕</button>` +
    `</div>`
  );
}

// Split a Metacello repository URL like `github://SeasideSt/Seaside:v3.6.0/repository`
// into a display path (SeasideSt/Seaside) and revision (v3.6.0).
function parseMetacelloRepo(repo: string): { display: string; revision: string } {
  const s = repo.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/(repository|repo)$/i, '');
  const colon = s.lastIndexOf(':');
  if (colon > 0) return { display: s.slice(0, colon), revision: s.slice(colon + 1) };
  return { display: s, revision: '' };
}

interface HistoryEntry { hash: string; author: string; date: string; subject: string; }

// Recent git commits touching the project root — the "change history". Empty
// when the folder isn't a git working tree.
function gitHistory(root: string): Promise<HistoryEntry[]> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', root, 'log', '-10', '--date=short', '--format=%h%x1f%an%x1f%ad%x1f%s'],
      { timeout: 3000 },
      (err, stdout) => {
        if (err || !stdout.trim()) return resolve([]);
        resolve(
          stdout.trim().split('\n').map((line) => {
            const [hash, author, date, subject] = line.split('\x1f');
            return { hash, author, date, subject };
          }),
        );
      },
    );
  });
}

function ovDepRow(d: RowanDependency): string {
  const { display, revision } = parseMetacelloRepo(d.repository);
  return (
    `<div class="ov-dep"><span class="ov-dep-name">${escapeHtml(d.name)}</span>` +
    `<span class="ov-dep-repo">${escapeHtml(display)}</span>` +
    `<span class="ov-dep-rule">${escapeHtml(revision || d.baseline)}</span></div>`
  );
}

function ovHistoryRow(h: HistoryEntry): string {
  return (
    `<div class="ov-hist"><div class="ov-hist-top">` +
    `<span class="ov-hist-subject">${escapeHtml(h.subject)}</span>` +
    `<span class="ov-hist-hash">${escapeHtml(h.hash)}</span></div>` +
    `<span class="ov-hist-meta">${escapeHtml(h.author)} · ${escapeHtml(h.date)}</span></div>`
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 24; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const CSS = `
:root { color-scheme: light dark; }
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  margin: 0;
  padding: 0 0 44px;
}
.ston-content { padding-top: 4px; }

/* top bar: Overview/Edit tabs + settings filter, Xcode-style segmented controls */
.ston-topbar {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 16px;
  position: sticky; top: 0; z-index: 10;
  background: var(--vscode-editor-background);
  border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,.2));
}
.ston-topbar-spacer { flex: 1 1 auto; }
.ston-seg {
  display: inline-flex; padding: 2px; gap: 2px;
  background: var(--vscode-editorWidget-background, rgba(128,128,128,.1));
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.3));
  border-radius: 6px;
}
.ston-seg button {
  cursor: pointer; border: none; border-radius: 4px;
  background: transparent; color: var(--vscode-foreground);
  font-family: inherit; font-size: 12px; padding: 3px 12px;
}
.ston-seg button:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.15)); }
.ston-seg button.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.ston-modes button { font-weight: 600; }

/* overview / landing page */
.ston-overview { padding: 6px 0 40px; max-width: 920px; }
.ov-hero { display: flex; align-items: center; gap: 18px; padding: 22px 24px 10px; }
.ov-icon {
  flex: 0 0 auto; width: 66px; height: 66px; border-radius: 15px;
  display: flex; align-items: center; justify-content: center;
  font-size: 30px; font-weight: 800; color: var(--vscode-button-foreground);
  background: linear-gradient(135deg, var(--vscode-button-background), var(--vscode-textLink-foreground));
  box-shadow: 0 2px 8px rgba(0,0,0,.25);
}
.ov-headings { flex: 1 1 auto; min-width: 0; }
.ov-title { font-size: 22px; font-weight: 700; }
.ov-version { color: var(--vscode-descriptionForeground); margin-top: 3px; }
.ov-edit {
  flex: 0 0 auto; align-self: center;
  display: inline-flex; align-items: center; gap: 6px;
  cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 600;
  color: var(--vscode-button-foreground); background: var(--vscode-button-background);
  border: 1px solid var(--vscode-button-border, transparent); border-radius: 5px; padding: 6px 14px;
}
.ov-edit:hover { background: var(--vscode-button-hoverBackground, var(--vscode-button-background)); }
.ov-edit:active { transform: translateY(0.5px); }
.ov-edit:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
.ov-edit svg { width: 14px; height: 14px; fill: currentColor; opacity: .95; }
.ov-cards { display: flex; flex-wrap: wrap; gap: 16px; padding: 14px 24px; }
.ov-card {
  flex: 1 1 340px; min-width: 280px;
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.22));
  border-radius: 10px; overflow: hidden; background: var(--vscode-editor-background);
}
.ov-card-head {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-weight: 600;
  background: var(--vscode-sideBarSectionHeader-background, rgba(128,128,128,.08));
  border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,.22));
}
.ov-count {
  margin-left: auto; font-size: 11px;
  background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
  border-radius: 9px; min-width: 18px; text-align: center; padding: 0 7px;
}
.ov-empty { padding: 12px 14px; color: var(--vscode-descriptionForeground); font-style: italic; }
.ov-dep { display: flex; align-items: baseline; gap: 10px; padding: 6px 14px; }
.ov-dep + .ov-dep { border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,.1)); }
.ov-dep-name { font-weight: 600; }
.ov-dep-repo { flex: 1 1 auto; min-width: 0; color: var(--vscode-descriptionForeground); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-dep-rule { flex: 0 0 auto; font-family: var(--vscode-editor-font-family), monospace; font-size: 11px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 4px; padding: 1px 7px; }
.ov-hist { padding: 7px 14px; }
.ov-hist + .ov-hist { border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,.1)); }
.ov-hist-top { display: flex; align-items: baseline; gap: 10px; }
.ov-hist-subject { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-hist-hash { flex: 0 0 auto; font-family: var(--vscode-editor-font-family), monospace; font-size: 11px; color: var(--vscode-textLink-foreground); }
.ov-hist-meta { display: block; color: var(--vscode-descriptionForeground); font-size: 11px; margin-top: 2px; }

/* connection card + status */
.ston-conn-row { display: flex; align-items: center; gap: 9px; padding: 8px 14px; }
.ston-conn-row.status { padding-top: 0; }
.ston-conn-row + .ston-conn-row { border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,.1)); }
.ston-dot { flex: 0 0 auto; width: 9px; height: 9px; border-radius: 50%; }
.ston-dot.on { background: var(--vscode-testing-iconPassed, #3fb950); box-shadow: 0 0 5px var(--vscode-testing-iconPassed, #3fb950); }
.ston-dot.off { background: var(--vscode-descriptionForeground); opacity: .5; }
.ston-conn-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.ston-conn-status { flex: 1 1 auto; color: var(--vscode-descriptionForeground); }
.ston-conn-status.insync { color: var(--vscode-testing-iconPassed, #3fb950); }
.ston-conn-status.drift { color: var(--vscode-editorWarning-foreground, #cca700); }
.ston-conn-btn {
  flex: 0 0 auto; cursor: pointer; font-family: inherit; font-size: .95em;
  color: var(--vscode-button-foreground); background: var(--vscode-button-background);
  border: none; border-radius: 5px; padding: 3px 12px;
}
.ston-conn-btn:hover { background: var(--vscode-button-hoverBackground, var(--vscode-button-background)); }
.ston-conn-btn.ghost { color: var(--vscode-textLink-foreground); background: transparent; border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.4)); }
.ston-conn-btn.ghost:hover { background: var(--vscode-list-hoverBackground); }
.ston-conn-chip {
  display: inline-flex; align-items: center; gap: 7px; flex: 0 0 auto;
  cursor: pointer; font-family: inherit; font-size: 12px;
  color: var(--vscode-foreground); background: transparent;
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.35)); border-radius: 6px; padding: 3px 10px;
  max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ston-conn-chip:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.15)); }
.ston-group {
  margin: 14px 16px;
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.22));
  border-radius: 8px;
  overflow: hidden;
  background: var(--vscode-editor-background);
}
.ston-group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  background: var(--vscode-sideBarSectionHeader-background, rgba(128,128,128,.08));
  border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,.22));
  cursor: pointer;
  list-style: none;
  user-select: none;
}
.ston-group-head::-webkit-details-marker { display: none; }
.ston-group-head::before {
  content: ''; flex: 0 0 auto;
  border-style: solid; border-width: 4px 0 4px 6px;
  border-color: transparent transparent transparent var(--vscode-descriptionForeground);
  transition: transform .12s;
}
details[open] > .ston-group-head::before { transform: rotate(90deg); }
details:not([open]) > .ston-group-head { border-bottom: none; }
.ston-group-title { font-weight: 600; font-size: 12px; }
.ston-path {
  margin-left: auto;
  background: transparent; border: none; padding: 0;
  cursor: pointer; font-family: inherit; font-size: 11px;
  color: var(--vscode-textLink-foreground);
}
.ston-path:hover { text-decoration: underline; color: var(--vscode-textLink-activeForeground); }
.ston-group-body { padding: 2px 0; }

.ston-row { display: flex; align-items: center; gap: 14px; padding: 4px 14px; min-height: 28px; }
.ston-row + .ston-row { border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,.10)); }
.ston-row:hover { background: var(--vscode-list-hoverBackground); }
.ston-label { flex: 0 0 38%; max-width: 300px; display: flex; align-items: center; min-width: 0; }
.ston-key {
  color: var(--vscode-symbolIcon-propertyForeground, var(--vscode-foreground));
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ston-field { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 8px; }

/* values read as plain text until you interact — Xcode-style inline editing */
.ston-input {
  flex: 1 1 auto; min-width: 0; box-sizing: border-box;
  background: transparent; border: 1px solid transparent; border-radius: 5px;
  padding: 3px 7px; color: var(--vscode-foreground);
  font-family: inherit; font-size: inherit;
}
.ston-input:hover { border-color: var(--vscode-input-border, var(--vscode-widget-border)); background: var(--vscode-input-background); }
.ston-input:focus { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-color: var(--vscode-focusBorder); outline: none; }
.ston-input-number { font-variant-numeric: tabular-nums; }
.ston-select { cursor: pointer; }
.ston-toggle { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.ston-toggle span { color: var(--vscode-descriptionForeground); }
.ston-nil, .ston-empty { color: var(--vscode-descriptionForeground); font-style: italic; padding-left: 7px; }

/* nested maps → sub-section with heading + indent rule */
.ston-subtitle {
  display: flex; align-items: center;
  padding: 7px 14px 3px;
  font-size: 11px; font-weight: 600;
  color: var(--vscode-descriptionForeground);
}
.ston-indent { margin: 0 14px 6px; padding-left: 12px; border-left: 2px solid var(--vscode-widget-border, rgba(128,128,128,.2)); }
.ston-indent .ston-row { padding-left: 6px; }

.ston-array { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 0; }
.ston-chip { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 5px; padding: 1px 8px; font-size: .92em; }
.ston-chip-symbol { font-family: var(--vscode-editor-font-family), monospace; }

/* per-key info dot + hover tooltip */
.ston-help { position: relative; display: inline-flex; margin-left: 7px; cursor: help; }
.ston-help-dot {
  display: inline-flex; align-items: center; justify-content: center;
  width: 13px; height: 13px; border-radius: 50%;
  font-family: Georgia, 'Times New Roman', serif; font-size: 9px; font-weight: 700; font-style: italic;
  color: var(--vscode-descriptionForeground);
  border: 1px solid var(--vscode-descriptionForeground);
  opacity: .5;
}
.ston-help:hover .ston-help-dot, .ston-help:focus .ston-help-dot {
  opacity: 1; color: var(--vscode-textLink-foreground); border-color: var(--vscode-textLink-foreground);
}
.ston-tip {
  display: none; position: absolute; left: -4px; top: 20px; z-index: 30;
  width: max-content; max-width: 320px;
  background: var(--vscode-editorHoverWidget-background);
  color: var(--vscode-editorHoverWidget-foreground);
  border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-widget-border));
  border-radius: 6px; padding: 8px 11px;
  box-shadow: 0 3px 10px rgba(0,0,0,.35);
  font-weight: 400; font-size: 12px; line-height: 1.45;
  letter-spacing: 0; text-transform: none; white-space: normal;
}
.ston-help:hover .ston-tip, .ston-help:focus .ston-tip { display: block; }
.ston-tip-opts { margin-top: 6px; color: var(--vscode-descriptionForeground); }
.ston-tip-opts code {
  background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15));
  padding: 0 4px; border-radius: 3px; font-family: var(--vscode-editor-font-family), monospace;
}

/* Swift-PM-style package dependencies */
.ston-dep-count {
  margin-left: auto; flex: 0 0 auto;
  font-size: 11px; color: var(--vscode-badge-foreground);
  background: var(--vscode-badge-background); border-radius: 9px;
  min-width: 18px; text-align: center; padding: 0 7px;
}
.ston-deps { padding: 3px 0; }
.ston-dep { display: flex; align-items: center; gap: 12px; padding: 5px 14px; }
.ston-dep + .ston-dep { border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,.1)); }
.ston-dep:hover { background: var(--vscode-list-hoverBackground); }
.ston-dep-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.ston-dep-name { font-weight: 600; }
.ston-dep-repo {
  font-size: 11px; color: var(--vscode-descriptionForeground);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ston-dep-rule {
  flex: 0 0 auto; font-size: 11px;
  background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
  border-radius: 4px; padding: 1px 8px;
  font-family: var(--vscode-editor-font-family), monospace;
}
.ston-dep-remove {
  flex: 0 0 auto; cursor: pointer;
  background: transparent; border: none; border-radius: 4px;
  color: var(--vscode-descriptionForeground); font-size: 12px; padding: 2px 7px;
  opacity: 0; transition: opacity .1s;
}
.ston-dep:hover .ston-dep-remove, .ston-dep-remove:focus { opacity: 1; }
.ston-dep-remove:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.2)); color: var(--vscode-errorForeground); }
.ston-dep-recipe {
  flex: 0 0 auto; cursor: pointer;
  background: transparent; border: none; border-radius: 4px;
  color: var(--vscode-descriptionForeground);
  font-family: var(--vscode-editor-font-family), monospace; font-size: 12px; padding: 2px 6px;
  opacity: 0; transition: opacity .1s;
}
.ston-dep:hover .ston-dep-recipe, .ston-dep-recipe:focus { opacity: 1; }
.ston-dep-recipe:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.2)); color: var(--vscode-textLink-foreground); }
.ston-dep-empty { padding: 8px 14px; color: var(--vscode-descriptionForeground); font-style: italic; }
.ston-dep-addrow { padding: 7px 14px 9px; }
.ston-dep-add {
  width: 100%; text-align: left; cursor: pointer;
  font-family: inherit; font-size: inherit;
  color: var(--vscode-textLink-foreground); background: transparent;
  border: 1px dashed var(--vscode-widget-border, rgba(128,128,128,.5)); border-radius: 5px;
  padding: 5px 12px;
}
.ston-dep-add:hover { background: var(--vscode-list-hoverBackground); border-style: solid; }

.ston-error { padding: 12px 14px; color: var(--vscode-errorForeground); }
.ston-error code { font-family: var(--vscode-editor-font-family), monospace; }

/* "default" / marker pills */
.ston-tag {
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.4));
  border-radius: 3px; padding: 0 5px; opacity: .85;
}

/* available-but-unset section */
.ston-avail-head {
  padding: 11px 14px 4px; margin-top: 4px;
  font-size: 11px; font-weight: 600;
  color: var(--vscode-descriptionForeground);
  border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,.2));
}
.ston-row-unset .ston-default-val {
  flex: 1 1 auto; padding-left: 7px;
  color: var(--vscode-descriptionForeground); font-style: italic;
}
.ston-not-set { opacity: .7; }
.ston-required {
  color: var(--vscode-editorWarning-foreground, #cca700);
  font-weight: 600; text-transform: none;
}
.ston-set {
  flex: 0 0 auto; cursor: pointer; font-family: inherit; font-size: .9em;
  color: var(--vscode-textLink-foreground);
  background: transparent;
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.4)); border-radius: 4px;
  padding: 1px 10px; opacity: 0; transition: opacity .1s;
}
.ston-row-unset:hover .ston-set, .ston-set:focus { opacity: 1; }
.ston-set:hover { background: var(--vscode-button-secondaryBackground, rgba(128,128,128,.16)); }

/* validation warnings */
.ston-row-warn { box-shadow: inset 2px 0 0 var(--vscode-editorWarning-foreground, #cca700); }
.ston-warn { position: relative; display: inline-flex; flex: 0 0 auto; cursor: help; }
.ston-warn-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 15px; height: 15px; border-radius: 3px;
  background: var(--vscode-editorWarning-foreground, #cca700);
  color: var(--vscode-editor-background, #1e1e1e);
  font-weight: 800; font-size: 11px; line-height: 1;
}
.ston-tip-warn { left: auto; right: 0; border-color: var(--vscode-editorWarning-foreground, #cca700); }
.ston-warn:hover .ston-tip, .ston-warn:focus .ston-tip { display: block; }
`;
