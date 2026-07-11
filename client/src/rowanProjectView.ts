import * as vscode from 'vscode';
import * as fs from 'fs';
import {
  readRowanWorkspaceProject, listPackageClasses,
  RowanWorkspaceProject, RowanProjectPackage, RowanProjectClass,
} from './rowanProject';
import { parseTonelClass, TonelMethod } from './tonelReader';

/** A package (directory of class source) in the workspace's Rowan project. */
export class RowanProjectPackageItem extends vscode.TreeItem {
  constructor(public readonly pkg: RowanProjectPackage, hasClasses: boolean) {
    super(pkg.name, hasClasses ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.id = `rowan-package-${pkg.path}`;
    this.iconPath = new vscode.ThemeIcon('symbol-namespace');
    // Point at the real directory so the row reveals/opens it in the Explorer.
    this.resourceUri = vscode.Uri.file(pkg.path);
    this.tooltip = pkg.path;
    this.contextValue = 'rowanProjectPackage';
  }
}

/** A class defined (or extended) in a package. Expands to its methods. */
export class RowanProjectClassItem extends vscode.TreeItem {
  constructor(public readonly cls: RowanProjectClass) {
    super(cls.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `rowan-class-${cls.file}`;
    this.iconPath = new vscode.ThemeIcon('symbol-class');
    this.resourceUri = vscode.Uri.file(cls.file);
    this.tooltip = cls.file;
    if (cls.kind === 'extension') this.description = 'extension';
    this.contextValue = cls.kind === 'extension' ? 'rowanProjectClassExtension' : 'rowanProjectClass';
  }
}

/** A method leaf. Clicking it opens the class file at the method's source. */
export class RowanProjectMethodItem extends vscode.TreeItem {
  constructor(public readonly method: TonelMethod, file: string) {
    super(method.selector, vscode.TreeItemCollapsibleState.None);
    this.id = `rowan-method-${file}-${method.side}-${method.selector}`;
    this.iconPath = new vscode.ThemeIcon('symbol-method');
    if (method.side === 'class') this.description = 'class';
    this.tooltip = method.category ? `${method.side} · ${method.category}` : method.side;
    this.contextValue = 'rowanProjectMethod';
    this.command = {
      command: 'vscode.open',
      title: 'Open Method Source',
      arguments: [
        vscode.Uri.file(file),
        { selection: new vscode.Range(method.signatureLine, 0, method.signatureLine, 0) },
      ],
    };
  }
}

/** A placeholder row (e.g. "No packages yet"). */
export class RowanProjectMessageItem extends vscode.TreeItem {
  constructor(public readonly kind: 'rowanProjectEmpty', label: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.id = `rowan-project-message-${kind}`;
    this.contextValue = kind;
  }
}

export type RowanProjectNode =
  | RowanProjectPackageItem
  | RowanProjectClassItem
  | RowanProjectMethodItem
  | RowanProjectMessageItem;

// A class file's methods, instance-side first then class-side, each side sorted
// by selector. Empty when the file is unreadable.
function readClassMethods(file: string): TonelMethod[] {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  return parseTonelClass(text).methods.slice().sort((a, b) =>
    a.side === b.side ? a.selector.localeCompare(b.selector) : a.side === 'instance' ? -1 : 1,
  );
}

/**
 * The Explorer-section view of the Rowan project at the open workspace root:
 * its packages, read from disk (no stone required). Contributed to the Explorer
 * container only when gemstone.workspaceIsRowanProject, so it appears solely for
 * Rowan projects, next to the file tree.
 */
export class RowanProjectTreeProvider implements vscode.TreeDataProvider<RowanProjectNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // The workspace project, read once per refresh. undefined = not yet probed,
  // null = the open folder is not a Rowan project.
  private project: RowanWorkspaceProject | null | undefined = undefined;

  refresh(): void {
    this.project = undefined;
    this._onDidChangeTreeData.fire();
  }

  /** The project's name, for the Explorer section's description; else undefined. */
  projectName(): string | undefined {
    return this.query()?.name;
  }

  getTreeItem(element: RowanProjectNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: RowanProjectNode): RowanProjectNode[] {
    if (!element) {
      const proj = this.query();
      if (!proj) return [];
      if (proj.packages.length === 0) {
        return [new RowanProjectMessageItem('rowanProjectEmpty', 'No packages yet')];
      }
      return proj.packages.map(pkg =>
        new RowanProjectPackageItem(pkg, listPackageClasses(pkg.path).length > 0));
    }
    if (element instanceof RowanProjectPackageItem) {
      return listPackageClasses(element.pkg.path).map(cls => new RowanProjectClassItem(cls));
    }
    if (element instanceof RowanProjectClassItem) {
      return readClassMethods(element.cls.file).map(m => new RowanProjectMethodItem(m, element.cls.file));
    }
    return [];
  }

  private query(): RowanWorkspaceProject | null {
    if (this.project !== undefined) return this.project;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.project = root ? readRowanWorkspaceProject(root) : null;
    return this.project;
  }
}
