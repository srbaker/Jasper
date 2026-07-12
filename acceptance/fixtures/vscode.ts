/**
 * Launch the isolated editor-under-test — official VS Code via
 * `@vscode/test-electron`, pinned for reproducibility — with the Jasper
 * extension loaded from source, driven over CDP by Playwright.
 *
 * The isolation logic here is the good part salvaged from the previous harness,
 * hardened into a proper sandbox of the developer's machine. Nothing about this
 * run reads or writes the real user's configuration, and nothing pops a dialog:
 *
 *   - a fresh user-data dir (no personal settings, theme, or window state)
 *   - a fresh extensions dir (only Jasper loads)
 *   - a throwaway workspace folder
 *   - a **minimal env allowlist** — the process does NOT inherit the developer's
 *     shell environment (tokens, GS_ vars, GCI paths, etc.); it sees only
 *     PATH/locale plus throwaway HOME, TMPDIR and XDG dirs inside the profile
 *   - **`--use-inmemory-secretstorage`** — the flag VS Code's own integration
 *     tests use so secret storage stays in-memory and NEVER touches the macOS
 *     login Keychain. This is the real fix for the "enter your keychain
 *     password/code" dialog: on macOS `--password-store=basic` is a Linux-only
 *     switch and does not stop Electron's safeStorage from hitting the Keychain.
 *   - telemetry and the crash reporter disabled (flag + workspace setting)
 *   - `gemstone.rootPath` at an empty temp dir, so the Versions/Databases panels
 *     never surface real GemStone installs
 *
 * Reproducible: the VS Code version is pinned, the settings are fixed, and the
 * environment is constructed from scratch — so the run is identical everywhere.
 *
 * Non-disruptive on macOS: the app is switched to the "accessory" activation
 * policy (no Dock icon, never the active app) and its window moved off every
 * display, so it never steals focus or appears on the desktop.
 */
import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Repo root — the extension-development path VS Code loads Jasper from. */
export const repoRoot = path.resolve(__dirname, '..', '..');

/** Pinned VS Code version. Bump deliberately; never track "stable". */
export const VSCODE_VERSION = '1.128.0';

/**
 * Environment variables allowed through to the editor. Everything else in the
 * developer's shell env is dropped so nothing machine-specific leaks in. HOME,
 * TMPDIR, and the XDG_* dirs are then overridden to throwaway locations.
 */
const ENV_ALLOWLIST = [
  'PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TZ', '__CF_USER_TEXT_ENCODING',
  // Display vars so the editor finds the X server under Xvfb in the container.
  // Unset (and harmless) on macOS; required for the headless Linux/Docker run.
  'DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'WAYLAND_DISPLAY',
];

export interface LaunchedVSCode {
  app: ElectronApplication;
  window: Page;
  /** The throwaway workspace folder VS Code opened. */
  workspace: string;
  /** Close the app and remove all throwaway directories. */
  dispose: () => Promise<void>;
}

export interface LaunchOptions {
  /** Workspace `.vscode/settings.json` entries seeded before launch. */
  workspaceSettings?: Record<string, unknown>;
  /**
   * When true (default) Jasper is loaded from source via
   * `--extensionDevelopmentPath`. When false the editor launches **bare** — no
   * extension — which the "Install Jasper" chapter uses to install it from the
   * marketplace through the UI.
   */
  development?: boolean;
  /**
   * When true, leave VS Code's Workspace Trust on and force the startup prompt,
   * so the "Do you trust the authors of the files in this folder?" dialog appears
   * (the "Trust your workspace" chapter captures it). Default false — every other
   * scenario passes `--disable-workspace-trust` so the dialog never interrupts.
   */
  workspaceTrust?: boolean;
  /**
   * Override `gemstone.rootPath`. Default is an empty throwaway dir (isolation).
   * The "Download GemStone" chapter points this at a persistent, git-ignored
   * cache so a release is fetched once and reused by later runs.
   */
  gemstoneRootPath?: string;
  /**
   * When true, launch VS Code with **no folder open** (an empty window). Jasper
   * requires an open folder to log in, and the "open a folder first" chapter
   * captures that guidance. With no folder there is no workspace `settings.json`,
   * so `workspaceSettings` (and `gemstone.rootPath`) are applied at user scope
   * instead — enough to show a configured login whose Login action then trips the
   * folder guard.
   */
  noWorkspace?: boolean;
  /**
   * Absolute path to a fixture directory whose contents are copied into the
   * throwaway workspace folder before launch — so the opened folder is a real
   * project (e.g. a Rowan project) instead of an empty dir. The copy keeps the
   * committed fixture pristine even when a chapter mutates the workspace
   * (create/commit/edit). Default: an empty workspace.
   */
  workspaceSeed?: string;
}

