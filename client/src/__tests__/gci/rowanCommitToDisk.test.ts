// End-to-end proof that "Commit to Disk" (commitRowanProject → writeProjectNamed:)
// actually reconciles a drifted project: a project whose image content isn't yet
// on disk reads as drifted (diff has operations), and after committing, the diff
// is clean AND the class source is on disk under the project's own repository
// root. This is the invariant the A1 feature promises — enforced on every run
// instead of proven once by hand.
//
// Requirements (same as rowanExportFixpoint): a SystemUser session — commit
// clears the dirty flag, which mutates Rowan's system-owned registry, so a plain
// user gets a SecurityError — and a stone whose image HAS Rowan. The bare-extent
// stone from `npm run test:server:start` has no Rowan, so this test SKIPS there.
// To run it, point .env.test / .env.test.local at a Rowan-enabled stone (from
// `extent0.rowan3.dbf`), then: `npx vitest run --project gci rowanCommitToDisk`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GciLibrary } from '../../gciLibrary';
import { QueryExecutor } from '../../queries/types';
import { GCI_LIBRARY_PATH, STONE_NRS, GEM_NRS, GS_PASSWORD } from './gciTestConfig';
import { commitRowanProject } from '../../queries/rowan/commitRowanProject';
import { diffRowanProject } from '../../queries/rowan/diffRowanProject';
import { listRowanProjects } from '../../queries/rowan/listRowanProjects';

const OOP_NIL = 0x14n;
const OOP_ILLEGAL = 0x01n;
const MAX_RESULT = 256 * 1024;
const TIMEOUT = 300_000;
const PROJECT = 'JasperCommitProbe';
const PACKAGE = 'JasperCommitProbe-Core';
const CLASS = 'JasperCommitThing';

interface SysSession {
  exec: QueryExecutor;
  logout: () => void;
}

// A SystemUser session (needed for create/commit/unload) bound to a QueryExecutor.
function loginSystemUser(): SysSession {
  const gci = new GciLibrary(GCI_LIBRARY_PATH);
  const r = gci.GciTsLogin(STONE_NRS, null, null, false, GEM_NRS, 'SystemUser', GS_PASSWORD, 0, 0);
  if (!r.session) {
    throw new Error(`SystemUser login failed: ${r.err.message || `error ${r.err.number}`}`);
  }
  const handle = r.session;
  const utf8 = gci.GciTsResolveSymbol(handle, 'Utf8', OOP_NIL).result;
  const exec: QueryExecutor = (_label, code) => {
    const { data, err } = gci.GciTsExecuteFetchBytes(handle, code, -1, utf8, OOP_ILLEGAL, OOP_NIL, MAX_RESULT);
    if (err.number !== 0) throw new Error(`${err.message || `GCI error ${err.number}`} | source: ${code}`);
    return String(data);
  };
  return {
    exec,
    logout: () => {
      try { gci.GciTsAbort(handle); } catch { /* ignore */ }
      try { gci.GciTsLogout(handle); } catch { /* ignore */ }
    },
  };
}

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Every file under `root` keyed by relative path — so the class-source assertion
// is agnostic to the project's packagesPath layout.
function readTree(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string, rel: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, r);
      else out.set(r, fs.readFileSync(full, 'utf8'));
    }
  };
  walk(root, '');
  return out;
}

// Create a disk-repo project with a class, loaded into the image, whose class
// source is NOT yet written to disk — the drifted starting state.
const createCode = (projectsHome: string) => `| p |
[Rowan gemstoneTools topaz unloadProjectNamed: '${PROJECT}'] on: Error do: [:e | nil].
p := (Rowan newProjectNamed: '${PROJECT}')
  projectsHome: '${projectsHome}';
  gemstoneSetDefaultSymbolDictNameTo: 'UserGlobals';
  repoType: #disk;
  addLoadComponentNamed: 'Core';
  addPackagesNamed: { '${PACKAGE}' } toComponentNamed: 'Core';
  comment: 'throwaway commit-to-disk probe';
  yourself.
(p packageNamed: '${PACKAGE}')
  addClassNamed: '${CLASS}' super: 'Object' instvars: #('ivar') category: '${PACKAGE}' comment: 'a thing'.
p load.
'ok'`;

describe('Commit to Disk reconciles a drifted Rowan project', () => {
  let sys: SysSession;
  let rowanAvailable = false;
  const tmpDirs: string[] = [];

  beforeAll(() => {
    sys = loginSystemUser();
    rowanAvailable = listRowanProjects(sys.exec).available;
  });

  afterAll(() => {
    try { sys?.exec('cleanup', `[Rowan gemstoneTools topaz unloadProjectNamed: '${PROJECT}'] on: Error do: [:e | nil]. System commitTransaction. 'ok'`); } catch { /* ignore */ }
    sys?.logout();
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  });

  it('writes image content to disk in place and clears the drift', (ctx) => {
    // No Rowan in this image (e.g. the bare-extent test stone) → skip visibly.
    if (!rowanAvailable) ctx.skip();

    const home = mkTmp('jasper-rowan-commit-home-');
    tmpDirs.push(home);
    const root = path.join(home, PROJECT);

    expect(sys.exec('create', createCode(home)).trim()).toBe('ok');

    // Precondition: the class lives in the image but not on disk → drift.
    const before = diffRowanProject(sys.exec, PROJECT);
    expect(before.ok, before.error).toBe(true);
    expect(before.operations.length).toBeGreaterThan(0);

    const result = commitRowanProject(sys.exec, PROJECT);
    expect(result.success, result.detail).toBe(true);

    // Postcondition 1: the drift is gone — image and disk now agree.
    const after = diffRowanProject(sys.exec, PROJECT);
    expect(after.ok, after.error).toBe(true);
    expect(after.operations).toEqual([]);

    // Postcondition 2: the class source was written under the project's OWN root.
    const tree = readTree(root);
    const classFile = [...tree.entries()].find(([rel]) => rel.endsWith(`${CLASS}.class.st`));
    expect(classFile, `${CLASS}.class.st not found under ${root}`).toBeDefined();
    expect(classFile![1]).toContain(CLASS);
  }, TIMEOUT);
});
