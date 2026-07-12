import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { SysadminStorage } from './sysadminStorage';
import { VersionManager } from './versionManager';
import { DatabaseManager } from './databaseManager';
import { ProcessManager } from './processManager';
import { LoginStorage } from './loginStorage';
import { GemStoneVersion } from './sysadminTypes';
import { getSharedMemory } from './sharedMemoryTreeProvider';
import { appendSysadmin } from './sysadminChannel';
import { isWindows } from './wslBridge';
import { bundledWindowsClientGciPath } from './bundledGci';

function waitForTerminalClose(name: string): Promise<void> {
  return new Promise((resolve) => {
    const disposable = vscode.window.onDidCloseTerminal((terminal) => {
      if (terminal.name === name) {
        disposable.dispose();
        resolve();
      }
    });
  });
}

export interface QuickSetupDeps {
  sysadminStorage: SysadminStorage;
  versionManager: VersionManager;
  databaseManager: DatabaseManager;
  processManager: ProcessManager;
  loginStorage: LoginStorage;
  refreshAdminViews: () => void;
  refreshVersions: () => void;
  refreshLogins: () => void;
}

// Default names for the one-click database.
const STONE_NAME = 'gs64stone';
const LDI_NAME = 'gs64ldi';
const BASE_EXTENT = 'extent0';

/**
 * Ensure shared memory is configured (Linux/macOS). Returns true to proceed
 * (configured, or the user chose Skip); false if the user cancelled. If the user
 * runs the setup script, re-checks after it closes.
 */
async function ensureSharedMemory(): Promise<boolean> {
  if (process.platform === 'win32') return true;
  for (;;) {
    const mem = await getSharedMemory();
    const shmmaxGb = mem ? mem.shmmax / Math.pow(2, 30) : 0;
    const shmallGb = mem ? mem.shmall / Math.pow(2, 18) : 0;
    if (shmmaxGb >= 1 && shmallGb >= 1) return true;
    const choice = await vscode.window.showWarningMessage(
      'Shared memory is not configured (< 1 GB). Run the setup script first?',
      { modal: true },
      'Run Setup Script',
      'Skip',
    );
    if (choice === 'Run Setup Script') {
      await vscode.commands.executeCommand(
        process.platform === 'linux'
          ? 'gemstone.runSetSharedMemoryLinux'
          : 'gemstone.runSetSharedMemory',
      );
      await waitForTerminalClose('GemStone: Shared Memory Setup');
      continue; // re-check
    }
    if (choice === 'Skip') return true;
    return false; // cancelled
  }
}

