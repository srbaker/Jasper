/**
 * Steps for features/browsing/system-browser.feature. Depends on a live session.
 * The System Browser opens as its own webview editor panel titled "Browser".
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { runCommand } from '../pageobjects/palette';

const { When, Then } = createBdd(test);

When('I open the System Browser', async ({ window }) => {
  await runCommand(window, 'GemStone: Open System Browser');
});

Then('the class browser opens', async ({ window }) => {
  // It opens as an editor tab titled "Browser" (or "Browser: <class>").
  await expect(window.locator('.tabs-container .tab').filter({ hasText: /Browser/ }))
    .toBeVisible({ timeout: 30_000 });
});
