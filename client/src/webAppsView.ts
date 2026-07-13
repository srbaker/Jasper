import * as vscode from 'vscode';
import { SessionManager } from './sessionManager';
import { WebGsServer, WEBGS_PORT } from './webgsServer';
import { listWebAppsWithRoutes, WebAppInfo } from './queries/webgs/listWebAppsWithRoutes';
import { executeFetchString } from './browserQueries';

// A WebApp subclass: name, serving status, and (when it has endpoints) an
// expandable list of routes. Running apps expand by default — you're serving, so
// you want the routes in front of you.
export class WebAppItem extends vscode.TreeItem {
  readonly appName: string;
  /** Base URL when running — read by the preview command (row click + ↗ action). */
  readonly previewUrl?: string;

  constructor(readonly app: WebAppInfo, running: boolean, url?: string) {
    super(
      app.name,
      app.routes.length === 0
        ? vscode.TreeItemCollapsibleState.None
        : running
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.appName = app.name;
    const n = app.routes.length;
    const routeWord = `${n} route${n === 1 ? '' : 's'}`;
    this.iconPath = new vscode.ThemeIcon(
      running ? 'circle-filled' : 'circle-outline',
      running ? new vscode.ThemeColor('charts.green') : undefined,
    );
    this.description = running ? url?.replace(/^https?:\/\//, '') : 'stopped';
    this.tooltip = running
      ? `${app.name} — serving at ${url} · ${routeWord}`
      : `${app.name} — ${routeWord}, not running`;
    this.contextValue = running ? 'webAppRunning' : 'webAppStopped';
    if (running && url) {
      this.previewUrl = url;
      this.command = { command: 'gemstone.openWebPreview', title: 'Open Web Preview', arguments: [url] };
    }
  }
}

// A single endpoint. Clicking it serves the app if needed and opens the route in
// the preview — the list is a live API console, not a static outline.
export class RouteItem extends vscode.TreeItem {
  constructor(readonly appName: string, readonly path: string, running: boolean) {
    super(path, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('link');
    this.tooltip = running
      ? `Open http://localhost:${WEBGS_PORT}${path}`
      : `Serve ${appName} and open ${path}`;
    this.contextValue = 'webAppRoute';
    this.command = {
      command: 'gemstone.webgsOpenRoute',
      title: 'Open Route',
      arguments: [{ appName, path }],
    };
  }
}

// The "Web Apps" view: WebApp subclasses in the connected session with their
// endpoints, each runnable/openable. Backed by the live image + the WebGsServer's
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
    const session = this.sessions.getSelectedSession();
    if (!session) return [];
    if (element instanceof WebAppItem) {
      const running = this.server.isRunning(element.appName);
      return element.app.routes.map((p) => new RouteItem(element.appName, p, running));
    }
    if (element) return [];
    let apps: WebAppInfo[];
    try {
      apps = listWebAppsWithRoutes((label, code) => executeFetchString(session, label, code));
    } catch {
      return [];
    }
    return apps.map((a) => new WebAppItem(a, this.server.isRunning(a.name), this.server.urlFor(a.name)));
  }
}
