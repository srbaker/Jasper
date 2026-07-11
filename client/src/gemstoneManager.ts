// GemStone Manager — a single, consolidated editor-tab webview that manages the
// GemStone environment: OS prerequisites, installed/available versions, and
// databases. It is a *read/coordinate* surface: it renders live state pulled
// directly from the sysadmin managers, and every mutating action is delegated
// to the existing `gemstone.*` commands (so it inherits their confirmation
// modals, progress notifications, and sidebar-tree refreshes for free).
//
// Follows the webview conventions established in enhancedInspector.ts /
// debuggerPanel.ts: createWebviewPanel with a strict CSP, all styles inline in
// the host HTML, all behavior in a companion gemstoneManager.js read at module
// load and injected as a nonce'd <script>. It takes a dependency bag rather
// than importing extension.ts, to avoid a circular import (same pattern as
// stonEditor.ts).

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

import { SysadminStorage } from './sysadminStorage';
import { VersionManager } from './versionManager';
import { ProcessManager } from './processManager';
import { getSharedMemory } from './sharedMemoryTreeProvider';
import { GemStoneVersion, GemStoneDatabase } from './sysadminTypes';

const gemstoneManagerJs = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'gemstoneManager.js'),
  'utf8',
);

/**
 * The managers this panel reads from. Actions are dispatched through the
 * existing `gemstone.*` commands, so no action methods are needed here.
 */
export interface GemstoneManagerDeps {
  storage: SysadminStorage;
  versionManager: VersionManager;
  processManager: ProcessManager;
}

// ── Wire types shared with gemstoneManager.js ───────────────────────────────

interface OsStatus {
  /** Whether this platform surfaces OS prerequisites at all. */
  supported: boolean;
  platformLabel: string;
  sharedMemoryConfigured: boolean;
  /** e.g. "2.0" or "≥ 1" or "0" — mirrors the Configure OS tree label. */
  gbLabel: string;
  shmmaxBytes?: number;
  shmallBytes?: number;
  /** True when shared memory could not be read (e.g. WSL unavailable). */
  unknown: boolean;
}

interface VersionRow {
  version: string;
  fileName: string;
  size: number;
  date: string;
  downloaded: boolean;
  extracted: boolean;
  local?: boolean;
  bundled?: boolean;
}

interface DatabaseRow {
  dirName: string;
  version: string;
  stoneName: string;
  ldiName: string;
  baseExtent: string;
  stoneRunning: boolean;
  netldiRunning: boolean;
}

interface ManagerState {
  platform: string;
  rootPath: string;
  os: OsStatus;
  versions: VersionRow[];
  databases: DatabaseRow[];
}

type Inbound =
  | { command: 'ready' }
  | { command: 'refresh' }
  | { command: 'downloadVersion'; version: string }
  | { command: 'extractVersion'; version: string }
  | { command: 'deleteDownload'; version: string }
  | { command: 'uninstallVersion'; version: string }
  | { command: 'unregisterLocalVersion'; version: string }
  | { command: 'openVersionFolder'; version: string }
  | { command: 'registerLocalVersion' }
  | { command: 'createDatabase' }
  | { command: 'deleteDatabase'; dirName: string }
  | { command: 'startStone'; dirName: string }
  | { command: 'stopStone'; dirName: string }
  | { command: 'startNetldi'; dirName: string }
  | { command: 'stopNetldi'; dirName: string }
  | { command: 'replaceExtent'; dirName: string }
  | { command: 'openDbTerminal'; dirName: string }
  | { command: 'openDbInFinder'; dirName: string }
  | { command: 'createLoginFromDb'; dirName: string }
  | { command: 'quickSetup' }
  | { command: 'configureOs' };

export class GemstoneManagerPanel {
  static readonly viewType = 'gemstoneManager';
  private static current: GemstoneManagerPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private lastVersions: GemStoneVersion[] = [];
  private lastDatabases: GemStoneDatabase[] = [];

