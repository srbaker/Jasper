import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('vscode', () => import('../__mocks__/vscode'));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { __setWorkspaceFolders } from '../__mocks__/vscode';
import {
  RowanProjectTreeProvider,
  RowanProjectPackageItem,
  RowanProjectClassItem,
  RowanProjectMethodItem,
  RowanProjectMessageItem,
} from '../rowanProjectView';

// Write a Tonel class file into a package directory of a project.
function writeClass(projectDir: string, pkg: string, fileName: string, body: string): void {
  const pdir = path.join(projectDir, 'src', pkg);
  fs.mkdirSync(pdir, { recursive: true });
  fs.writeFileSync(path.join(pdir, fileName), body);
}

const THING_CLASS = [
  "Class { #name : 'Thing', #superclass : 'Object', #category : 'Pkg-Core' }",
  '',
  "{ #category : 'accessing' }",
  'Thing >> value [',
  '\t^ 42',
  ']',
  '',
  "{ #category : 'instance creation' }",
  'Thing class >> named: aName [',
  '\t^ self new',
  ']',
].join('\n');

const dirs: string[] = [];

// A real directory that IS a Rowan project: rowan/project.ston + src/<pkg> dirs,
// and optionally a load spec (which supplies the display name).
function makeProjectDir(packages: string[] = [], specName?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rowan-exproj-'));
  dirs.push(dir);
  const rowanDir = path.join(dir, 'rowan');
  fs.mkdirSync(rowanDir, { recursive: true });
  fs.writeFileSync(
    path.join(rowanDir, 'project.ston'),
    `RwProjectSpecificationV2 {\n\t#specName : 'project',\n\t#packagesPath : 'src',\n\t#specsPath : 'rowan/specs' }\n`,
  );
  if (specName) {
    const specsDir = path.join(rowanDir, 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    fs.writeFileSync(
      path.join(specsDir, `${specName}.ston`),
      `RwLoadSpecificationV2 {\n\t#specName : '${specName}'\n}\n`,
    );
  }
  for (const p of packages) fs.mkdirSync(path.join(dir, 'src', p), { recursive: true });
  return dir;
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  __setWorkspaceFolders(undefined);
});

describe('RowanProjectTreeProvider', () => {
  it('lists the project packages, sorted', () => {
    __setWorkspaceFolders([makeProjectDir(['Zeta-Core', 'Alpha-Core'])]);
    const provider = new RowanProjectTreeProvider();

    const rows = provider.getChildren();

    expect(rows.every(r => r instanceof RowanProjectPackageItem)).toBe(true);
    expect(rows.map(r => r.label)).toEqual(['Alpha-Core', 'Zeta-Core']);
  });

  it('shows a placeholder when the project has no packages', () => {
    __setWorkspaceFolders([makeProjectDir([])]);
    const provider = new RowanProjectTreeProvider();

    const rows = provider.getChildren();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toBeInstanceOf(RowanProjectMessageItem);
    expect((rows[0] as RowanProjectMessageItem).kind).toBe('rowanProjectEmpty');
  });

  it('shows nothing when the open folder is not a Rowan project', () => {
    __setWorkspaceFolders([os.tmpdir()]);
    const provider = new RowanProjectTreeProvider();

    expect(provider.getChildren()).toEqual([]);
  });

  it('shows nothing when no folder is open', () => {
    __setWorkspaceFolders(undefined);
    const provider = new RowanProjectTreeProvider();

    expect(provider.getChildren()).toEqual([]);
  });

  it('exposes the project name for the section description', () => {
    __setWorkspaceFolders([makeProjectDir([], 'Seaside')]);
    const provider = new RowanProjectTreeProvider();

    expect(provider.projectName()).toBe('Seaside');
  });

  it('re-reads packages after refresh', () => {
    const dir = makeProjectDir(['One']);
    __setWorkspaceFolders([dir]);
    const provider = new RowanProjectTreeProvider();
    expect(provider.getChildren().map(r => r.label)).toEqual(['One']);

    fs.mkdirSync(path.join(dir, 'src', 'Two'));
    provider.refresh();

    expect(provider.getChildren().map(r => r.label)).toEqual(['One', 'Two']);
  });
});

describe('RowanProjectTreeProvider drill-down', () => {
  function providerFor(dir: string): RowanProjectTreeProvider {
    __setWorkspaceFolders([dir]);
    return new RowanProjectTreeProvider();
  }

  it('makes a package with class files expandable, and one without a leaf', () => {
    const dir = makeProjectDir(['With-Core', 'Empty-Core']);
    writeClass(dir, 'With-Core', 'Thing.class.st', THING_CLASS);
    fs.writeFileSync(path.join(dir, 'src', 'Empty-Core', 'properties.st'), '{ }');

    const [empty, withClasses] = providerFor(dir).getChildren() as RowanProjectPackageItem[];

    expect(withClasses.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect(empty.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
  });

  it('lists a package’s classes and extensions, sorted, ignoring metadata files', () => {
    const dir = makeProjectDir(['Pkg-Core']);
    writeClass(dir, 'Pkg-Core', 'Thing.class.st', THING_CLASS);
    writeClass(dir, 'Pkg-Core', 'Object.extension.st', "Extension { #name : 'Object' }\n\n{ #category : '*Pkg' }\nObject >> asThing [\n\t^ self\n]");
    fs.writeFileSync(path.join(dir, 'src', 'Pkg-Core', 'package.st'), "Package { #name : 'Pkg-Core' }");

    const provider = providerFor(dir);
    const [pkg] = provider.getChildren() as RowanProjectPackageItem[];
    const classes = provider.getChildren(pkg) as RowanProjectClassItem[];

    expect(classes.map(c => c.label)).toEqual(['Object', 'Thing']);
    expect(classes[0].description).toBe('extension');
    expect(classes[1].description).toBeUndefined();
  });

  it('lists a class’s methods, instance-side before class-side', () => {
    const dir = makeProjectDir(['Pkg-Core']);
    writeClass(dir, 'Pkg-Core', 'Thing.class.st', THING_CLASS);

    const provider = providerFor(dir);
    const [pkg] = provider.getChildren() as RowanProjectPackageItem[];
    const [cls] = provider.getChildren(pkg) as RowanProjectClassItem[];
    const methods = provider.getChildren(cls) as RowanProjectMethodItem[];

    expect(methods.map(m => [m.label, m.description])).toEqual([
      ['value', undefined],
      ['named:', 'class'],
    ]);
  });

  it('opens the class file at the method’s line when a method row is clicked', () => {
    const dir = makeProjectDir(['Pkg-Core']);
    writeClass(dir, 'Pkg-Core', 'Thing.class.st', THING_CLASS);

    const provider = providerFor(dir);
    const [pkg] = provider.getChildren() as RowanProjectPackageItem[];
    const [cls] = provider.getChildren(pkg) as RowanProjectClassItem[];
    const [firstMethod] = provider.getChildren(cls) as RowanProjectMethodItem[];

    expect(firstMethod.command?.command).toBe('vscode.open');
    expect(firstMethod.command?.arguments?.[0].fsPath).toBe(path.join(dir, 'src', 'Pkg-Core', 'Thing.class.st'));
  });
});
