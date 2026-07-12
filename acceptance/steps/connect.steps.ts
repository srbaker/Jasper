/**
 * Steps for features/connect.feature. The `@stone` tag provisions an
 * acceptance-owned stone (a fresh rowan3 extent; see fixtures/stone.ts) and seeds
 * a DataCurator login for it before VS Code launches, so the login is already
 * configured when the scenario starts. Login is driven through the Login Launcher
 * (the sidebar webview that replaced the old Logins & Sessions tree).
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { Workbench } from '../pageobjects/workbench';
import { LoginLauncher } from '../pageobjects/loginLauncher';

const { Given, When, Then } = createBdd(test);

Given('a login is configured for the test stone', async ({ window, screen }) => {
  await new Workbench(window).openGemStoneSidebar();
  await expect(new LoginLauncher(window).login(/DataCurator/)).toBeVisible({ timeout: 30_000 });
  await screen('A configured login, ready to connect');
});

When('I log in', async ({ window }) => {
  await new LoginLauncher(window).connect();
});

Then('a live session appears under the login', async ({ window, screen }) => {
  // The launcher reports the connected session in its status line.
  await expect(new LoginLauncher(window).status).toContainText(/Connected/i, { timeout: 60_000 });
  await screen('A live GemStone session');
});
