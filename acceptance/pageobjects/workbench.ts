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

  /**
   * Ensure the Explorer sidebar (its "Files Explorer" tree) is showing — switching
   * to it if a DIFFERENT sidebar (e.g. the GemStone view) is currently open. Gate
   * on the Files Explorer tree itself, not just "some sidebar is visible": clicking
   * an already-active activity-bar item toggles the sidebar shut, so we click only
   * when the Files Explorer isn't already the visible view.
   */
  async openExplorer(): Promise<void> {
    const filesTree = this.page.getByRole('tree', { name: 'Files Explorer' });
    if (!(await filesTree.isVisible().catch(() => false))) {
      await this.page.locator('.activitybar [aria-label^="Explorer"]').first().click();
    }
    await expect(filesTree).toBeVisible();
  }
}
