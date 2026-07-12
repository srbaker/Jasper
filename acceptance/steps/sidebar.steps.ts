/**
 * Steps for features/sidebar.feature.
 *
 * Behaviour is phrased in the feature; the mechanics (which item to click, which
 * pane to look for) live here and in the Workbench page object.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { Workbench } from '../pageobjects/workbench';

const { Given, When, Then } = createBdd(test);

Given('a fresh VS Code with the Jasper extension', async ({ window }) => {
  // The vscodeApp/window fixtures already launched an isolated VS Code with
  // Jasper loaded from source; confirm the workbench finished coming up.
  await expect(window.locator('.monaco-workbench')).toBeVisible();
});

When('I open the GemStone sidebar', async ({ window }) => {
  await new Workbench(window).openGemStoneSidebar();
});

Then('I see the GemStone views', async ({ window }) => {
  const workbench = new Workbench(window);
  await expect(workbench.view('Sessions')).toBeVisible();
});
