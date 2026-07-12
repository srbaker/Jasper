/**
 * Steps for features/browsing/edit-method.feature. Depends on a live session. Uses
 * "Find Method…" to open a method's gemstone:// source editor (no System Browser
 * open, so it opens the editor directly), then edits and saves it. Saving a
 * gemstone:// document compiles the method back into the image — a successful
 * compile saves the tab; a failed one is rejected and leaves it dirty.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { runCommand } from '../pageobjects/palette';
import { StageBrowser } from '../pageobjects/stageBrowser';

const { When, Then } = createBdd(test);

const editor = (window: import('@playwright/test').Page) =>
  window.locator('.part.editor .monaco-editor').first();

When('I open a method from the browser', async ({ window }) => {
  // Navigate the Stage Browser to a class, then open one of its methods — clicking a
  // method opens its gemstone:// source editor with the real dictionary. (Find Method
  // from a bare class name leaves the dictionary blank, so go through the browser.)
  await runCommand(window, 'GemStone: Find Class in Browser Panels');
  const picker = window.locator('.quick-input-widget');
  await expect(picker).toBeVisible();
  await window.keyboard.type('Object');
  await picker.locator('.monaco-list-row').filter({ hasText: 'Object' }).first().click();

  const sb = new StageBrowser(window);
  await sb.openPane('Methods');
  const instance = sb.pane('Methods').getByRole('treeitem', { name: /^instance/ }).first();
  await expect(instance).toBeVisible({ timeout: 30_000 });
  // Keyboard-walk the side ▸ category ▸ selector tree (names are unknown) and open
  // the first method with Enter.
  await instance.click();
  await window.keyboard.press('ArrowRight'); // expand instance → categories
  await window.keyboard.press('ArrowDown');  // first category
  await window.keyboard.press('ArrowRight'); // expand category → selectors
  await window.keyboard.press('ArrowDown');  // first selector
  await window.keyboard.press('Enter');      // open the method source
  await expect(editor(window)).toBeVisible({ timeout: 30_000 });
});

Then('its source opens in an editor', async ({ window }) => {
  // A gemstone:// method document, edited/read like any file — its language mode is
  // GemStone (Smalltalk).
  await expect(editor(window)).toBeVisible({ timeout: 30_000 });
  await expect(window.locator('.part.statusbar').getByText(/GemStone \(Smalltalk\)/))
    .toBeVisible({ timeout: 15_000 });
});
