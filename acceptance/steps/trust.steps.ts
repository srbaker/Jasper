/**
 * Steps for features/trust.feature — the Workspace Trust dialog. The `@trust`
 * tag makes the fixture launch with Workspace Trust enabled and the startup
 * prompt forced, so the dialog appears over a freshly-opened folder.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { WorkspaceTrust } from '../pageobjects/workspaceTrust';

const { Given, When, Then } = createBdd(test);

Given('I open a project folder VS Code has not seen before', async ({ window }) => {
  // The @trust fixture already opened a fresh throwaway folder with Workspace
  // Trust on; just confirm the workbench came up.
  await expect(window.locator('.monaco-workbench')).toBeVisible();
});

Then('VS Code asks whether I trust the authors', async ({ window }) => {
  await expect(new WorkspaceTrust(window).dialog).toBeVisible();
});

When('I trust the authors', async ({ window }) => {
  await new WorkspaceTrust(window).trust();
});

Then('the workspace is trusted', async ({ window }) => {
  // The dialog closing isn't enough — dismissing on "No" also closes it. The
  // workspace is trusted only when the Restricted Mode indicator is gone.
  const trust = new WorkspaceTrust(window);
  await expect(trust.dialog).toBeHidden();
  await expect(trust.restrictedMode).toHaveCount(0, { timeout: 15_000 });
});
