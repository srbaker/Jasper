/**
 * Launch an isolated VS Code (Electron) with the Jasper extension loaded from
 * source, driven over CDP by Playwright.
 *
 * This is the isolation logic salvaged from the previous acceptance harness
 * (`helpers/vscode.ts`) — the part that was genuinely good — refactored from a
 * per-test fixture into a plain launcher so it can be shared by a worker-scoped
 * fixture (see `fixtures/test.ts`).
 *
 * Isolated from the developer's machine, not just from VS Code's settings:
 *   - a fresh user-data dir (no personal settings, theme, or window state)
 *   - a fresh extensions dir (only Jasper loads)
 *   - a throwaway workspace folder
 *   - HOME pointed at the profile, so `~/.claude.json` and `~/Documents/GemStone`
 *     resolve to empty throwaway paths (no MCP write to the real config)
 *   - `gemstone.rootPath` at an empty temp dir, so the Versions and Databases
 *     panels never surface real GemStone installs
 *   - secrets kept in an in-profile file store, never the macOS login keychain
 *
 * Non-disruptive on macOS: the app is switched to the "accessory" activation
 * policy (the runtime equivalent of LSUIElement) and its window moved off every
 * display, so it never steals focus or sits on the visible desktop. Playwright
 * drives it over CDP, which is unaffected. This is what lets the suite run on a
 * developer's Mac without flashing windows — no Docker required.
 */
import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Repo root — the extension-development path VS Code loads Jasper from. */
export const repoRoot = path.resolve(__dirname, '..', '..');

/** VS Code version the suite pins (channel or explicit version). */
export const VSCODE_VERSION = 'stable';

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

export async function launchVSCode(options: LaunchOptions = {}): Promise<LaunchedVSCode> {
  const vscodeCliPath = await downloadAndUnzipVSCode(VSCODE_VERSION);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jasper-acceptance-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'jasper-workspace-'));

  const gemstoneRoot = path.join(profile, 'gemstone-root');
  fs.mkdirSync(gemstoneRoot, { recursive: true });
  const settings = {
    'gemstone.rootPath': gemstoneRoot,
    'gemstone.mcp.registerWithClaudeDesktop': false,
    ...options.workspaceSettings,
  };
  const dotVscode = path.join(workspace, '.vscode');
  fs.mkdirSync(dotVscode, { recursive: true });
  fs.writeFileSync(path.join(dotVscode, 'settings.json'), JSON.stringify(settings, null, 2));

  // Clean env: drop ELECTRON_RUN_AS_NODE (it makes VS Code's Electron boot as
  // plain Node and reject every CLI flag), and point HOME at the throwaway
  // profile so nothing home-relative touches the real machine.
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  }
  env.HOME = profile;
  env.USERPROFILE = profile;

  const app = await electron.launch({
    executablePath: electronBinary(vscodeCliPath),
    env,
    args: [
      `--extensionDevelopmentPath=${repoRoot}`,
      `--user-data-dir=${path.join(profile, 'user-data')}`,
      `--extensions-dir=${path.join(profile, 'extensions')}`,
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-updates',
      '--no-sandbox',
      // Keep secrets in an in-profile file store instead of the macOS login
      // keychain, which --user-data-dir does NOT isolate.
      '--password-store=basic',
      workspace,
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
    // Move the window off every display so it isn't on the visible desktop.
    // (Off-screen, not hidden: a hidden window reports its contents as
    // non-visible, which would make Playwright's actionability checks hang.)
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
