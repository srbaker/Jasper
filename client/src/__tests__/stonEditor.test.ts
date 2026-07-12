import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('vscode', () => import('../__mocks__/vscode'));
// stonEditor imports browserQueries only for the live connection card; mock it
// away so this suite doesn't drag in the native GCI chain.
vi.mock('../browserQueries', () => ({
  listRowanProjects: vi.fn(),
  diffRowanProject: vi.fn(),
  formatRowanDiff: vi.fn(),
}));

import { pathWarn, projectRootOf } from '../stonEditor';

const dirs: string[] = [];
function projectRoot(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ston-editor-'));
  dirs.push(d);
  fs.mkdirSync(path.join(d, 'rowan'), { recursive: true });
  fs.writeFileSync(path.join(d, 'rowan', 'project.ston'), "RwProjectSpecificationV3 { #specName : 'project' }");
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe('projectRootOf', () => {
  it('finds the nearest ancestor holding a project spec', () => {
    const root = projectRoot();

    expect(projectRootOf(path.join(root, 'rowan', 'specs', 'App.ston'))).toBe(root);
  });

  it('returns null when the file is not inside a Rowan project', () => {
    const loose = fs.mkdtempSync(path.join(os.tmpdir(), 'ston-loose-'));
    dirs.push(loose);

    expect(projectRootOf(path.join(loose, 'App.ston'))).toBeNull();
  });
});

describe('pathWarn', () => {
  it('warns when a path-valued key points at a directory that does not exist', () => {
    const root = projectRoot();
    const warn = pathWarn(root)!;

    expect(warn('packagesPath', 'src')).toContain('does not exist');
  });

  it('stays silent when the referenced directory is present', () => {
    const root = projectRoot();
    fs.mkdirSync(path.join(root, 'src'));
    const warn = pathWarn(root)!;

    expect(warn('packagesPath', 'src')).toBeUndefined();
  });

  it('distinguishes a missing file from a missing directory in its message', () => {
    const root = projectRoot();
    const warn = pathWarn(root)!;

    expect(warn('projectSpecFile', 'rowan/nope.ston')).toContain('File');
    expect(warn('packagesPath', 'nope')).toContain('Directory');
  });

  it('ignores keys that are not path-valued', () => {
    const root = projectRoot();
    const warn = pathWarn(root)!;

    expect(warn('projectVersion', '9.9.9')).toBeUndefined();
  });

  it('leaves an empty value to the required-field check rather than reporting it missing', () => {
    const root = projectRoot();
    const warn = pathWarn(root)!;

    expect(warn('packagesPath', '')).toBeUndefined();
  });

  it('produces no check at all when there is no project root', () => {
    expect(pathWarn(null)).toBeUndefined();
  });
});
