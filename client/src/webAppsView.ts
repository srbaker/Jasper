import * as vscode from 'vscode';
import { SessionManager } from './sessionManager';
import { WebGsServer } from './webgsServer';
import { listWebApps } from './queries/webgs/listWebApps';
import { executeFetchString } from './browserQueries';

// A row for a WebApp subclass: name, serving status, and the context value that
// drives its run/stop/open menu actions.
export class WebAppItem extends vscode.TreeItem {
  /** Base URL when running — read by the preview command (row click + ↗ action). */
  readonly previewUrl?: string;

  constructor(public readonly appName: string, running: boolean, url?: string) {
    super(appName, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(
      running ? 'circle-filled' : 'circle-outline',
      running ? new vscode.ThemeColor('charts.green') : undefined,
    );
    this.description = running ? url?.replace(/^https?:\/\//, '') : 'stopped';
    this.tooltip = running ? `${appName} — serving at ${url}` : `${appName} — not running`;
    this.contextValue = running ? 'webAppRunning' : 'webAppStopped';
    if (running && url) {
      this.previewUrl = url;
      // Clicking a running app opens its preview.
      this.command = { command: 'gemstone.openWebPreview', title: 'Open Web Preview', arguments: [url] };
    }
  }
}

// The "Web Apps" view: WebApp subclasses in the connected session, each runnable
// as a WebGS server. Backed by the live image (listWebApps) and the WebGsServer's
// running state, so it refreshes on session change and on start/stop.
export class WebAppsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(
    private readonly sessions: SessionManager,
    private readonly server: WebGsServer,
  ) {}

  refresh(): void {
    this._onDidChange.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element) return []; // flat for now — routes come next
    const session = this.sessions.getSelectedSession();
    if (!session) return [];
    let apps: string[];
    try {
      apps = listWebApps((label, code) => executeFetchString(session, label, code));
    } catch {
      return [];
    }
    return apps.map((name) => new WebAppItem(name, this.server.isRunning(name), this.server.urlFor(name)));
  }
}
