/**
 * The BDD `test` for the whole suite: playwright-bdd's `test` (which carries the
 * Gherkin runtime) extended with Jasper's fixtures. Every step file does
 * `import { test } from '../fixtures/test'` and `createBdd(test)`, so bddgen
 * generates specs that import this same instance.
 */
import { test as base } from 'playwright-bdd';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { launchVSCode, LaunchedVSCode } from './vscode';

export type AcceptanceWorkerFixtures = {
  /** An isolated VS Code + Jasper, launched once per worker. */
  vscodeApp: LaunchedVSCode;
};

export type AcceptanceTestFixtures = {
  /** The workbench page, ready to drive. */
  window: Page;
  /**
   * Capture a deliberately-named "screen" into the living-documentation manual,
   * in addition to the automatic per-step screenshot. Use at meaningful UI
   * milestones so the manual can reference stable, named screens.
   */
  screen: (name: string) => Promise<void>;
};

export const test = base.extend<AcceptanceTestFixtures, AcceptanceWorkerFixtures>({
  vscodeApp: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const vscode = await launchVSCode();
      await use(vscode);
      await vscode.dispose();
    },
    { scope: 'worker' },
  ],

  window: async ({ vscodeApp }, use) => {
    await use(vscodeApp.window);
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
