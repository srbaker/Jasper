/**
 * Steps for features/connect.feature. The `@stone` tag provisions an
 * acceptance-owned stone (see fixtures/stone.ts) and seeds a login for it before
 * VS Code launches, so the login is already configured when the scenario starts.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { Workbench } from '../pageobjects/workbench';
import { LoginsView } from '../pageobjects/logins';

const { Given, When, Then } = createBdd(test);

Given('a login is configured for the test stone', async ({ window, screen }) => {
  await new Workbench(window).openGemStoneSidebar();
  await expect(new LoginsView(window).login(/DataCurator on/)).toBeVisible();
  await screen('A configured login, ready to connect');
});

When('I log in', async ({ window }) => {
  await new LoginsView(window).connect(/DataCurator on/);
});

Then('a live session appears under the login', async ({ window, screen }) => {
  await expect(new LoginsView(window).session).toBeVisible({ timeout: 60_000 });
  await screen('A live GemStone session');
});
