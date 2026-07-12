/**
 * Steps for features/rowan-settings.feature. Opens the HelloRowan manifest
 * (rowan/specs/HelloRowan.ston) and switches it to the STON settings editor — a
 * custom editor (webview) that renders the project's metadata as a form. Pure
 * disk; no stone.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { jasperWebview } from '../pageobjects/webview';
import { runCommand } from '../pageobjects/palette';

// The Given "I have opened the HelloRowan project" is shared — defined in
// rowan-project.steps.ts (step definitions are global across the suite).
const { When, Then } = createBdd(test);

When('I open the project manifest as settings', async ({ window }) => {
  // Open the manifest from the file tree (deterministic, no keyboard focus
  // races), then switch it to the STON settings editor. The "View as Settings"
  // command is gated on resourceExtname == .ston, so the .ston must be active.
  const files = window.getByRole('tree', { name: 'Files Explorer' });
  await files.getByRole('treeitem', { name: 'rowan', exact: true }).click(); // expand
  await files.getByRole('treeitem', { name: 'specs', exact: true }).click(); // expand
  await files.getByRole('treeitem', { name: /HelloRowan\.ston/ }).click(); // open
  await runCommand(window, 'GemStone: View as Settings');
});

Then('the STON settings editor shows the project', async ({ window }) => {
  // The settings editor is a webview: VS Code nests it in an outer .webview
  // iframe and an inner #active-frame.
  const frame = jasperWebview(window);
  await expect(frame.getByText(/HelloRowan/).first()).toBeVisible({ timeout: 30_000 });
});
