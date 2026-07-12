/**
 * Steps for features/rowan-settings.feature. Opens the HelloRowan manifest
 * (rowan/specs/HelloRowan.ston) and switches it to the STON settings editor — a
 * custom editor (webview) that renders the project's metadata as a form. Pure
 * disk; no stone.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { runCommand } from '../pageobjects/palette';
import { Workbench } from '../pageobjects/workbench';

// The Given "I have opened the HelloRowan project" is shared — defined in
// rowan-project.steps.ts (step definitions are global across the suite).
const { When, Then } = createBdd(test);

When('I open the project manifest as settings', async ({ window }) => {
  // Open the manifest from the file tree (deterministic, no keyboard focus
  // races), then switch it to the STON settings editor. The "View as Settings"
  // command is gated on resourceExtname == .ston, so the .ston must be active.
  // The shared Given opened the GemStone sidebar (for the project view); switch to
  // the file Explorer to reach the manifest on disk.
  await new Workbench(window).openExplorer();
  const files = window.getByRole('tree', { name: 'Files Explorer' });
  await files.getByRole('treeitem', { name: 'rowan', exact: true }).click(); // expand
  await files.getByRole('treeitem', { name: 'specs', exact: true }).click(); // expand
  await files.getByRole('treeitem', { name: /HelloRowan\.ston/ }).click(); // open
  await runCommand(window, 'GemStone: View as Settings');
});

Then('the STON settings editor shows the project', async ({ window }) => {
  // The settings editor is a webview showing the project name. With the GemStone
  // sidebar open, the Sessions launcher is ALSO a Jasper webview, so target the
  // right one by content: find the frame that renders "HelloRowan" (the manifest
  // form) rather than a scoped FrameLocator that would match both webviews.
  await expect
    .poll(
      async () => {
        for (const frame of window.frames()) {
          if (await frame.getByText(/HelloRowan/).count().catch(() => 0)) return true;
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
});
