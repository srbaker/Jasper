/**
 * Steps for features/execute.feature. Depends on a live session (the shared
 * "I am logged in" Given in session.steps.ts). One interaction per step — open a
 * workspace, type the expression, Display It, read the result — so each screen is
 * captured. Commands go through the palette with their full "GemStone:" names so
 * they don't collide with VS Code built-ins. The stone fixture runs Display It in
 * "insert" mode, so the result is inserted as readable document text (not the
 * default overlay, a CSS pseudo-element); polling the editor text also waits out
 * the async on-stone evaluation.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { runCommand } from '../pageobjects/palette';

const { When, Then } = createBdd(test);

const editor = (window: import('@playwright/test').Page) =>
  window.locator('.part.editor .monaco-editor').first();

When('I open a workspace', async ({ window }) => {
  await runCommand(window, 'GemStone: Open Workspace');
  await expect(editor(window)).toBeVisible({ timeout: 30_000 });
});

When('I enter the expression {string}', async ({ window }, code: string) => {
  await editor(window).click();
  await window.keyboard.type(code);
  await window.keyboard.press('ControlOrMeta+a'); // select it (Ctrl on Linux, Cmd on macOS)
  await expect(editor(window)).toContainText(code);
});

When('I Display It', async ({ window }) => {
  await runCommand(window, 'GemStone: Display It');
});

Then('the result {string} is shown', async ({ window }, value: string) => {
  // Insert mode writes the result into the document once the on-stone evaluation
  // returns; poll the editor text until it lands.
  await expect(editor(window)).toContainText(value, { timeout: 30_000 });
});
