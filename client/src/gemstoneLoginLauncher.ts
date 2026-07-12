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
import { SysadminStorage } from './sysadminStorage';
import { ProcessManager } from './processManager';
import { GemStoneLogin, loginLabel, sameLoginTarget } from './loginTypes';
import { getRecentSessions, recentKey, timeAgo } from './recentSessions';

const launcherJs = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'gemstoneLoginLauncher.js'),
  'utf8',
);

const MRU_KEY = 'gemstone.launcher.mruLogin';

export interface LoginLauncherDeps {
  storage: LoginStorage;
  sessionManager: SessionManager;
  sysadminStorage: SysadminStorage;
  /** Lazy: the ProcessManager is constructed after this provider, so reach it on demand. */
  processManager: () => ProcessManager;
  globalState: vscode.Memento;
}

// ── Wire types shared with gemstoneLoginLauncher.js ─────────────────────────

interface LauncherLogin {
  id: string;
  who: string;
  where: string;
  host: string;
}

/** A live session, shown up top. */
interface LauncherSession {
  id: string; // its login's id
  who: string;
  where: string;
  host: string;
}

/** A local database (the god object) with its status and its idle logins nested. */
interface LauncherDatabase {
  stoneName: string;
  version: string;
  running: boolean;
  logins: LauncherLogin[]; // idle (not-connected) logins for this database
}

/** A past connection target, for one-click reconnect. */
interface LauncherRecent {
  key: string;
  who: string;
  where: string;
  host: string;
  ago: string;
}

interface LauncherState {
  /** Anything at all — else the first-run chooser shows. */
  hasAny: boolean;
  activeSessions: LauncherSession[];
  databases: LauncherDatabase[];
  /** Idle logins with no matching local database (seed of a future Remote group). */
  otherLogins: LauncherLogin[];
  recent: LauncherRecent[];
}

type Inbound =
  | { command: 'ready' }
  | { command: 'connect'; id: string }
  | { command: 'disconnect'; id: string }
  | { command: 'reconnect'; key: string }
  | { command: 'addLogin' }
  | { command: 'addLoginToDb'; stone: string }
  | { command: 'magicStart' }
  | { command: 'setupOptions' }
  | { command: 'connectExisting' };

export class GemstoneLoginLauncherProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'gemstoneLoginLauncher';

  private view?: vscode.WebviewView;

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
      case 'connect': {
        const login = this.findLogin(msg.id);
        if (!login) return;
        // Record the intent as most-recently-used (seed for a future Recent list).
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
      case 'reconnect': {
        const entry = getRecentSessions(this.deps.globalState).find((r) => recentKey(r) === msg.key);
        if (!entry) return;
        // Prefer a saved login for this target (it carries the password/keychain);
        // otherwise connect with the bare target and let gemstone.login prompt.
        const saved = this.deps.storage.getLogins().find((l) => recentKey(l) === msg.key);
        const login: GemStoneLogin = saved ?? {
          label: '', version: entry.version, gem_host: entry.gem_host, stone: entry.stone,
          netldi: entry.netldi, gs_user: entry.gs_user, gs_password: '', host_user: '', host_password: '',
        };
        await vscode.commands.executeCommand('gemstone.login', { login, skipFolderCheck: true });
        this.post();
        return;
      }
      case 'addLogin':
        await vscode.commands.executeCommand('gemstone.addLogin');
        this.post();
        return;
      case 'addLoginToDb':
        // Pre-fill a new login for this database's stone (the +Add on a login-less DB).
        await vscode.commands.executeCommand('gemstone.addLogin', { stone: msg.stone });
        this.post();
        return;
      // First-run chooser (empty Sessions view).
      case 'magicStart':
        await vscode.commands.executeCommand('gemstone.magicStart');
        return;
      case 'setupOptions':
        await vscode.commands.executeCommand('gemstone.setupWithOptions');
        return;
      case 'connectExisting':
        await vscode.commands.executeCommand('gemstone.connectExistingStone');
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
    const dbs = this.deps.sysadminStorage.getDatabases();
    const pm = this.deps.processManager();

    const isLocal = (host: string) => !host || host === 'localhost' || host === '127.0.0.1';
    const connectedOf = (l: GemStoneLogin) => sessions.some((s) => sameLoginTarget(s.login, l));
    const toLogin = (l: GemStoneLogin): LauncherLogin => ({
      id: loginLabel(l),
      who: l.gs_user,
      where: `on ${l.stone}`,
      host: l.gem_host,
    });

    // Live sessions lead.
    const activeSessions: LauncherSession[] = sessions.map((s) => ({
      id: loginLabel(s.login),
      who: s.login.gs_user,
      where: `on ${s.login.stone}`,
      host: s.login.gem_host,
    }));

    // Local databases (god objects): running status + their idle logins nested. A
    // login matches by local host + stone name. Connected logins are claimed here
    // (so they don't fall into "other") but shown up top as active sessions.
    const claimed = new Set<GemStoneLogin>();
    const databases: LauncherDatabase[] = dbs.map((db) => {
      const cfg = db.config;
      const matches = logins.filter((l) => isLocal(l.gem_host) && l.stone === cfg.stoneName);
      matches.forEach((l) => claimed.add(l));
      return {
        stoneName: cfg.stoneName,
        version: cfg.version,
        running: pm.isStoneRunning(cfg.stoneName, cfg.version),
        logins: matches.filter((l) => !connectedOf(l)).map(toLogin),
      };
    });

    // Idle logins with no matching local database.
    const otherLogins = logins
      .filter((l) => !claimed.has(l) && !connectedOf(l))
      .map(toLogin);

    // Recent connection history — quick reconnect, minus anything already live.
    const activeKeys = new Set(sessions.map((s) => recentKey(s.login)));
    const recent: LauncherRecent[] = getRecentSessions(this.deps.globalState)
      .filter((r) => !activeKeys.has(recentKey(r)))
      .slice(0, 5)
      .map((r) => ({
        key: recentKey(r),
        who: r.gs_user,
        where: `on ${r.stone}`,
        host: r.gem_host,
        ago: timeAgo(r.at),
      }));

    return {
      hasAny: sessions.length > 0 || logins.length > 0 || databases.length > 0 || recent.length > 0,
      activeSessions,
      databases,
      otherLogins,
      recent,
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

/* First-run chooser (empty Sessions view) */
.firstrun { padding: 2px; }
.fr-lead { font-size: 12px; color: var(--vscode-descriptionForeground, #9d9d9d); margin: 2px 2px 8px; }
.fr-card {
  display: flex; align-items: flex-start; gap: 9px; width: 100%; text-align: left;
  padding: 9px 10px; margin: 6px 0; border-radius: 6px; cursor: pointer;
  color: var(--vscode-foreground); font: inherit;
  background: var(--vscode-list-hoverBackground, rgba(128,128,128,.08));
  border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.22));
}
.fr-card:hover { background: var(--vscode-list-activeSelectionBackground, rgba(128,128,128,.18)); }
.fr-card.primary {
  background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff);
  border-color: var(--vscode-button-background, #0e639c);
}
.fr-card.primary:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
.fr-icon { flex: none; display: inline-flex; margin-top: 1px; }
.fr-icon svg { width: 17px; height: 17px; }
.fr-text { display: flex; flex-direction: column; gap: 2px; }
.fr-title { font-size: 12.5px; font-weight: 600; }
.fr-sub { font-size: 11px; opacity: .85; line-height: 1.35; }

/* Populated Sessions view: active sessions, databases with nested logins, footer */
.sec { margin: 2px 0 6px; }
.sec-label { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--vscode-descriptionForeground, #9d9d9d); margin: 10px 2px 3px; }
.row { display: flex; align-items: center; gap: 7px; padding: 4px; border-radius: 5px; }
.row:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.08)); }
.row.active { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.10)); }
.rdot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--vscode-descriptionForeground, #777); }
.rdot.on { background: var(--vscode-testing-iconPassed, #2ea043); }
.rlabel { flex: 1 1 auto; min-width: 0; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rlabel .who { font-weight: 600; }
.rlabel .where { color: var(--vscode-descriptionForeground, #9d9d9d); }
.rlabel.muted { color: var(--vscode-descriptionForeground, #9d9d9d); }
.rlabel .ago { color: var(--vscode-descriptionForeground, #9d9d9d); }
.ricon { display: inline-flex; flex: none; color: var(--vscode-descriptionForeground, #9d9d9d); }
.ricon svg { width: 13px; height: 13px; }
.db { margin: 4px 0; }
.db-head { display: flex; align-items: center; gap: 6px; padding: 3px 2px; font-size: 11px; }
.db-name { font-weight: 600; }
.db-ver { color: var(--vscode-descriptionForeground, #9d9d9d); }
.db .row { margin-left: 10px; }
.badge { margin-left: auto; font-size: 10px; padding: 0 6px; border-radius: 999px; color: var(--vscode-descriptionForeground, #9d9d9d); border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.3)); }
.badge.on { color: var(--vscode-testing-iconPassed, #2ea043); border-color: currentColor; }
.footer { display: flex; flex-wrap: wrap; gap: 4px 10px; margin: 12px 2px 2px; padding-top: 8px; border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,.2)); }
.linkact { display: inline-flex; align-items: center; gap: 4px; background: none; border: 0; color: var(--vscode-textLink-foreground, #3794ff); cursor: pointer; font: inherit; font-size: 11px; padding: 2px; }
.linkact:hover { text-decoration: underline; }
.linkact svg { width: 13px; height: 13px; }

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
