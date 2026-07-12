/**
 * Steps for features/environment/install-enhanced-inspector.feature. Depends on a
 * live session (the shared "I am logged in" Given). The @enhanced-ask tag flips
 * `gemstone.enhancedInspector.autoInstall` to `ask`, so connecting to the fresh
 * (support-less) stone pops the modal install offer.
 *
 * Installing files classes into the database over a transient SystemUser session
 * (hence @systemuser on that scenario), commits them, and re-probes the session so
 * "Inspect It" then routes to the Enhanced Inspector webview instead of the
 * classic sidebar tree.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { EnhancedInspectorInstall } from '../pageobjects/enhancedInspector';
import { runCommand } from '../pageobjects/palette';

const { When, Then } = createBdd(test);

const editor = (window: import('@playwright/test').Page) =>
  window.locator('.part.editor .monaco-editor').first();

Then('Jasper offers to install the enhanced inspector', async ({ window }) => {
  const offer = new EnhancedInspectorInstall(window).offerDialog;
  // The offer is fired async after login, so give it room to appear. Assert the
  // real prompt text — not just any dialog — so this can't pass on an unrelated one.
  await expect(offer).toBeVisible({ timeout: 30_000 });
  await expect(offer).toContainText(/Install enhanced inspector support/i);
});

When('I choose Install', async ({ window }) => {
  const install = new EnhancedInspectorInstall(window);
  await install.offerButton(/^Install$/).click();
  await expect(install.offerDialog).toBeHidden({ timeout: 10_000 });
  // The install files in 7 payloads and commits over a SystemUser session — wait
  // for its progress notification to appear and then clear, so the session has
  // been re-probed (enhanced inspector available) before we inspect.
  await expect(install.installProgress).toBeVisible({ timeout: 30_000 });
  await expect(install.installProgress).toBeHidden({ timeout: 180_000 });
});

When('I install the enhanced inspector from the Command Palette', async ({ window }) => {
  const install = new EnhancedInspectorInstall(window);
  // The command is only offered once a session is live and the stone supports it
  // (when: gemstone.hasActiveSession && gemstone.enhancedInspectorSupported).
  await runCommand(window, 'GemStone: Install Enhanced Inspector Support');
  // Same install as the offer's "Install" — a progress notification that clears on
  // success, re-probing the session so Inspect It then routes to the enhanced view.
  await expect(install.installProgress).toBeVisible({ timeout: 30_000 });
  await expect(install.installProgress).toBeHidden({ timeout: 180_000 });
});

When('I inspect the expression {string}', async ({ window }, code: string) => {
  await runCommand(window, 'GemStone: Open Workspace');
  await expect(editor(window)).toBeVisible({ timeout: 30_000 });
  await editor(window).click();
  // The workspace opens with a scratch-pad template; put the expression on a fresh
  // line at the end and select ONLY it (Shift+Home), so Inspect It evaluates just
  // "3 + 4" — selecting the whole buffer (Ctrl+A) would compile the template prose
  // and fail with a CompileError.
  await window.keyboard.press('ControlOrMeta+End');
  await window.keyboard.type(`\n${code}`);
  await window.keyboard.press('Shift+Home');
  await runCommand(window, 'GemStone: Inspect It');
});

Then('the enhanced inspector opens', async ({ window }) => {
  // Once the support is installed, Inspect It opens the Enhanced Inspector — a rich
  // webview with a Raw/Print/Meta view switcher. The classic inspector is a plain
  // sidebar tree with none of that, so this fails if the install didn't take and
  // Inspect It fell back to the classic inspector.
  const install = new EnhancedInspectorInstall(window);
  await expect.poll(() => install.enhancedInspectorPresent(), { timeout: 30_000 }).toBe(true);
});

When('I dismiss the offer', async ({ window }) => {
  const install = new EnhancedInspectorInstall(window);
  // Escape is the modal's cancel ("not now") — leaves the setting alone, installs
  // nothing.
  await window.keyboard.press('Escape');
  await expect(install.offerDialog).toBeHidden({ timeout: 10_000 });
});

Then('the classic inspector opens', async ({ window }) => {
  const install = new EnhancedInspectorInstall(window);
  // Inspect It reveals the classic inspector — the sidebar tree with the object's
  // printString as a root ("7" for 3 + 4) — and does NOT open the enhanced webview.
  await expect(install.classicInspectorRoot('7')).toBeVisible({ timeout: 30_000 });
  expect(await install.enhancedInspectorPresent()).toBe(false);
});

Then('the enhanced inspector installs without prompting', async ({ window }) => {
  const install = new EnhancedInspectorInstall(window);
  // Auto-install (always) files the support in on connect with NO offer dialog —
  // just the install progress notification, which then clears on success.
  await expect(install.offerDialog).toHaveCount(0);
  await expect(install.installProgress).toBeVisible({ timeout: 30_000 });
  await expect(install.installProgress).toBeHidden({ timeout: 180_000 });
});
