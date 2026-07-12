import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { GemStoneLogin, DEFAULT_LOGIN, loginLabel } from './loginTypes';
import { LoginStorage } from './loginStorage';
import { LoginTreeProvider } from './loginTreeProvider';
import { SysadminStorage } from './sysadminStorage';
import { bundledWindowsClientVersions, bundledGciArchSupported } from './bundledGci';
import {
  setLoginPassword,
  getLoginPassword,
  deleteLoginPassword,
} from './loginCredentials';

export class LoginEditorPanel {
  private static currentPanel: LoginEditorPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  /** Collect versions that have a GCI library available */
  private static getAvailableVersions(storage: LoginStorage, sysadminStorage: SysadminStorage): string[] {
    const versionSet = new Set<string>();
    // Extracted versions have GCI libraries in their lib/ directory
    for (const v of sysadminStorage.getExtractedVersions()) {
      versionSet.add(v);
    }
    // Windows client distributions
    if (process.platform === 'win32') {
      for (const v of sysadminStorage.getExtractedWindowsClientVersions()) {
        versionSet.add(v);
      }
      // GCI libraries bundled with the extension (secure/air-gapped installs).
      // These are x64 Windows DLLs, so only offer them on a compatible arch —
      // an ARM64 VS Code can't load them (run the x64 build instead).
      if (bundledGciArchSupported()) {
        for (const v of bundledWindowsClientVersions()) {
          versionSet.add(v);
        }
      }
    }
    // Versions with manually configured GCI library paths
    const config = vscode.workspace.getConfiguration('gemstone');
    const gciLibraries = config.get<Record<string, string>>('gciLibraries', {});
    for (const v of Object.keys(gciLibraries)) {
      versionSet.add(v);
    }
    const versions = [...versionSet];
    versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    return versions;
  }

  static async show(
    storage: LoginStorage,
    secrets: vscode.SecretStorage,
    treeProvider: LoginTreeProvider,
    existingLogin?: GemStoneLogin,
    sysadminStorage?: SysadminStorage,
    /** When true, connect to the stone right after saving (the "connect to an
     *  existing stone" entry from the Sessions view). */
    connectAfterSave = false,
  ): Promise<void> {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    const versions = sysadminStorage
      ? LoginEditorPanel.getAvailableVersions(storage, sysadminStorage)
      : [];

    let login: GemStoneLogin = existingLogin ?? {
      ...DEFAULT_LOGIN,
      version: versions[0] ?? '',
    };

    // If the login has its password in SecretStorage, load it so the user can
    // view or change it in the editor.
    if (existingLogin?.password_in_keychain) {
      const pw = await getLoginPassword(secrets, existingLogin);
      if (pw !== undefined) {
        login = { ...login, gs_password: pw };
      }
    }

    const title = connectAfterSave
      ? 'Connect to an existing stone'
      : existingLogin ? `Edit: ${loginLabel(existingLogin)}` : 'New GemStone Login';

    if (LoginEditorPanel.currentPanel) {
      LoginEditorPanel.currentPanel.panel.reveal(column);
      LoginEditorPanel.currentPanel.versions = versions;
      LoginEditorPanel.currentPanel.connectAfterSave = connectAfterSave;
      LoginEditorPanel.currentPanel.panel.title = title;
      LoginEditorPanel.currentPanel.update(login);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'gemstoneLoginEditor',
      title,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      },
    );

