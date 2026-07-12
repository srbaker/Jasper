/**
 * Steps for features/rowan-load.feature. Depends on a live session (the shared
 * "I am logged in" Given) and the HelloRowan project open on disk (@rowan-project).
 * Loading is UI-only: click the "Load into Image" action on the project's row in
 * the Rowan view. Load runs over a transient SystemUser session internally, then
 * offers to refresh the (DataCurator) session — click Refresh so the loaded
 * classes are visible.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { RowanView } from '../pageobjects/rowanView';

const { When, Then } = createBdd(test);

When('I load the {string} project into the image', async ({ window }, project: string) => {
  const rowan = new RowanView(window);
  await rowan.open();
  await rowan.expand('Repositories');
  await rowan.loadIntoImage(project);
  // The Rowan view re-queries the image only on refresh — refresh it so the newly
  // loaded project shows up.
  await rowan.refresh();
});

Then('the project appears under Loaded Projects', async ({ window }) => {
  const rowan = new RowanView(window);
  await rowan.expand('Loaded Projects');
  // Before loading there is one HelloRowan row (the repository); after loading a
  // second appears under Loaded Projects.
  await expect(rowan.row(/HelloRowan/)).toHaveCount(2, { timeout: 30_000 });
});
