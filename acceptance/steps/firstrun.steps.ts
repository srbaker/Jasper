/**
 * Steps for features/getting-started/get-started.feature. No stone, no login — a
 * blank slate — so the Sessions view (the launcher webview) shows its first-run
 * chooser: Get started / Set up with options / Connect to an existing stone.
 * The "Given a fresh VS Code" and "When I open the GemStone sidebar" steps are
 * shared (sidebar.steps.ts).
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { jasperWebview } from '../pageobjects/webview';

const { When, Then } = createBdd(test);

Then('I am offered to get started in one click', async ({ window }) => {
  await expect(jasperWebview(window).getByText('Get started', { exact: true })).toBeVisible({ timeout: 30_000 });
});

Then('I can choose to set up with options', async ({ window }) => {
  await expect(jasperWebview(window).getByText(/Set up with options/)).toBeVisible({ timeout: 10_000 });
});

Then('I can choose to connect to an existing stone', async ({ window }) => {
  await expect(jasperWebview(window).getByText(/Connect to an existing stone/)).toBeVisible({ timeout: 10_000 });
});

When('I choose to connect to an existing stone', async ({ window }) => {
  await jasperWebview(window).getByText(/Connect to an existing stone/).click();
});

Then('a form for the connection details appears', async ({ window }) => {
  // The login editor opens as its own webview panel. With the Sessions launcher
  // also a Jasper webview, target it by content — the connect form's subtitle is
  // unique to it — searching every frame.
  await expect
    .poll(
      async () => {
        for (const frame of window.frames()) {
          if (await frame.getByText(/Point Jasper at a stone/).count().catch(() => 0)) return true;
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
});