  /** Open the manager, revealing the existing panel if one is already open. */
  static show(deps: GemstoneManagerDeps): void {
    if (GemstoneManagerPanel.current) {
      GemstoneManagerPanel.current.panel.reveal();
      void GemstoneManagerPanel.current.postState();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      GemstoneManagerPanel.viewType,
      'GemStone Manager',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
    );
    GemstoneManagerPanel.current = new GemstoneManagerPanel(panel, deps);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly deps: GemstoneManagerDeps,
  ) {
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: Inbound) => void this.handleMessage(msg),
      null,
      this.disposables,
    );
  }

  private dispose(): void {
    if (GemstoneManagerPanel.current === this) {
      GemstoneManagerPanel.current = undefined;
    }
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  // ── Message handling ──────────────────────────────────────────────────────

  private async handleMessage(msg: Inbound): Promise<void> {
    switch (msg.command) {
      case 'ready':
      case 'refresh':
        await this.postState();
        return;

      // Versions — reuse the existing commands, passing a synthetic VersionItem
      // ({ version }) since those handlers only read `item.version`.
      case 'downloadVersion':
        await this.runVersionCommand('gemstone.downloadVersion', msg.version);
        return;
      case 'extractVersion':
        await this.runVersionCommand('gemstone.extractVersion', msg.version);
        return;
      case 'deleteDownload':
        await this.runVersionCommand('gemstone.deleteDownload', msg.version);
        return;
      case 'uninstallVersion':
        await this.runVersionCommand('gemstone.deleteExtracted', msg.version);
        return;
      case 'unregisterLocalVersion':
        await this.runVersionCommand('gemstone.unregisterLocalVersion', msg.version);
        return;
      case 'openVersionFolder':
        await this.runVersionCommand('gemstone.openVersionFolder', msg.version);
        return;
      case 'registerLocalVersion':
        await vscode.commands.executeCommand('gemstone.registerLocalVersion');
        await this.postState();
        return;

      // Databases — reuse the existing commands with a synthetic DatabaseNode.
      case 'createDatabase':
        await vscode.commands.executeCommand('gemstone.createDatabase');
        await this.postState();
        return;
      case 'deleteDatabase':
        await this.runDbCommand('gemstone.deleteDatabase', msg.dirName, 'database');
        return;
      case 'startStone':
        await this.runDbCommand('gemstone.startStone', msg.dirName, 'stone');
        return;
      case 'stopStone':
        await this.runDbCommand('gemstone.stopStone', msg.dirName, 'stone');
        return;
      case 'startNetldi':
        await this.runDbCommand('gemstone.startNetldi', msg.dirName, 'netldi');
        return;
      case 'stopNetldi':
        await this.runDbCommand('gemstone.stopNetldi', msg.dirName, 'netldi');
        return;
      case 'replaceExtent':
        await this.runDbCommand('gemstone.replaceExtent', msg.dirName, 'stone');
        return;
      case 'openDbTerminal':
        await this.runDbCommand('gemstone.openDbTerminal', msg.dirName, 'database', false);
        return;
      case 'openDbInFinder':
        await this.runDbCommand('gemstone.openDbInFinder', msg.dirName, 'database', false);
        return;
      case 'createLoginFromDb':
        await this.runDbCommand('gemstone.createLoginFromDb', msg.dirName, 'database', false);
        return;

      // OS prerequisites.
      case 'quickSetup':
        await vscode.commands.executeCommand('gemstone.quickSetup');
        await this.postState();
        return;
      case 'configureOs':
        await vscode.commands.executeCommand('gemstoneSharedMemory.focus');
        return;
    }
  }

  private async runVersionCommand(command: string, version: string): Promise<void> {
    const v = this.lastVersions.find((x) => x.version === version);
    if (!v) return;
    await vscode.commands.executeCommand(command, { version: v });
    await this.postState();
  }

  private async runDbCommand(
    command: string,
    dirName: string,
    kind: 'database' | 'stone' | 'netldi',
    refresh = true,
  ): Promise<void> {
    const db = this.lastDatabases.find((d) => d.dirName === dirName);
    if (!db) return;
    await vscode.commands.executeCommand(command, { kind, db });
    if (refresh) await this.postState();
  }

  // ── State ─────────────────────────────────────────────────────────────────

  private async postState(): Promise<void> {
    this.panel.webview.postMessage({ command: 'loading' });
    const state = await this.buildState();
    this.panel.webview.postMessage({ command: 'state', state });
  }

  private async buildState(): Promise<ManagerState> {
    const [os, versions] = await Promise.all([this.buildOsStatus(), this.buildVersions()]);

    this.deps.processManager.refreshProcesses();
    const dbs = this.deps.storage.getDatabases();
    this.lastDatabases = dbs;
    const databases: DatabaseRow[] = dbs.map((db) => ({
      dirName: db.dirName,
      version: db.config.version,
      stoneName: db.config.stoneName,
      ldiName: db.config.ldiName,
      baseExtent: db.config.baseExtent,
      stoneRunning: this.deps.processManager.isStoneRunning(db.config.stoneName, db.config.version),
      netldiRunning: this.deps.processManager.isNetldiRunning(db.config.ldiName, db.config.version),
    }));

    return {
      platform: this.deps.storage.getPlatformKey() ?? process.platform,
      rootPath: this.deps.storage.getRootPath(),
      os,
      versions,
      databases,
    };
  }

  private async buildOsStatus(): Promise<OsStatus> {
    const supported =
      process.platform === 'linux' || process.platform === 'darwin' || process.platform === 'win32';
    const platformLabel =
      process.platform === 'darwin'
        ? 'macOS'
        : process.platform === 'win32'
          ? 'Windows (WSL)'
          : 'Linux';

    let mem: { shmmax: number; shmall: number } | undefined;
    try {
      mem = await getSharedMemory();
    } catch {
      mem = undefined;
    }
    if (!mem) {
      return {
        supported,
        platformLabel,
        sharedMemoryConfigured: false,
        gbLabel: '0',
        unknown: true,
      };
    }
    // Mirrors OsConfigTreeProvider's shared-memory computation exactly.
    const shmmaxGb = mem.shmmax / Math.pow(2, 30);
    const shmallGb = mem.shmall / Math.pow(2, 18);
    const minGb = Math.min(shmmaxGb, shmallGb);
    const configured = shmmaxGb >= 1 && shmallGb >= 1;
    const gbLabel = minGb > 1024 ? '≥ 1' : String(Math.round(minGb * 10) / 10);
    return {
      supported,
      platformLabel,
      sharedMemoryConfigured: configured,
      gbLabel,
      shmmaxBytes: mem.shmmax,
      shmallBytes: mem.shmall,
      unknown: false,
    };
  }

  private async buildVersions(): Promise<VersionRow[]> {
    let list: GemStoneVersion[];
    try {
      list = await this.deps.versionManager.fetchAvailableVersions();
    } catch {
      // Offline: fall back to what's installed / downloaded on disk so the
      // panel still manages local versions when the download catalog is
      // unreachable.
      list = this.installedOnlyVersions();
    }
    this.lastVersions = list;
    return list.map((v) => ({
      version: v.version,
      fileName: v.fileName,
      size: v.size,
      date: v.date,
      downloaded: v.downloaded,
      extracted: v.extracted,
      local: v.local,
      bundled: v.bundled,
    }));
  }

  private installedOnlyVersions(): GemStoneVersion[] {
    const infos = this.deps.storage.getExtractedVersionInfos(true);
    return infos.map((info) => ({
      version: info.version,
      fileName: '',
      url: '',
      size: 0,
      date: '',
      downloaded: false,
      extracted: true,
      local: info.isLocal,
    }));
  }

  // ── HTML ──────────────────────────────────────────────────────────────────

  private getHtml(): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>GemStone Manager</title>
  <style>${CSS}</style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-title">
      <span class="topbar-mark">GS</span>
      <div>
        <div class="topbar-name">GemStone Manager</div>
        <div class="topbar-root" id="rootPath"></div>
      </div>
    </div>
    <button class="btn btn-ghost" id="refreshAll" title="Refresh">
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.451 5.609l-.579-.939-1.068.812-.076.094c-.335.415-.927 1.341-1.124 2.876l-.021.165.033.163.071.345c.03.15.045.302.045.455 0 1.307-1.061 2.371-2.371 2.371-.777 0-1.464-.372-1.899-.947l-.66.503C6.354 12.35 7.44 12.997 8.361 12.997c2.117 0 3.837-1.72 3.837-3.837 0-.243-.023-.484-.069-.72l-.043-.211.024-.19c.15-1.169.588-1.87.837-2.183l.043-.052.264.428.53-.83-.955-1.548-.789.507.076.117.005.008zM8.361 3.003c-2.117 0-3.837 1.72-3.837 3.837 0 .243.023.484.069.72l.043.211-.024.19c-.15 1.169-.588 1.87-.837 2.183l-.043.052-.264-.428-.53.83.955 1.548.789-.507-.076-.117-.005-.008.579.939 1.068-.812.076-.094c.335-.415.927-1.341 1.124-2.876l.021-.165-.033-.163-.071-.345a2.386 2.386 0 0 1-.045-.455c0-1.307 1.061-2.371 2.371-2.371.777 0 1.464.372 1.899.947l.66-.503C10.368 3.65 9.282 3.003 8.361 3.003z"/></svg>
      <span>Refresh</span>
    </button>
  </header>
  <main id="root" class="content" aria-busy="false"></main>
  <script nonce="${nonce}">${gemstoneManagerJs}</script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    GemstoneManager.init(
      { root: document.getElementById('root'), rootPath: document.getElementById('rootPath'), refreshAll: document.getElementById('refreshAll') },
      vscode,
    );
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
  }
}

