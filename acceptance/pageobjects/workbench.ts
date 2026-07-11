/**
 * Thin Page Object over the VS Code workbench. Its only job is to centralize the
 * fragile `.monaco-*` / ARIA selectors so the fragility lives in one place (per
 * the plan's Page Object Model discipline). Step definitions phrase behaviour;
 * this object knows the clicks.
 */
import { Page, Locator, expect } from '@playwright/test';

export class Workbench {
  constructor(private readonly page: Page) {}

  /** The GemStone item in the activity bar (the vertical icon strip). */
  get gemstoneActivityItem(): Locator {
    // Custom view containers get no default keybinding, so the aria-label is just
    // the container title. Match by prefix to tolerate any suffix VS Code adds.
    return this.page.locator('.activitybar [aria-label^="GemStone"]').first();
  }

  /** The primary sidebar part (the panel the activity bar reveals). */
  get sidebar(): Locator {
    return this.page.locator('.part.sidebar');
  }

  /** A view (pane) inside the sidebar, located by its header name. */
  view(name: string): Locator {
    return this.sidebar.locator('.pane', { has: this.page.getByText(name, { exact: true }) });
  }

  /** Click the GemStone activity-bar item and wait for its sidebar to appear. */
  async openGemStoneSidebar(): Promise<void> {
    await this.gemstoneActivityItem.click();
    await expect(this.sidebar).toBeVisible();
  }
}
