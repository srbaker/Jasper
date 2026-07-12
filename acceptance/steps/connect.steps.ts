/**
 * Steps for features/connect.feature. The `@stone` tag provisions an
 * acceptance-owned stone (a fresh rowan3 extent; see fixtures/stone.ts) and seeds
 * a DataCurator login for it before VS Code launches, so the login is already
 * configured when the scenario starts. Login is driven through the Login Launcher
 * (the sidebar webview that replaced the old Logins & Sessions tree).
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { Workbench } from '../pageobjects/workbench';
import { LoginLauncher } from '../pageobjects/loginLauncher';
import { dismissWalkthrough } from '../pageobjects/walkthrough';
import { jasperWebview } from '../pageobjects/webview';

const { Given, When, Then } = createBdd(test);

Given('a login is configured for the test stone', async ({ window }) => {
  await new Workbench(window).openGemStoneSidebar();
  await expect(new LoginLauncher(window).login(/DataCurator/)).toBeVisible({ timeout: 30_000 });
});

When('I log in', async ({ window }) => {
  await new LoginLauncher(window).connect();
});

Then('a live session appears under the login', async ({ window }) => {
  // Connected for real: the disconnect (⏹) button appears only when a session is
  // live. NOT a /Connected/i text match — "Not connected" contains "connected".
  await expect(new LoginLauncher(window).disconnectButton).toBeVisible({ timeout: 60_000 });
  // The first connect opens the (being-replaced) Getting Started walkthrough over
  // the editor; close it so this chapter's screenshot shows the connected UI.
  await dismissWalkthrough(window);
});

When('I log out', async ({ window }) => {
  await new LoginLauncher(window).disconnectButton.click();
  // A fresh login always carries a little uncommitted transaction state, so logging
  // out prompts to confirm — discard it.
  const dialog = window.locator('.monaco-dialog-box');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole('button', { name: /Logout Anyway/i }).click();
});

Then('the stone appears under Recent', async ({ window }) => {
  // After disconnecting, the just-used stone shows under a "Recent" heading with a
  // reconnect action — history for one-click return.
  const frame = jasperWebview(window);
  await expect(frame.getByText('Recent', { exact: true })).toBeVisible({ timeout: 30_000 });
  // The recent row is stamped with how long ago it was — unique to it (the same
  // login also lingers under "Other logins").
  await expect(frame.getByText(/just now|ago/).first()).toBeVisible();
});

When('I add a login from the Sessions view', async ({ window }) => {
  await jasperWebview(window).getByText('Add login', { exact: true }).click();
});

Then('a form for a new login appears', async ({ window }) => {
  // The login editor opens in add mode (its own webview panel). Target it by content
  // — the add-mode subtitle is unique to it — searching every frame.
  await expect
    .poll(
      async () => {
        for (const frame of window.frames()) {
          if (await frame.getByText(/Connection parameters for this login/).count().catch(() => 0)) return true;
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
});

When('I commit the session', async ({ window }) => {
  await jasperWebview(window).locator('.iconbtn[data-act="commit"]').click();
});

Then('the commit succeeds', async ({ window }) => {
  await expect(window.getByText(/Commit succeeded/).first()).toBeVisible({ timeout: 30_000 });
});

When('I abort the session', async ({ window }) => {
  await jasperWebview(window).locator('.iconbtn[data-act="abort"]').click();
  // A fresh session carries uncommitted transaction state, so aborting confirms —
  // discard it.
  const dialog = window.locator('.monaco-dialog-box');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole('button', { name: /Abort Anyway/i }).click();
});

Then('the abort succeeds', async ({ window }) => {
  await expect(window.getByText(/Abort succeeded/).first()).toBeVisible({ timeout: 30_000 });
});
