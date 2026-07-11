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

/** The GemStone version the stone-backed chapters provision. */
const STONE_VERSION = '3.7.5';

export type AcceptanceTestFixtures = {
  /**
   * A provisioned acceptance stone for `@stone` scenarios (null otherwise).
   * `@stone:rowan` uses the shipped Rowan extent; plain `@stone` uses a bare one.
   */
  stone: TestStone | null;
  /** The workbench page for this scenario, ready to drive. */
  window: Page;
  /**
   * Capture a deliberately-named "screen" into the living-documentation manual,
   * in addition to the automatic per-step screenshot. Use at meaningful UI
   * milestones so the manual can reference stable, named screens.
   */
  screen: (name: string) => Promise<void>;
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
          `(bash acceptance/scripts/provision-stone.sh ${STONE_VERSION} bare)`,
      );
      await use(null);
      return;
    }
    const spec: StoneSpec = $tags.includes('@stone:rowan') ? 'rowan' : 'bare';
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
      workspaceSettings: stone ? loginSettings(stone) : undefined,
    });
    await use(vscode.window);
    await vscode.dispose();
  },

  screen: async ({ window }, use) => {
    const capture = async (name: string) => {
      const body = await window.screenshot();
      await test.info().attach(`screen: ${name}`, { body, contentType: 'image/png' });
    };
    await use(capture);
  },
});

export { expect };
