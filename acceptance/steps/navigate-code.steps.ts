/**
 * Steps for features/browsing/navigate-code.feature. Depends on a live session.
 * "Implementors Of…" / "Senders Of…" resolve a selector (prompting when nothing is
 * selected) and list every matching method in a quick-pick to jump to.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { runCommand } from '../pageobjects/palette';

const { When, Then } = createBdd(test);

async function lookUp(window: import('@playwright/test').Page, command: string, selector: string) {
  await runCommand(window, command);
  // The selector prompt (no editor selection → an input box).
  const qi = window.locator('.quick-input-widget');
  await expect(qi.getByText('Enter selector')).toBeVisible({ timeout: 10_000 });
  await window.keyboard.type(selector);
  await window.keyboard.press('Enter');
}

When('I look up implementors of {string}', async ({ window }, selector: string) => {
  // The "…" title is the prompt-for-selector command (gemstone.implementorsOf); the
  // dot-less "Implementors Of" is the Stage-Browser context variant.
  await lookUp(window, 'GemStone: Implementors Of...', selector);
});

When('I look up senders of {string}', async ({ window }, selector: string) => {
  await lookUp(window, 'GemStone: Senders Of...', selector);
});

Then('matching methods are listed', async ({ window }) => {
  // The results quick-pick lists "Class >> #selector" rows.
  await expect(window.locator('.quick-input-widget .monaco-list-row').first())
    .toBeVisible({ timeout: 30_000 });
});
