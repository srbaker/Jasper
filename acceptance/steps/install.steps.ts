/**
 * Steps for features/install.feature — installing Jasper from the Marketplace
 * into a bare VS Code (the `@install` tag makes the fixture launch bare).
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { Workbench } from '../pageobjects/workbench';
import { ExtensionsView } from '../pageobjects/extensions';

const { Given, When, Then } = createBdd(test);

Given('a bare VS Code with no extensions installed', async ({ window, screen }) => {
  await expect(window.locator('.monaco-workbench')).toBeVisible();
  // Jasper is not installed yet — there is no GemStone activity in the bar.
  await expect(new Workbench(window).gemstoneActivityItem).toHaveCount(0);
  await screen('A bare VS Code, before installing Jasper');
});

When('I search the Marketplace for {string}', async ({ window, screen }, query: string) => {
  const extensions = new ExtensionsView(window);
  await extensions.open();
  await extensions.search(query);
  await screen('Searching the Marketplace');
});

When('I install the Jasper extension', async ({ window, screen }) => {
  const extensions = new ExtensionsView(window);
  await extensions.openDetails('Jasper');
  await screen('The Jasper extension on the Marketplace');

  await extensions.clickInstall();

  // A fresh install usually activates immediately; some contributions ask for a
  // reload. Take whichever path VS Code offers.
  const workbench = new Workbench(window);
  await Promise.race([
    workbench.gemstoneActivityItem.waitFor({ state: 'visible', timeout: 120_000 }),
    extensions.reloadButton.waitFor({ state: 'visible', timeout: 120_000 }),
  ]);
  if (await extensions.reloadButton.isVisible().catch(() => false)) {
    await extensions.reloadButton.click();
    await window.waitForSelector('.monaco-workbench', { timeout: 60_000 });
  }
});

Then('the GemStone activity appears in the sidebar', async ({ window, screen }) => {
  await expect(new Workbench(window).gemstoneActivityItem).toBeVisible({ timeout: 120_000 });
  await screen('Jasper installed — the GemStone activity');
});
