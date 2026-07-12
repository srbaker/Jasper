/**
 * Steps for features/webgs/webgs.feature — the WebGS + Rowan web-app chapter.
 * Depends on a live session on a Rowan-enabled stone (the @stone rowan3 fixture).
 *
 * WebGS is loaded straight from GitHub via the Rowan view's "Add Rowan Repository
 * → Clone from Git URL" path, pinned to the `rowanize` branch (the repo's default
 * branch predates the Rowan packaging). No fixture is vendored — the clone is the
 * real, mouse-driven action a user takes.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { RowanView } from '../pageobjects/rowanView';

const { When, Then } = createBdd(test);

const WEBGS_GIT = 'https://github.com/srbaker/WebGS.git#rowanize';

When('I clone and load WebGS from GitHub', async ({ window }) => {
  const rowan = new RowanView(window);
  await rowan.open();
  await rowan.addRepoFromGit(WEBGS_GIT);
  // The clone runs (network), then WebGS lands under Repositories — wait for it.
  await rowan.expand('Repositories');
  await expect(rowan.row(/WebGS/).first()).toBeVisible({ timeout: 120_000 });
  // WebGS ships two specs; load the framework core (WebGS.ston, not -Examples).
  await rowan.loadIntoImage(/WebGS/, /WebGS\.ston/);
  // The load commits on a separate loader session, then Jasper offers to refresh
  // this session so the new project becomes visible — accept it.
  const refresh = window.locator('.notifications-toasts').getByRole('button', { name: 'Refresh', exact: true });
  await expect(refresh).toBeVisible({ timeout: 120_000 });
  await refresh.click();
});

Then('WebGS appears under Loaded Projects', async ({ window }) => {
  const rowan = new RowanView(window);
  // The Rowan view re-queries only on refresh — refresh-and-check until the loaded
  // project shows (one WebGS row under Repositories from the clone, one under
  // Loaded Projects once loaded = two).
  await expect(async () => {
    await rowan.refresh();
    await rowan.expand('Loaded Projects');
    await expect(rowan.row(/WebGS/)).toHaveCount(2, { timeout: 2_000 });
  }).toPass({ timeout: 60_000, intervals: [2_000, 3_000] });
});
