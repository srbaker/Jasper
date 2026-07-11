/**
 * Provision an acceptance-owned GemStone stone and turn it into the workspace
 * settings a login scenario needs. Reuses the repo's gs-*.sh machinery via
 * scripts/provision-stone.sh; the connection params come straight back (NOT
 * `.env.test`), because the acceptance suite provisioned them.
 *
 * The install lives under acceptance/.stone-cache (git-ignored, cached). Scenarios
 * pick a base extent by tag: bare (`extent0.dbf`) or rowan (shipped
 * `extent0.rowan3.dbf`).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

export type StoneSpec = 'bare' | 'rowan';

export interface TestStone {
  version: string;
  host: string;
  stone: string;
  netldi: string;
  user: string;
  password: string;
  gciLibraryPath: string;
}

const scriptsDir = path.resolve(__dirname, '..', 'scripts');

/** GemStone platform key, matching gs-config.sh (Darwin arm64, or Linux). */
function platformKey(): string {
  if (process.platform === 'darwin') return 'arm64.Darwin';
  return `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}.Linux`;
}

function installDir(version: string): string {
  return path.resolve(
    __dirname, '..', '.stone-cache', 'tmp', 'gemstone', `GemStone64Bit${version}-${platformKey()}`,
  );
}

/** True when the acceptance-owned GemStone is already installed (cached). */
export function stoneInstalled(version: string): boolean {
  return fs.existsSync(installDir(version));
}

/** Provision (start) the acceptance stone with the given base extent. */
export function provisionStone(version: string, spec: StoneSpec): TestStone {
  const stdout = execFileSync('bash', [path.join(scriptsDir, 'provision-stone.sh'), version, spec], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    timeout: 600_000,
  });
  return JSON.parse(stdout) as TestStone;
}

/** Stop the acceptance stone (fixture teardown). */
export function stopStone(version: string): void {
  try {
    execFileSync('bash', [path.join(scriptsDir, 'stop-stone.sh'), version], {
      stdio: 'ignore',
      timeout: 120_000,
    });
  } catch {
    /* best-effort teardown */
  }
}

/** Workspace settings that register the stone's GCI library and a login for it. */
export function loginSettings(stone: TestStone): Record<string, unknown> {
  return {
    'gemstone.gciLibraries': { [stone.version]: stone.gciLibraryPath },
    'gemstone.logins': [
      {
        version: stone.version,
        gem_host: stone.host,
        stone: stone.stone,
        gs_user: stone.user,
        gs_password: stone.password,
        netldi: stone.netldi,
      },
    ],
  };
}