/** Fetch the available versions, surfacing failures as error messages. */
async function fetchVersions(deps: QuickSetupDeps): Promise<GemStoneVersion[] | null> {
  try {
    const versions = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'GemStone: Fetching available versions…' },
      () => deps.versionManager.fetchAvailableVersions(),
    );
    if (versions.length === 0) {
      vscode.window.showErrorMessage('No GemStone versions available for this platform.');
      return null;
    }
    return versions;
  } catch (e) {
    vscode.window.showErrorMessage(`Failed to fetch versions: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/** The best version to use with no prompt: newest already-installed, else newest available. */
function pickBestVersion(versions: GemStoneVersion[]): GemStoneVersion {
  return versions.find((v) => v.extracted) ?? versions.find((v) => v.downloaded) ?? versions[0];
}

/** Download + extract the version if it isn't installed yet. Returns false on failure. */
async function ensureInstalled(deps: QuickSetupDeps, version: GemStoneVersion): Promise<boolean> {
  if (!version.downloaded && !version.extracted) {
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `GemStone: Downloading ${version.version}…`, cancellable: true },
        (progress, token) => deps.versionManager.download(version, progress, token),
      );
      version.downloaded = true;
      deps.refreshVersions();
    } catch (e) {
      vscode.window.showErrorMessage(`Download failed: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }
  if (!version.extracted) {
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `GemStone: Extracting ${version.version}…` },
        (progress) => deps.versionManager.extract(version, progress),
      );
      version.extracted = true;
      deps.refreshVersions();
    } catch (e) {
      vscode.window.showErrorMessage(`Extraction failed: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }
  return true;
}

/** Resolve and store the GCI library path for this version's DataCurator login. */
async function configureGciLibrary(deps: QuickSetupDeps, version: GemStoneVersion): Promise<void> {
  const bundledDll = isWindows() ? bundledWindowsClientGciPath(version.version) : undefined;
  if (bundledDll) {
    await deps.loginStorage.setGciLibraryPath(version.version, bundledDll);
    appendSysadmin(`Using GCI library bundled with the extension: ${bundledDll}`);
    return;
  }
  if (isWindows()) {
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `GemStone: Installing Windows client ${version.version}…`, cancellable: true },
        (progress, token) => deps.versionManager.downloadAndExtractWindowsClient(version.version, progress, token),
      );
      const dllPath = deps.sysadminStorage.getWindowsClientGciPath(version.version);
      if (dllPath) await deps.loginStorage.setGciLibraryPath(version.version, dllPath);
      deps.refreshVersions();
    } catch (e) {
      appendSysadmin(`Windows client install failed: ${e instanceof Error ? e.message : e}`);
    }
    return;
  }
  const gsPath = deps.sysadminStorage.getGemstonePath(version.version);
  if (gsPath) {
    const ext = process.platform === 'darwin' ? 'dylib' : 'so';
    const libPath = path.join(gsPath, 'lib', `libgcits-${version.version}-64.${ext}`);
    if (fs.existsSync(libPath)) await deps.loginStorage.setGciLibraryPath(version.version, libPath);
  }
}

interface Provisioned {
  db: { dirName: string };
  login: {
    label: string; version: string; gem_host: string; stone: string;
    gs_user: string; gs_password: string; netldi: string; host_user: string; host_password: string;
  };
}

/**
 * Install (if needed) → create the database → start stone + NetLDI → create and
 * save the DataCurator login. Shared by Quick Setup and the one-click Get Started.
 * Returns the saved login (and db), or null on any failure (already surfaced).
 */
async function provisionDatabase(deps: QuickSetupDeps, version: GemStoneVersion): Promise<Provisioned | null> {
  if (!(await ensureInstalled(deps, version))) return null;

  let db;
  try {
    db = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'GemStone: Creating database…' },
      (progress) => deps.databaseManager.createDatabaseDirect(version.version, BASE_EXTENT, STONE_NAME, LDI_NAME, progress),
    );
    deps.refreshAdminViews();
  } catch (e) {
    vscode.window.showErrorMessage(`Database creation failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `GemStone: Starting stone ${STONE_NAME}…` },
      () => deps.processManager.startStone(db),
    );
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `GemStone: Starting NetLDI ${LDI_NAME}…` },
      () => deps.processManager.startNetldi(db),
    );
    deps.refreshAdminViews();
  } catch (e) {
    vscode.window.showErrorMessage(`Failed to start the database: ${e instanceof Error ? e.message : e}`);
    return null;
  }

  await configureGciLibrary(deps, version);
  const login = {
    label: '', version: version.version, gem_host: 'localhost', stone: STONE_NAME,
    gs_user: 'DataCurator', gs_password: 'swordfish', netldi: LDI_NAME, host_user: '', host_password: '',
  };
  await deps.loginStorage.saveLogin(login);
  deps.refreshLogins();
  return { db, login };
}

/**
 * Guided setup: prompts for the version, then provisions a database and tells the
 * user how to connect. (The Command Palette / Settings entry point.)
 */
export async function runQuickSetup(deps: QuickSetupDeps): Promise<void> {
  if (!(await ensureSharedMemory())) return;
  const versions = await fetchVersions(deps);
  if (!versions) return;

  const latest = versions[0];
  const pick = await vscode.window.showQuickPick(
    versions.map((v) => ({
      label: v.version,
      description: v.extracted ? 'extracted' : v.downloaded ? 'downloaded' : '',
      version: v,
    })),
    { title: 'GemStone Quick Setup', placeHolder: `Select a version (latest: ${latest.version})` },
  );
  if (!pick) return;

  const provisioned = await provisionDatabase(deps, pick.version);
  if (!provisioned) return;

  appendSysadmin('Quick Setup complete');
  vscode.window.showInformationMessage(
    `Quick Setup complete! Database "${provisioned.db.dirName}" is running. ` +
      `Use the login "DataCurator on ${STONE_NAME} (localhost)" to connect.`,
  );
}

/**
 * One click, zero prompts: latest GemStone (downloaded if needed) → a fresh
 * database, started → connected → a workspace open, ready to type. The magical
 * "Get Started" button in the empty Sessions view.
 */
export async function magicStart(deps: QuickSetupDeps): Promise<void> {
  if (!(await ensureSharedMemory())) return;
  const versions = await fetchVersions(deps);
  if (!versions) return;

  const provisioned = await provisionDatabase(deps, pickBestVersion(versions));
  if (!provisioned) return;

  appendSysadmin('Get Started: provisioned; connecting');
  // Connect without the open-folder guard (there's nothing to open on first run),
  // then open a workspace so there's somewhere to type — the "show the UI" step.
  await vscode.commands.executeCommand('gemstone.login', { login: provisioned.login, skipFolderCheck: true });
  await vscode.commands.executeCommand('gemstone.openWorkspace');
}
