/**
 * Steps for features/no-workspace.feature. `@no-workspace` launches VS Code with
 * no folder open but a login configured (at user scope). Logging in trips
 * Jasper's "please open a folder" guard — the behaviour this chapter documents —
 * before it ever tries to reach a stone, so no stone is needed here.
 *
 * Login is triggered from the command palette rather than the login row's inline
 * Login action: the guard runs at the very top of the command (before it touches
 * the tree item), and the palette is deterministic, where the hover-to-reveal
 * inline button is flaky under the notification churn a folderless window
 * produces (the language server has nothing to attach to and restarts noisily).
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { Workbench } from '../pageobjects/workbench';
import { runCommand } from '../pageobjects/palette';

const { Given, When, Then } = createBdd(test);

Given('I have opened Jasper without a folder', async ({ window, screen }) => {
  await new Workbench(window).openGemStoneSidebar();
  await screen('Jasper with no folder open');
});

When('I try to log in', async ({ window }) => {
  await runCommand(window, 'GemStone: Login');
});

Then('Jasper asks me to open a folder first', async ({ window, screen }) => {
  // The guard fires an error notification. Open the notification centre (the
  // status-bar bell) and read it from there, so the assertion doesn't race the
  // toast's auto-dismiss amid the language-server restart notifications.
  await window.locator('.part.statusbar').getByRole('button', { name: /Notifications/ }).click();
  // Matches both the notification message and its ARIA-alert mirror — either
  // proves the guidance is shown.
  await expect(window.getByText(/open a folder in the workspace/i).first()).toBeVisible({ timeout: 15_000 });
  await screen('The guidance to open a folder first');
});
