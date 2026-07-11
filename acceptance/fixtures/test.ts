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
import { test as base } from 'playwright-bdd';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { launchVSCode } from './vscode';

export type AcceptanceTestFixtures = {
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
  window: async ({ $tags }, use) => {
    const bare = $tags.includes('@install') || $tags.includes('@bare');
    const vscode = await launchVSCode({
      development: !bare,
      workspaceTrust: $tags.includes('@trust'),
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