// Styles live in the host (convention: styling in the host <style>, behavior in
// the companion .js). Uses --vscode-* theme variables with rgba fallbacks.
const CSS = `
:root { --gm-warn: var(--vscode-editorWarning-foreground, #cca700); --gm-ok: var(--vscode-testing-iconPassed, #2ea043); }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size, 13px);
  color: var(--vscode-editor-foreground, #ccc);
  background: var(--vscode-editor-background, #1e1e1e);
}
.topbar {
  position: sticky; top: 0; z-index: 5;
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 12px 20px;
  background: var(--vscode-editor-background, #1e1e1e);
  border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,.22));
}
.topbar-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.topbar-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 7px; flex: none;
  font-weight: 700; font-size: 12px; letter-spacing: .5px;
  color: var(--vscode-button-foreground, #fff);
  background: var(--vscode-button-background, #0e639c);
}
.topbar-name { font-size: 15px; font-weight: 600; }
.topbar-root {
  font-family: var(--vscode-editor-font-family, monospace); font-size: 11px;
  color: var(--vscode-descriptionForeground, #9d9d9d);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60vw;
}
.content { padding: 8px 20px 40px; max-width: 1100px; }

/* Sections */
.section { margin: 16px 0; border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.22)); border-radius: 8px; overflow: hidden; }
.section > summary {
  display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none;
  padding: 10px 14px; list-style: none;
  background: var(--vscode-sideBarSectionHeader-background, rgba(128,128,128,.08));
}
.section > summary::-webkit-details-marker { display: none; }
.section > summary::before {
  content: ""; width: 0; height: 0; flex: none;
  border-left: 5px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent;
  transition: transform .12s ease; opacity: .7;
}
.section[open] > summary::before { transform: rotate(90deg); }
.section-title { font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .5px; }
.section-icon { display: inline-flex; opacity: .8; }
.section-icon svg { width: 15px; height: 15px; }
.count-badge {
  font-size: 11px; padding: 1px 7px; border-radius: 10px; font-weight: 600;
  color: var(--vscode-badge-foreground, #fff); background: var(--vscode-badge-background, #4d4d4d);
}
.section-head-actions { margin-left: auto; display: flex; gap: 6px; }
.section-body { padding: 6px 14px 12px; }

/* Buttons */
.btn {
  display: inline-flex; align-items: center; gap: 5px;
  font: inherit; font-size: 12px; line-height: 1;
  padding: 5px 10px; border-radius: 4px; cursor: pointer;
  border: 1px solid transparent; white-space: nowrap;
  color: var(--vscode-button-foreground, #fff); background: var(--vscode-button-background, #0e639c);
}
.btn:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
.btn svg { width: 14px; height: 14px; }
.btn-secondary {
  color: var(--vscode-button-secondaryForeground, #ccc);
  background: var(--vscode-button-secondaryBackground, rgba(128,128,128,.18));
}
.btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,.28)); }
.btn-ghost { color: var(--vscode-foreground, #ccc); background: transparent; border-color: var(--vscode-widget-border, rgba(128,128,128,.28)); }
.btn-ghost:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.16)); }
.btn-danger { color: var(--vscode-errorForeground, #f14c4c); background: transparent; border-color: transparent; }
.btn-danger:hover { background: rgba(241,76,76,.12); }
.btn-sm { padding: 3px 8px; font-size: 11px; }

/* OS card */
.os-grid { display: flex; flex-wrap: wrap; gap: 16px; }
.os-card {
  flex: 1 1 260px; min-width: 240px;
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.18)); border-radius: 8px;
  padding: 14px;
}
.os-card-label { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--vscode-descriptionForeground, #9d9d9d); margin-bottom: 8px; }
.os-status { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
.os-detail { margin-top: 8px; font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; color: var(--vscode-descriptionForeground, #9d9d9d); }
.os-detail div { display: flex; justify-content: space-between; gap: 12px; padding: 1px 0; }

/* Status dot */
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--vscode-descriptionForeground, #777); }
.dot.ok { background: var(--gm-ok); }
.dot.warn { background: var(--gm-warn); }
.dot.off { background: var(--vscode-descriptionForeground, #777); opacity: .55; }

/* Rows (versions + databases) */
.row {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 8px; border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,.14));
}
.row:first-child { border-top: none; }
.row:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.08)); border-radius: 5px; }
.row-warn { box-shadow: inset 2px 0 0 var(--gm-warn); }
.row-main { min-width: 0; flex: 1 1 auto; }
.row-title { display: flex; align-items: center; gap: 8px; }
.mono { font-family: var(--vscode-editor-font-family, monospace); }
.row-name { font-weight: 600; }
.row-sub { font-size: 11px; color: var(--vscode-descriptionForeground, #9d9d9d); margin-top: 2px; display: flex; gap: 10px; flex-wrap: wrap; }
.row-actions { display: flex; align-items: center; gap: 6px; flex: none; }

/* Pills */
.pill { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; padding: 2px 7px; border-radius: 10px; white-space: nowrap; }
.pill-installed { color: var(--gm-ok); background: color-mix(in srgb, var(--gm-ok) 16%, transparent); }
.pill-downloaded { color: var(--vscode-charts-blue, #3794ff); background: color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 16%, transparent); }
.pill-available { color: var(--vscode-descriptionForeground, #9d9d9d); background: rgba(128,128,128,.14); }
.pill-local { color: var(--vscode-charts-purple, #b180d7); background: color-mix(in srgb, var(--vscode-charts-purple, #b180d7) 18%, transparent); }
.pill-bundled { color: var(--vscode-charts-orange, #d18616); background: color-mix(in srgb, var(--vscode-charts-orange, #d18616) 16%, transparent); }

/* Running state chips for databases */
.svc { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; padding: 2px 8px; border-radius: 4px; background: var(--vscode-badge-background, rgba(128,128,128,.14)); }
.svc .svc-label { color: var(--vscode-descriptionForeground, #9d9d9d); }
.svc .svc-state { font-weight: 600; }
.svc .svc-state.on { color: var(--gm-ok); }
.svc .svc-state.offc { color: var(--vscode-descriptionForeground, #9d9d9d); }

/* Empty / note states */
.empty { text-align: center; color: var(--vscode-descriptionForeground, #9d9d9d); padding: 22px 12px; }
.empty .btn { margin-top: 12px; }
.note { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; color: var(--vscode-descriptionForeground, #9d9d9d); padding: 8px 4px; }
.note svg { width: 15px; height: 15px; flex: none; margin-top: 1px; color: var(--gm-warn); }

.content[aria-busy="true"] { opacity: .55; pointer-events: none; }
.skeleton { color: var(--vscode-descriptionForeground, #9d9d9d); padding: 30px 12px; text-align: center; }
`;
