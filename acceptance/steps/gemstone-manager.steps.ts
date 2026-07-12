/**
 * Steps for features/gemstone-manager.feature. The Manager is a webview panel
 * (an editor tab) opened by a command — no stone needed; with nothing installed
 * it still renders its sections (versions/databases fall back to "none"). Its
 * controls live in VS Code's nested iframe.webview → #active-frame.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { runCommand } from '../pageobjects/palette';

const { When, Then } = createBdd(test);

When('I open the GemStone Manager', async ({ window }) => {
  await runCommand(window, 'GemStone Admin: GemStone Manager');
});

Then('it shows the Operating System, Versions, and Databases sections', async ({ window, screen }) => {
  const frame = window.frameLocator('iframe.webview').frameLocator('#active-frame');
  await expect(frame.getByText('Operating System')).toBeVisible({ timeout: 30_000 });
  await expect(frame.getByText('Versions', { exact: true })).toBeVisible();
  await expect(frame.getByText('Databases', { exact: true })).toBeVisible();
  await screen('The GemStone Manager');
});