    LoginEditorPanel.currentPanel = new LoginEditorPanel(
      panel, storage, secrets, treeProvider, login, versions, connectAfterSave,
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private storage: LoginStorage,
    private secrets: vscode.SecretStorage,
    private treeProvider: LoginTreeProvider,
    private login: GemStoneLogin,
    private versions: string[],
    private connectAfterSave: boolean,
  ) {
    this.panel = panel;
    this.update(login);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'save':
            await this.handleSave(message.data, message.originalLabel);
            break;
          case 'requestData':
            this.panel.webview.postMessage({
              command: 'loadData',
              data: this.login,
              versions: this.versions,
            });
            break;
        }
      },
      null,
      this.disposables,
    );
  }

  private async handleSave(data: GemStoneLogin, originalLabel?: string): Promise<void> {
    data.label = loginLabel(data);

    if (data.password_in_keychain) {
      // Store the password in SecretStorage and strip it from the settings
      // object before we persist.
      if (data.gs_password) {
        await setLoginPassword(this.secrets, data);
      }
      data = { ...data, gs_password: '' };
    } else {
      // If SecretStorage was previously enabled and the user unchecked it,
      // clean up the stored entry so we don't leave stale secrets behind.
      if (this.login.password_in_keychain) {
        await deleteLoginPassword(this.secrets, this.login);
      }
    }

    await this.storage.saveLogin(data, originalLabel);
    this.treeProvider.refresh();
    this.login = data;

    if (this.connectAfterSave) {
      // The "connect to an existing stone" flow: close the form and log in. Pass
      // the login as-is (gemstone.login fetches a keychain password itself) and
      // skip the open-folder guard so first-run users aren't blocked.
      this.panel.dispose();
      await vscode.commands.executeCommand('gemstone.login', { login: data, skipFolderCheck: true });
      return;
    }

    this.panel.title = `Edit: ${data.label}`;
    vscode.window.showInformationMessage(`Login "${data.label}" saved.`);
  }

  private update(login: GemStoneLogin): void {
    this.login = login;
    this.panel.webview.html = this.getHtml();
    this.panel.webview.postMessage({ command: 'loadData', data: login, versions: this.versions });
  }

  private dispose(): void {
    LoginEditorPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
  }

  private getHtml(): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const connect = this.connectAfterSave;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>${connect ? 'Connect to an existing stone' : 'GemStone login'}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
      color: var(--vscode-foreground); background: var(--vscode-editor-background);
      margin: 0; padding: 28px 20px; display: flex; justify-content: center;
    }
    .card {
      width: 100%; max-width: 460px;
      background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.25));
      border-radius: 10px; padding: 22px 22px 18px;
      box-shadow: 0 2px 16px rgba(0,0,0,.18);
    }
    .hd { display: flex; align-items: center; gap: 11px; }
    .hd .badge {
      width: 34px; height: 34px; border-radius: 8px; flex: none;
      display: flex; align-items: center; justify-content: center;
      background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff);
    }
    .hd .badge svg { width: 19px; height: 19px; }
    .hd h1 { font-size: 15px; font-weight: 600; margin: 0; }
    .hd .sub { font-size: 11.5px; color: var(--vscode-descriptionForeground, #9d9d9d); margin: 2px 0 0; }
    .section { margin-top: 20px; }
    .section-title { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--vscode-descriptionForeground, #9d9d9d); margin: 0 0 9px; }
    .field { margin-bottom: 11px; }
    .field:last-child { margin-bottom: 0; }
    .field > label { display: block; font-size: 11.5px; font-weight: 500; margin-bottom: 4px; }
    .field.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 11px; }
    input[type="text"], input[type="password"], select {
      width: 100%; padding: 7px 9px; border-radius: 5px;
      background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, rgba(128,128,128,.35));
      font-family: inherit; font-size: 13px;
    }
    input:focus, select:focus { outline: none; border-color: var(--vscode-focusBorder, #007fd4); }
    .check { display: flex; align-items: flex-start; gap: 8px; margin-top: 10px; }
    .check input { margin: 2px 0 0; flex: none; }
    .check label { font-size: 11.5px; font-weight: 400; cursor: pointer; }
    .hint { font-size: 10.5px; color: var(--vscode-descriptionForeground, #9d9d9d); margin: 5px 0 0; line-height: 1.4; }
    details.adv { margin-top: 16px; }
    details.adv > summary { cursor: pointer; font-size: 11.5px; font-weight: 500; color: var(--vscode-descriptionForeground, #9d9d9d); list-style: none; user-select: none; }
    details.adv > summary::-webkit-details-marker { display: none; }
    details.adv > summary::before { content: '▸'; display: inline-block; margin-right: 6px; }
    details.adv[open] > summary::before { content: '▾'; }
    .actions { display: flex; gap: 8px; margin-top: 22px; }
    button {
      padding: 8px 16px; border-radius: 5px; border: 1px solid transparent; cursor: pointer;
      font-family: inherit; font-size: 13px; font-weight: 600;
      background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff);
    }
    button:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
    button.primary { flex: 1 1 auto; }
    button.secondary {
      background: var(--vscode-button-secondaryBackground, rgba(128,128,128,.18));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); font-weight: 500;
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,.28)); }
  </style>
</head>
<body>
  <div class="card">
    <div class="hd">
      <span class="badge">${connect
        ? '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 1v4H4v2a4 4 0 0 0 3 3.9V15h2v-4.1A4 4 0 0 0 12 7V5h-1V1H9v4H7V1H5z"/></svg>'
        : '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M10 2a4 4 0 0 0-3.9 5L2 11.1V14h2.9l.7-.7V12h1.3l.7-.7V10h1.3l1.2-1.2A4 4 0 1 0 10 2zm1.5 3.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>'}</span>
      <div>
        <h1>${connect ? 'Connect to an existing stone' : 'GemStone login'}</h1>
        <p class="sub">${connect ? 'Point Jasper at a stone you already run.' : 'Connection parameters for this login.'}</p>
      </div>
    </div>

    <div class="section">
      <p class="section-title">Connection</p>
      <div class="field"><label for="version">GemStone version</label><select id="version"></select></div>
      <div class="field"><label for="gem_host">Host</label><input type="text" id="gem_host" placeholder="localhost"></div>
      <div class="field two">
        <div><label for="stone">Stone</label><input type="text" id="stone" placeholder="gs64stone"></div>
        <div><label for="netldi">NetLDI</label><input type="text" id="netldi" placeholder="gs64ldi"></div>
      </div>
    </div>

    <div class="section">
      <p class="section-title">Credentials</p>
      <div class="field"><label for="gs_user">GemStone user</label><input type="text" id="gs_user" placeholder="DataCurator"></div>
      <div class="field"><label for="gs_password">Password</label><input type="password" id="gs_password"></div>
      <div class="check"><input type="checkbox" id="password_in_keychain"><label for="password_in_keychain">Store password in the OS keychain</label></div>
      <p class="hint">Leave blank to be prompted each time you connect.</p>
    </div>

    <details class="adv">
      <summary>Advanced</summary>
      <div class="section" style="margin-top:12px">
        <div class="field two">
          <div><label for="host_user">Host user</label><input type="text" id="host_user"></div>
          <div><label for="host_password">Host password</label><input type="password" id="host_password"></div>
        </div>
        <div class="check"><input type="checkbox" id="sync_classes" checked><label for="sync_classes">Sync classes to local files (Find in Files, Go to Definition)</label></div>
        <p class="hint">Keeps a read-only .gemstone mirror in sync on login/commit. Turn off for slow or remote connections — server-side search still works.</p>
      </div>
    </details>

    <div class="actions">
      <button id="saveBtn" class="primary">${connect ? 'Connect' : 'Save'}</button>
      <button id="cancelBtn" class="secondary">Cancel</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const fields = ['version','gem_host','stone','gs_user','gs_password','netldi','host_user','host_password'];
    let originalLabel = null;

    vscode.postMessage({ command: 'requestData' });

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.command === 'loadData') {
        originalLabel = msg.data.label || null;
        // Populate version dropdown
        const versionSelect = document.getElementById('version');
        const currentVersion = msg.data.version || '';
        const versions = msg.versions || [];
        versionSelect.innerHTML = '';
        const versionSet = new Set(versions);
        if (currentVersion && !versionSet.has(currentVersion)) {
          versions.unshift(currentVersion);
        }
        for (const v of versions) {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = v;
          versionSelect.appendChild(opt);
        }
        versionSelect.value = currentVersion;
        // Populate other fields
        for (const f of fields) {
          if (f === 'version') continue;
          const el = document.getElementById(f);
          if (el) el.value = msg.data[f] || '';
        }
        document.getElementById('password_in_keychain').checked =
          Boolean(msg.data.password_in_keychain);
        // Default on when unset, so existing logins keep syncing.
        document.getElementById('sync_classes').checked =
          msg.data.sync_classes !== false;
      }
    });

    document.getElementById('saveBtn').addEventListener('click', () => {
      const data = {};
      for (const f of fields) {
        data[f] = document.getElementById(f).value;
      }
      data.password_in_keychain = document.getElementById('password_in_keychain').checked;
      data.sync_classes = document.getElementById('sync_classes').checked;
      vscode.postMessage({ command: 'save', data, originalLabel });
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'requestData' });
    });
  </script>
</body>
</html>`;
  }
}