/**
 * The Electron binary that ships alongside the CLI launcher `@vscode/test-electron`
 * hands back. We exec it directly (never via macOS `open`/LaunchServices, which
 * would collide with a running VS Code — same bundle id — and drop our args).
 */
function electronBinary(vscodeCliPath: string): string {
  if (process.platform === 'darwin') {
    const appRoot = vscodeCliPath.slice(0, vscodeCliPath.indexOf('.app/') + '.app'.length);
    return path.join(appRoot, 'Contents', 'MacOS', 'Electron');
  }
  // On Linux and Windows the returned path is already the launchable binary.
  return vscodeCliPath;
}

/** Build a minimal, machine-independent environment rooted at the profile. */
function sandboxedEnv(profile: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  const tmp = path.join(profile, 'tmp');
  const xdg = (name: string) => path.join(profile, 'xdg', name);
  fs.mkdirSync(tmp, { recursive: true });
  for (const dir of ['config', 'data', 'cache', 'state']) fs.mkdirSync(xdg(dir), { recursive: true });
  env.HOME = profile;
  env.USERPROFILE = profile;
  env.TMPDIR = tmp;
  env.XDG_CONFIG_HOME = xdg('config');
  env.XDG_DATA_HOME = xdg('data');
  env.XDG_CACHE_HOME = xdg('cache');
  env.XDG_STATE_HOME = xdg('state');
  return env;
}

