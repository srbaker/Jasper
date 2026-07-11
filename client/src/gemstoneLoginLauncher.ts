// GemStone Login Launcher — a Run-and-Debug-style selector pinned to the top of
// the GemStone sidebar. Every configured login (across every known database) is
// listed in one dropdown, grouped by database; the most-recently-used login is
// the default. A green ▶ connects; when the selected login has a live session,
// ▶ becomes a disconnect.
//
// This is the first sidebar *WebviewView* in the extension (all other views are
// trees; rich webviews are editor panels). It follows the same conventions as
// the editor-panel webviews — strict CSP, inline styles in the host HTML,
// behavior in a companion .js read at module load — but resolves a
// WebviewViewProvider instead of creating a panel.
//
// Like the Manager, it is a coordinate surface: connect/disconnect reuse the
// existing gemstone.login / gemstone.sessionLogout commands (inheriting their
// password prompts, GCI resolution, and per-session cleanup).

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

import { LoginStorage } from './loginStorage';
import { SessionManager } from './sessionManager';
import { GemStoneLogin, loginLabel, sameLoginTarget } from './loginTypes';

const launcherJs = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'gemstoneLoginLauncher.js'),
  'utf8',
);

const MRU_KEY = 'gemstone.launcher.mruLogin';

export interface LoginLauncherDeps {
  storage: LoginStorage;
  sessionManager: SessionManager;
  globalState: vscode.Memento;
}

// ── Wire types shared with gemstoneLoginLauncher.js ─────────────────────────

interface LauncherLogin {
  id: string;
  who: string;
  where: string;
  stone: string;
  version: string;
  host: string;
  connected: boolean;
}

interface LoginGroup {
  db: string;
  logins: LauncherLogin[];
}

interface LauncherState {
  groups: LoginGroup[];
  selectedId?: string;
  mruId?: string;
  hasLogins: boolean;
  /** The selected login, flattened for the header. */
  selected?: LauncherLogin;
}

type Inbound =
  | { command: 'ready' }
  | { command: 'select'; id: string }
  | { command: 'connect'; id: string }
  | { command: 'disconnect'; id: string }
  | { command: 'addLogin' };

export class GemstoneLoginLauncherProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'gemstoneLoginLauncher';

  private view?: vscode.WebviewView;
  private selectedId?: string;

  constructor(private readonly deps: LoginLauncherDeps) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.html = this.getHtml();
    view.webview.onDidReceiveMessage((msg: Inbound) => void this.handleMessage(msg));
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
    this.post();
  }

  /** Re-render (called when sessions or the configured login list change). */
  refresh(): void {
    this.post();
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  private async handleMessage(msg: Inbound): Promise<void> {
    switch (msg.command) {
      case 'ready':
        this.post();
        return;
      case 'select':
        this.selectedId = msg.id;
        this.post();
        return;
      case 'connect': {
        const login = this.findLogin(msg.id);
        if (!login) return;
        this.selectedId = msg.id;
        // Record the intent as most-recently-used so it is the default next time.
        await this.deps.globalState.update(MRU_KEY, msg.id);
        await vscode.commands.executeCommand('gemstone.login', { login });
        this.post();
        return;
      }
      case 'disconnect': {
        const session = this.sessionForId(msg.id);
        if (!session) return;
        await vscode.commands.executeCommand('gemstone.sessionLogout', { activeSession: session });
        this.post();
        return;
      }
      case 'addLogin':
        await vscode.commands.executeCommand('gemstone.addLogin');
        this.post();
        return;
    }
  }

  private findLogin(id: string): GemStoneLogin | undefined {
    return this.deps.storage.getLogins().find((l) => loginLabel(l) === id);
  }

  private sessionForId(id: string) {
    const login = this.findLogin(id);
    if (!login) return undefined;
    return this.deps.sessionManager.getSessions().find((s) => sameLoginTarget(s.login, login));
  }

  // ── State ─────────────────────────────────────────────────────────────────

  private post(): void {
    if (!this.view) return;
    this.view.webview.postMessage({ command: 'state', state: this.buildState() });
  }

  private buildState(): LauncherState {
    const logins = this.deps.storage.getLogins();
    const sessions = this.deps.sessionManager.getSessions();

    const flat: LauncherLogin[] = logins.map((l) => ({
      id: loginLabel(l),
      who: l.gs_user,
      where: `on ${l.stone}`,
      stone: l.stone,
      version: l.version,
      host: l.gem_host,
      connected: sessions.some((s) => sameLoginTarget(s.login, l)),
    }));

    // Default selection: keep a valid manual pick; otherwise prefer a connected
    // login, then the most-recently-used, then the first configured login.
    const mruId = this.deps.globalState.get<string>(MRU_KEY);
    if (!this.selectedId || !flat.some((f) => f.id === this.selectedId)) {
      const connected = flat.find((f) => f.connected);
      const mru = flat.find((f) => f.id === mruId);
      this.selectedId = connected?.id ?? mru?.id ?? flat[0]?.id;
    }

    // Group by database (stone + version), preserving first-seen order.
    const groups: LoginGroup[] = [];
    for (const f of flat) {
      const db = `${f.stone} — ${f.version}`;
      let group = groups.find((g) => g.db === db);
      if (!group) {
        group = { db, logins: [] };
        groups.push(group);
      }
      group.logins.push(f);
    }

    return {
      groups,
      selectedId: this.selectedId,
      mruId: flat.some((f) => f.id === mruId) ? mruId : undefined,
      hasLogins: flat.length > 0,
      selected: flat.find((f) => f.id === this.selectedId),
    };
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
  <style>${CSS}</style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">${launcherJs}</script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    GemstoneLoginLauncher.init(document.getElementById('root'), vscode);
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
  }
}

