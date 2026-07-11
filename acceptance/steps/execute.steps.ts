/**
 * Steps for features/execute.feature. `@stone` provisions a stone and seeds the
 * login; the Given logs in to get a live session, then we open a workspace and
 * Display It.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { Workbench } from '../pageobjects/workbench';
import { LoginsView } from '../pageobjects/logins';
import { runCommand } from '../pageobjects/palette';

const { Given, When, Then } = createBdd(test);

Given('I am logged in to the test stone', async ({ window, screen }) => {
  await new Workbench(window).openGemStoneSidebar();
  const logins = new LoginsView(window);
  await logins.connect(/DataCurator on/);
  await expect(logins.session).toBeVisible({ timeout: 60_000 });
  await screen('A live session');
});

When('I Display It on {string} in a workspace', async ({ window, screen }, code: string) => {
  await runCommand(window, 'Open Workspace');
  const editor = window.locator('.part.editor .monaco-editor').first();
  await editor.click();
  await window.keyboard.type(code);
  await window.keyboard.press('Meta+a'); // select the expression
  await screen('An expression in a workspace');
  await runCommand(window, 'Display It');
});

Then('the value {string} is shown', async ({ window, screen }, value: string) => {
  await expect(window.getByText(new RegExp(`⇒\\s*${value}`))).toBeVisible({ timeout: 30_000 });
  await screen('The result, shown inline');
});
