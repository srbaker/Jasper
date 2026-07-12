/**
 * The BDD `test` for the whole suite: playwright-bdd's `test` (which carries the
 * Gherkin runtime) extended with Jasper's fixtures. Every step file does
 * `import { test } from '../fixtures/test'` and `createBdd(test)`, so bddgen
 * generates specs that import this same instance.
 *
 * The editor is launched **per scenario**, configured from the scenario's tags —
 * a cached launch is only a few seconds, and per-scenario launches keep every
 * scenario independent (which the living-documentation model wants) and let
 * different chapters use different editor modes:
 *   - default            → Jasper loaded from source (development mode)
 *   - `@install` / `@bare` → a bare editor, for installing Jasper from the marketplace
 */
import * as path from 'node:path';
import { test as base } from 'playwright-bdd';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { launchVSCode } from './vscode';
import {
  provisionStone,
  stopStone,
  stoneInstalled,
  loginSettings,
  type TestStone,
  type StoneSpec,
} from './stone';

/** Persistent, git-ignored cache for the "Download GemStone" chapter. */
const DOWNLOAD_CACHE = path.resolve(__dirname, '..', '.download-cache', 'gemstone-root');

/** A real Rowan project (HelloRowan) the disk-first Rowan chapters open. */
const ROWAN_PROJECT_FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'rowan-project');

/** The GemStone version the stone-backed chapters provision. */
const STONE_VERSION = '3.7.5';

/**
 * The `gemstone.enhancedInspector.autoInstall` mode a scenario opts into, or
 * undefined to keep the fixture default (`never`). Only the enhanced-inspector
 * chapter uses these: `@enhanced-ask` surfaces the modal offer on connect,
 * `@enhanced-always` auto-installs on connect.
 */
function enhancedInspectorAutoInstall(tags: string[]): 'ask' | 'always' | undefined {
  if (tags.includes('@enhanced-always')) return 'always';
  if (tags.includes('@enhanced-ask')) return 'ask';
  return undefined;
}

export type AcceptanceTestFixtures = {
  /**
   * A provisioned acceptance stone for `@stone` scenarios (null otherwise).
   * `@stone:rowan` uses the shipped Rowan extent; plain `@stone` uses a bare one.
   */
  stone: TestStone | null;
  /** The workbench page for this scenario, ready to drive. */
  window: Page;
};

export const test = base.extend<AcceptanceTestFixtures>({
  stone: async ({ $tags }, use) => {
    if (!$tags.includes('@stone')) {
      await use(null);
      return;
    }
    if (!stoneInstalled(STONE_VERSION)) {
      test.skip(
        true,
        `GemStone ${STONE_VERSION} is not installed for acceptance — provision it first ` +
          `(bash acceptance/scripts/provision-stone.sh ${STONE_VERSION} rowan)`,
      );
      await use(null);
      return;
    }
    // The DEFAULT stone is a rowan3-extent stone with default configs, reset
    // (re-copied from the shipped extent) fresh for every scenario. rowan3 is a
    // superset of bare — it has the kernel classes the browser tests need AND
    // Rowan — so it serves every stone chapter; opt into a bare extent only with
    // @stone:bare. The seeded login connects as DataCurator (a normal user): we
    // avoid SystemUser except where a test genuinely needs it, and such a test
    // must say so (tag @systemuser) since it runs with elevated privilege.
    const spec: StoneSpec = $tags.includes('@stone:bare') ? 'bare' : 'rowan';
    const stone = provisionStone(STONE_VERSION, spec);
    await use(stone);
    stopStone(STONE_VERSION);
  },

  window: async ({ $tags, stone }, use) => {
    const bare = $tags.includes('@install') || $tags.includes('@bare');
    const vscode = await launchVSCode({
      development: !bare,
      workspaceTrust: $tags.includes('@trust'),
      gemstoneRootPath: $tags.includes('@download') ? DOWNLOAD_CACHE : undefined,
      noWorkspace: $tags.includes('@no-workspace'),
      // @rowan-project opens a real Rowan project (the HelloRowan fixture) so the
      // disk-first project view lights up.
      workspaceSeed: $tags.includes('@rowan-project') ? ROWAN_PROJECT_FIXTURE : undefined,
      // Only a real @stone seeds a login (its running stone). Display It runs in
      // insert mode so its result is readable document text, not an unreadable
      // overlay pseudo-element. The enhanced-inspector chapter opts into the
      // install offer: @enhanced-ask surfaces the modal on connect; @enhanced-always
      // auto-installs. Everything else keeps the quiet `never` from loginSettings.
      workspaceSettings: stone
        ? {
            ...loginSettings(stone),
            'gemstone.displayItMode': 'insert',
            ...(enhancedInspectorAutoInstall($tags)
              ? { 'gemstone.enhancedInspector.autoInstall': enhancedInspectorAutoInstall($tags) }
              : {}),
          }
        : undefined,
    });
    await use(vscode.window);
    await vscode.dispose();
  },
});

export { expect };
