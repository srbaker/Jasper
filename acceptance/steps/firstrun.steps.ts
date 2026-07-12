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

const { Then } = createBdd(test);

Then('I am offered to get started in one click', async ({ window }) => {
  await expect(jasperWebview(window).getByText('Get started', { exact: true })).toBeVisible({ timeout: 30_000 });
});

Then('I can choose to set up with options', async ({ window }) => {
  await expect(jasperWebview(window).getByText(/Set up with options/)).toBeVisible({ timeout: 10_000 });
});

Then('I can choose to connect to an existing stone', async ({ window }) => {
  await expect(jasperWebview(window).getByText(/Connect to an existing stone/)).toBeVisible({ timeout: 10_000 });
});