export async function launchVSCode(options: LaunchOptions = {}): Promise<LaunchedVSCode> {
  const vscodeCliPath = await downloadAndUnzipVSCode(VSCODE_VERSION);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jasper-acceptance-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'jasper-workspace-'));

  // Seed the workspace from a fixture project (copied, so the fixture stays
  // pristine even if the chapter writes to the folder).
  if (options.workspaceSeed) {
    fs.cpSync(options.workspaceSeed, workspace, { recursive: true });
  }

  const gemstoneRoot = options.gemstoneRootPath ?? path.join(profile, 'gemstone-root');
  fs.mkdirSync(gemstoneRoot, { recursive: true });
  const settings = {
    'gemstone.rootPath': gemstoneRoot,
    'gemstone.mcp.registerWithClaudeDesktop': false,
    'telemetry.telemetryLevel': 'off',
    ...options.workspaceSettings,
  };
  const noWorkspace = options.noWorkspace ?? false;
  if (!noWorkspace) {
    const dotVscode = path.join(workspace, '.vscode');
    fs.mkdirSync(dotVscode, { recursive: true });
    fs.writeFileSync(path.join(dotVscode, 'settings.json'), JSON.stringify(settings, null, 2));
  }

  // Application-scoped user settings live in the user-data dir. Disable extension
  // signature verification: it otherwise hangs the marketplace *UI* install in
  // this isolated build (the CLI `--install-extension` path doesn't enforce it).
  // With no folder open there is no workspace settings.json, so the scenario's
  // settings (the configured login, gemstone.rootPath) are applied here instead.
  const userSettings: Record<string, unknown> = {
    'extensions.verifySignature': false,
    // Keep VS Code's Copilot "Chat" out of the suite — it opens in the auxiliary
    // bar by default, distracts every screenshot, and adds a second webview that
    // makes iframe.webview ambiguous. Hide the secondary side bar and its entry
    // points.
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    'chat.commandCenter.enabled': false,
    // Render modal message boxes (window.showInformationMessage({modal:true}), e.g.
    // the enhanced-inspector install offer) as CUSTOM DOM dialogs (.monaco-dialog-box)
    // instead of native OS dialogs. Native message boxes don't appear in the DOM —
    // and under headless Xvfb aren't interactable at all — so Playwright could
    // neither see nor answer them. (The Workspace Trust dialog is always custom,
    // which is why it worked without this.)
    'window.dialogStyle': 'custom',
    ...(noWorkspace ? settings : {}),
  };
  if (options.workspaceTrust) {
    // Force the Workspace Trust startup prompt so the dialog can be captured.
    userSettings['security.workspace.trust.enabled'] = true;
    userSettings['security.workspace.trust.startupPrompt'] = 'always';
  }
  const userDir = path.join(profile, 'user-data', 'User');
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(path.join(userDir, 'settings.json'), JSON.stringify(userSettings, null, 2));

  const development = options.development ?? true;

  const app = await electron.launch({
    executablePath: electronBinary(vscodeCliPath),
    env: sandboxedEnv(profile),
    args: [
      // Development mode loads Jasper from source; bare mode omits it so the
      // extension can be installed from the marketplace through the UI.
      ...(development ? [`--extensionDevelopmentPath=${repoRoot}`] : []),
      `--user-data-dir=${path.join(profile, 'user-data')}`,
      `--extensions-dir=${path.join(profile, 'extensions')}`,
      // Every scenario disables Workspace Trust so the dialog never interrupts —
      // except the "Trust your workspace" chapter, which wants to capture it.
      ...(options.workspaceTrust ? [] : ['--disable-workspace-trust']),
      // VS Code now bundles GitHub Copilot Chat as a built-in extension; its "Chat
      // / Build with Agent" view auto-opens in the secondary side bar on a fresh
      // profile (no setting suppresses it) — a distraction in every screenshot and
      // a second webview that made `iframe.webview` ambiguous. Disable the built-in
      // outright so it never loads. (Jasper still loads via --extensionDevelopmentPath.)
      '--disable-extension', 'GitHub.copilot-chat',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-updates',
      '--disable-telemetry',
      '--disable-crash-reporter',
      // Secret storage stays in-memory — never the macOS login Keychain, so the
      // run never prompts for a keychain password/code. (VS Code's own test flag.)
      '--use-inmemory-secretstorage',
      '--no-sandbox',
      // The "open a folder first" chapter launches with no folder (empty window)
      // so it can capture Jasper's guidance to open one.
      ...(noWorkspace ? [] : [workspace]),
    ],
  });

  if (process.platform === 'darwin') {
    // Accessory app: no Dock icon, never the active app, can't steal focus.
    await app.evaluate(({ app }) => {
      app.setActivationPolicy?.('accessory');
      app.dock?.hide?.();
    });
  }

  const window = await app.firstWindow();

  if (process.platform === 'darwin') {
    // Move the window off every display so it isn't on the visible desktop. It
    // can still flash briefly when first created — that's inherent to a GUI
    // Electron app on macOS (the flash-free path is a headless Linux run in CI).
    // Off-screen, not hidden: a hidden window reports its contents as
    // non-visible, which would hang Playwright's actionability checks.
    await app.evaluate(({ BrowserWindow }) => {
      for (const win of BrowserWindow.getAllWindows()) win.setPosition(-20000, -20000);
    });
  }

  await window.waitForSelector('.monaco-workbench', { timeout: 60_000 });

  const dispose = async () => {
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  };

  return { app, window, workspace, dispose };
}
