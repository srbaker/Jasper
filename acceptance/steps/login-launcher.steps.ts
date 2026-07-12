/**
 * Steps for features/login-launcher.feature. Reuses the shared Given/When from
 * sidebar.steps.ts (a fresh editor, open the GemStone sidebar). With no logins
 * configured, the launcher webview shows its empty state. The launcher is a
 * sidebar WebviewView — its controls live in the nested iframe.webview →
 * #active-frame.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

const { Then } = createBdd(test);

Then('the launcher shows {string} with a way to add one', async ({ window }, text: string) => {
  const frame = window.frameLocator('iframe.webview').frameLocator('#active-frame');
  await expect(frame.getByText(text)).toBeVisible({ timeout: 30_000 });
  await expect(frame.getByText('Add a login')).toBeVisible();
});
