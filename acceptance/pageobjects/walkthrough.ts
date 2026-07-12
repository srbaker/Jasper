/**
 * Jasper opens its "Get Started with GemStone" walkthrough as a "Welcome" editor
 * tab on the first successful connect ([extension.ts] openWalkthrough). In the
 * sandbox every run is a fresh profile, so it fires on every connect and buries
 * the connected sidebar state the chapters document. The onboarding is being
 * replaced, so close it explicitly wherever we log in — the one future chapter
 * that redoes the walkthrough simply won't call this.
 */
import { Page } from '@playwright/test';

export async function dismissWalkthrough(page: Page): Promise<void> {
  // It opens asynchronously during connect, so wait briefly for the tab. Anything
  // here is best-effort: never fail a scenario because the onboarding tab was (or
  // was not) present.
  const tab = page
    .locator('.tabs-container .tab')
    .filter({ hasText: /Welcome|Get Started/ })
    .first();
  try {
    await tab.waitFor({ state: 'visible', timeout: 4_000 });
    // The tab's close (×) action-label reveals on hover; Playwright's click hovers
    // first. Fall back to any codicon-close within the tab.
    const close = tab
      .locator('.action-label.codicon-close, .tab-close .action-label, .codicon-close')
      .first();
    await close.click({ timeout: 2_000 });
    await tab.waitFor({ state: 'hidden', timeout: 4_000 });
  } catch {
    // Not open, or already closed — nothing to dismiss.
  }
}
