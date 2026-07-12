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
  // The workspace opens with a scratch-pad template. Put the expression on a fresh
  // line at the end and select ONLY it (not Ctrl+A over the whole buffer, which
  // would compile the template prose and fail to evaluate) so Display It evaluates
  // just this expression.
  await window.keyboard.press('ControlOrMeta+End');
  await window.keyboard.type(`\n${code}`);
  await window.keyboard.press('Shift+Home');
  await expect(editor(window)).toContainText(code);
});

When('I Display It', async ({ window }) => {
  await runCommand(window, 'GemStone: Display It');
});

Then('the result {string} is shown', async ({ window }, value: string) => {
  // Insert mode inserts the result into the document AND decorates it. Assert the
  // DECORATED span specifically — VS Code marks a text-editor decoration with a
  // `ced-…TextEditorDecorationType…` class — so this catches the ACTUAL Display-It
  // result, not a coincidental occurrence of the value elsewhere in the workspace.
  const annotatedResult = editor(window)
    .locator('.view-line span[class*="TextEditorDecorationType"]')
    .filter({ hasText: value });
  await expect(annotatedResult).toBeVisible({ timeout: 30_000 });
});
