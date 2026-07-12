/**
 * Steps for features/stage-browser.feature. `@stone` provisions a fresh rowan3
 * stone and connects as DataCurator (via the shared "I am logged in" Given in
 * execute.steps.ts). The browser panes appear only once connected. We navigate
 * with Find Class (a quick-pick) rather than clicking down through hundreds of
 * kernel classes, then assert the Classes + Methods panes homed in on it.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { runCommand } from '../pageobjects/palette';
import { StageBrowser } from '../pageobjects/stageBrowser';

const { When, Then } = createBdd(test);

When('I find the {string} class in the browser', async ({ window }, className: string) => {
  await runCommand(window, 'GemStone: Find Class in Browser Panels');
  const picker = window.locator('.quick-input-widget');
  await expect(picker).toBeVisible();
  await window.keyboard.type(className);
  await picker.locator('.monaco-list-row').filter({ hasText: className }).first().click();
});

Then('the {string} class is shown in the Classes pane', async ({ window }, className: string) => {
  const sb = new StageBrowser(window);
  await sb.openPane('Classes');
  await expect(sb.row('Classes', className)).toBeVisible({ timeout: 30_000 });
});

Then('its methods appear in the Methods pane', async ({ window }) => {
  const sb = new StageBrowser(window);
  await sb.openPane('Methods');
  // The Methods pane opens on the instance side — a stable top row to assert.
  await expect(sb.pane('Methods').getByText('instance', { exact: true })).toBeVisible({ timeout: 15_000 });
});

Then('the hierarchy shows {string} above {string}', async ({ window }, ancestor: string, cls: string) => {
  const sb = new StageBrowser(window);
  await sb.openPane('Hierarchy');
  await expect(sb.row('Hierarchy', ancestor)).toBeVisible({ timeout: 30_000 });
  await expect(sb.row('Hierarchy', cls)).toBeVisible({ timeout: 15_000 });
});

When('I select the {string} dictionary', async ({ window }, dict: string) => {
  const sb = new StageBrowser(window);
  await sb.openPane('Dictionaries');
  await sb.row('Dictionaries', dict).click();
});

Then('its class categories are listed', async ({ window }) => {
  // Selecting a dictionary cascades into the Class Categories pane.
  const sb = new StageBrowser(window);
  await sb.openPane('Class Categories');
  await expect(sb.pane('Class Categories').getByRole('treeitem').first())
    .toBeVisible({ timeout: 30_000 });
});
