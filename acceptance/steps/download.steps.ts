/**
 * Steps for features/download.feature. The @download tag points
 * `gemstone.rootPath` at a persistent cache, so a release is fetched once and
 * reused; an already-cached release short-circuits the download.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { VersionsView } from '../pageobjects/versions';

const { Given, When, Then } = createBdd(test);

Given('the available GemStone releases are listed', async ({ window }) => {
  await new VersionsView(window).open();
});

When('I download GemStone {string}', async ({ window }, version: string) => {
  const versions = new VersionsView(window);
  const started = await versions.startDownload(version);
  if (started) {
    await versions.waitForDownloadComplete();
  }
});

Then('GemStone {string} is downloaded', async ({ window }, version: string) => {
  const versions = new VersionsView(window);
  // The view refreshes asynchronously after the download (a network re-fetch),
  // so poll until the row reports the downloaded state rather than checking once.
  await expect
    .poll(() => versions.isDownloaded(version), {
      timeout: 30_000,
      message: `GemStone ${version} did not reach the downloaded state`,
    })
    .toBe(true);
});
