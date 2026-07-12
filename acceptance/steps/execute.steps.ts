/**
 * Steps for features/execute.feature. `@stone` provisions a stone and seeds the
 * login; the Given logs in to get a live session, then we open a workspace and
 * Display It. Commands go through the palette with their full "GemStone:" names
 * so they don't collide with VS Code built-ins. The stone fixture runs Display It
 * in "insert" mode, so its result is inserted as real document text after the
 * expression — readable, unlike the default overlay (a CSS pseudo-element) — and
 * polling the editor text also waits out the async on-stone evaluation.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { Workbench } from '../pageobjects/workbench';
import { LoginLauncher } from '../pageobjects/loginLauncher';
import { runCommand } from '../pageobjects/palette';

const { Given, When, Then } = createBdd(test);

Given('I am logged in to the test stone', async ({ window, screen }) => {
  await new Workbench(window).openGemStoneSidebar();
  const launcher = new LoginLauncher(window);
  await launcher.connect();
  await expect(launcher.status).toContainText(/Connected/i, { timeout: 60_000 });
  await screen('A live session');
});

When('I Display It on {string} in a workspace', async ({ window, screen }, code: string) => {
  await runCommand(window, 'GemStone: Open Workspace');
  const editor = window.locator('.part.editor .monaco-editor').first();
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.click();
  await window.keyboard.type(code);
  await window.keyboard.press('ControlOrMeta+a'); // select the expression (Ctrl on Linux, Cmd on macOS)
  await screen('An expression in a workspace');
  await runCommand(window, 'GemStone: Display It');
});

Then('the value {string} is shown', async ({ window, screen }, value: string) => {
  // In insert mode Display It writes its result into the document, so it shows up
  // as editor text once the on-stone evaluation returns; poll until it lands.
  const editor = window.locator('.part.editor .monaco-editor').first();
  await expect(editor).toContainText(value, { timeout: 30_000 });
  await screen('The result, inserted after the expression');
});
