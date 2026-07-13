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
import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { RowanView } from '../pageobjects/rowanView';
import { WebAppsView } from '../pageobjects/webAppsView';

const { Given, When, Then } = createBdd(test);

const WEBGS_GIT = 'https://github.com/srbaker/WebGS.git#rowanize';

// Clone WebGS from GitHub and load a spec into the image, accepting the post-load
// "refresh this session" prompt. `specPattern` chooses the spec — the framework
// core (WebGS.ston) or the examples (WebGS-Examples.ston, which brings Sample).
async function cloneAndLoad(window: Page, specPattern: RegExp): Promise<void> {
  const rowan = new RowanView(window);
  await rowan.open();
  await rowan.addRepoFromGit(WEBGS_GIT);
  await rowan.expand('Repositories');
  await expect(rowan.row(/WebGS/).first()).toBeVisible({ timeout: 120_000 });
  await rowan.loadIntoImage(/WebGS/, specPattern);
  const refresh = window.locator('.notifications-toasts').getByRole('button', { name: 'Refresh', exact: true });
  await expect(refresh).toBeVisible({ timeout: 120_000 });
  await refresh.click();
}

When('I clone and load WebGS from GitHub', async ({ window }) => {
  await cloneAndLoad(window, /WebGS\.ston/);
});

Given('I have loaded the WebGS examples', async ({ window }) => {
  await cloneAndLoad(window, /WebGS-Examples\.ston/);
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

When('I open the Web Apps view', async ({ window }) => {
  const webApps = new WebAppsView(window);
  // The activity-bar icon exists only because WebGS is loaded — that's the gating.
  await expect(webApps.icon).toBeVisible({ timeout: 30_000 });
  await webApps.open();
});

Then('the Sample app lists its counter.gs endpoint', async ({ window }) => {
  const webApps = new WebAppsView(window);
  await expect(webApps.row(/Sample/).first()).toBeVisible({ timeout: 30_000 });
  await webApps.expand(/Sample/);
  await expect(webApps.row(/\/counter\.gs/).first()).toBeVisible({ timeout: 30_000 });
});
