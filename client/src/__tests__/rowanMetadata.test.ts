import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRowanProject } from '../rowanCreate';
import { readRowanWorkspaceProject } from '../rowanProject';
import {
  setProjectSpecField,
  renameProject,
  addProjectPackage,
  addProjectComponent,
  listComponents,
  isValidRowanName,
} from '../rowanMetadata';

const dirs: string[] = [];
function project(name = 'MyApp'): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rowan-meta-'));
  dirs.push(d);
  createRowanProject(d, name);
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const read = (root: string, p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (root: string, p: string) => fs.existsSync(path.join(root, p));

describe('isValidRowanName', () => {
  it('accepts names with the separators Rowan uses', () => {
    expect(isValidRowanName('MyProject-Core')).toBe(true);
    expect(isValidRowanName('Foo.Bar_1')).toBe(true);
  });

  it('rejects empty, leading-separator, and space-containing names', () => {
    expect(isValidRowanName('')).toBe(false);
    expect(isValidRowanName('-leading')).toBe(false);
    expect(isValidRowanName('has space')).toBe(false);
  });
});

describe('setProjectSpecField', () => {
  it('updates an existing package format in project.ston', () => {
    const root = project();

    const result = setProjectSpecField(root, 'packageFormat', 'filetree');

    expect(result.success).toBe(true);
    expect(read(root, 'rowan/project.ston')).toContain("#packageFormat : 'filetree'");
    expect(readRowanWorkspaceProject(root)?.packageFormat).toBe('filetree');
  });

  it('updates the package convention without touching the format', () => {
    const root = project();

    setProjectSpecField(root, 'packageConvention', 'Rowan');

    const spec = read(root, 'rowan/project.ston');
    expect(spec).toContain("#packageConvention : 'Rowan'");
    expect(spec).toContain("#packageFormat : 'tonel'");
  });

  it('inserts the field before the comment when it is absent', () => {
    const root = project();
    const specPath = path.join(root, 'rowan', 'project.ston');
    fs.writeFileSync(specPath, read(root, 'rowan/project.ston').replace(/\t#packageFormat[^\n]*\n/, ''));

    const result = setProjectSpecField(root, 'packageFormat', 'tonel');

    expect(result.success).toBe(true);
    expect(read(root, 'rowan/project.ston')).toContain("#packageFormat : 'tonel'");
  });
});

describe('renameProject', () => {
  it('renames the spec file and updates its project name', () => {
    const root = project('MyApp');

    const result = renameProject(root, 'Renamed');

    expect(result.success).toBe(true);
    expect(exists(root, 'rowan/specs/MyApp.ston')).toBe(false);
    expect(exists(root, 'rowan/specs/Renamed.ston')).toBe(true);
    expect(read(root, 'rowan/specs/Renamed.ston')).toContain("#projectName : 'Renamed'");
    expect(readRowanWorkspaceProject(root)?.name).toBe('Renamed');
  });

  it('rejects an invalid name', () => {
    const root = project();

    const result = renameProject(root, 'bad name');

    expect(result.success).toBe(false);
    expect(exists(root, 'rowan/specs/MyApp.ston')).toBe(true);
  });

  it('refuses to overwrite an existing spec of the target name', () => {
    const root = project('MyApp');
    fs.writeFileSync(path.join(root, 'rowan', 'specs', 'Taken.ston'), 'RwLoadSpecificationV2 { }');

    const result = renameProject(root, 'Taken');

    expect(result.success).toBe(false);
    expect(exists(root, 'rowan/specs/MyApp.ston')).toBe(true);
  });
});

describe('addProjectPackage', () => {
  it('creates the package directory with properties and registers it in the component', () => {
    const root = project();

    const result = addProjectPackage(root, 'MyApp-Core');

    expect(result.success).toBe(true);
    expect(exists(root, 'src/MyApp-Core/properties.st')).toBe(true);
    expect(read(root, 'src/MyApp-Core/properties.st')).toContain("#format : 'tonel'");
    expect(read(root, 'rowan/components/Core.ston')).toContain("'MyApp-Core'");
    expect(readRowanWorkspaceProject(root)?.packages.map((p) => p.name)).toContain('MyApp-Core');
  });

  it('rejects a package that already exists', () => {
    const root = project();
    addProjectPackage(root, 'MyApp-Core');

    const result = addProjectPackage(root, 'MyApp-Core');

    expect(result.success).toBe(false);
  });

  it('adds a second package alongside the first in the component', () => {
    const root = project();

    addProjectPackage(root, 'MyApp-Core');
    addProjectPackage(root, 'MyApp-Tests');

    const core = read(root, 'rowan/components/Core.ston');
    expect(core).toContain("'MyApp-Core'");
    expect(core).toContain("'MyApp-Tests'");
  });
});

describe('addProjectComponent', () => {
  it('creates the component file and wires it into the load spec', () => {
    const root = project('MyApp');

    const result = addProjectComponent(root, 'Tests');

    expect(result.success).toBe(true);
    expect(read(root, 'rowan/components/Tests.ston')).toContain("#name : 'Tests'");
    const spec = read(root, 'rowan/specs/MyApp.ston');
    expect(spec).toContain("'Core'");
    expect(spec).toContain("'Tests'");
    expect(listComponents(root).map((c) => c.name)).toEqual(['Core', 'Tests']);
  });

  it('rejects a component that already exists', () => {
    const root = project();

    const result = addProjectComponent(root, 'Core');

    expect(result.success).toBe(false);
  });
});
