/**
 * Steps for features/no-workspace.feature. `@no-workspace` launches VS Code with
 * no folder open but a login configured (at user scope). Clicking that login's
 * Login action trips Jasper's "please open a folder" guard — the behaviour this
 * chapter documents — before it ever tries to reach a stone, so no stone is
 * needed here.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { Workbench } from '../pageobjects/workbench';
import { LoginsView } from '../pageobjects/logins';

const { Given, When, Then } = createBdd(test);

Given('I have opened Jasper without a folder', async ({ window, screen }) => {
  await new Workbench(window).openGemStoneSidebar();
  await screen('Jasper with no folder open');
});

When('I try to log in', async ({ window }) => {
  await new LoginsView(window).connect(/DataCurator on/);
});

Then('Jasper asks me to open a folder first', async ({ window, screen }) => {
  // The guard fires an error notification. Open the notification centre (the
  // status-bar bell) and read it from there, so the assertion doesn't race the
  // toast's auto-dismiss.
  await window.locator('.part.statusbar').getByRole('button', { name: /Notifications/ }).click();
  await expect(window.getByText(/open a folder in the workspace/i)).toBeVisible({ timeout: 15_000 });
  await screen('The guidance to open a folder first');
});