const CSS = `
* { box-sizing: border-box; }
body {
  margin: 0; padding: 8px 10px 12px;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size, 13px);
  color: var(--vscode-foreground, #ccc);
}
.launch-row { display: flex; align-items: center; gap: 6px; }
.select {
  flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 8px; cursor: pointer;
  border: 1px solid var(--vscode-dropdown-border, var(--vscode-widget-border, rgba(128,128,128,.35)));
  border-radius: 5px; padding: 4px 8px;
  background: var(--vscode-dropdown-background, var(--vscode-input-background, #2b2b2b));
  color: var(--vscode-dropdown-foreground, var(--vscode-foreground, #ccc));
}
.select:hover { border-color: var(--vscode-focusBorder, #007fd4); }
.select .lead { flex: none; display: inline-flex; color: var(--vscode-descriptionForeground, #9d9d9d); }
.select .lead.on { color: var(--vscode-testing-iconPassed, #2ea043); }
.select .lead svg { width: 13px; height: 13px; }
.select .label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.select .who { font-weight: 600; }
.select .where { color: var(--vscode-descriptionForeground, #9d9d9d); }
.select .caret { flex: none; color: var(--vscode-descriptionForeground, #9d9d9d); }
.select .caret svg { width: 11px; height: 11px; }
.iconbtn {
  flex: none; width: 28px; height: 28px; border-radius: 5px; cursor: pointer; border: 1px solid transparent;
  display: inline-flex; align-items: center; justify-content: center; background: transparent;
  color: var(--vscode-icon-foreground, var(--vscode-foreground, #ccc));
}
.iconbtn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.16)); }
.iconbtn svg { width: 16px; height: 16px; }
.iconbtn.play { color: var(--vscode-debugIcon-startForeground, var(--vscode-testing-iconPassed, #2ea043)); }
.iconbtn.stop { color: var(--vscode-debugIcon-stopForeground, var(--vscode-errorForeground, #f14c4c)); }

.status { font-size: 11px; color: var(--vscode-descriptionForeground, #9d9d9d); margin: 7px 2px 0; display: flex; align-items: center; gap: 6px; }
.status .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--vscode-descriptionForeground, #777); }
.status .dot.on { background: var(--vscode-testing-iconPassed, #2ea043); }

.empty { font-size: 12px; color: var(--vscode-descriptionForeground, #9d9d9d); padding: 4px 2px; line-height: 1.5; }
.linkbtn { color: var(--vscode-textLink-foreground, #3794ff); cursor: pointer; }
.linkbtn:hover { text-decoration: underline; }

/* Dropdown */
.menu {
  position: absolute; left: 10px; right: 44px; margin-top: 4px; z-index: 30;
  background: var(--vscode-dropdown-background, var(--vscode-editorWidget-background, #252526));
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.35));
  border-radius: 6px; overflow: hidden; box-shadow: 0 4px 18px rgba(0,0,0,.4);
}
.menu[hidden] { display: none; }
.menu-group {
  font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase;
  color: var(--vscode-descriptionForeground, #9d9d9d); padding: 8px 12px 4px;
}
.menu-item { display: flex; align-items: center; gap: 8px; padding: 5px 12px; cursor: pointer; }
.menu-item:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.12)); }
.menu-item.sel { background: var(--vscode-list-activeSelectionBackground, rgba(0,120,212,.3)); color: var(--vscode-list-activeSelectionForeground, inherit); }
.menu-item .mi-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: transparent; }
.menu-item .mi-dot.on { background: var(--vscode-testing-iconPassed, #2ea043); }
.menu-item .mi-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-item .mi-recent { flex: none; font-size: 10px; font-weight: 600; color: var(--vscode-testing-iconPassed, #2ea043); }
.menu-sep { border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,.25)); }
.menu-item.add { color: var(--vscode-textLink-foreground, #3794ff); }
.menu-item.add svg { width: 13px; height: 13px; }
`;
