/**
 * Page Object over the "Rowan" view in the GemStone sidebar (gemstoneRowan) — the
 * one with Repositories / Loaded Projects / Changes sections (distinct from the
 * disk-first gemstoneRowanProject view in the Explorer). This is where you load a
 * project into the connected image and see whether it has drifted from disk.
 *
 * Rows are matched inside the sidebar's `tree "Rowan"` by visible text; the repo
 * row's accessible name is its filesystem path, so text is the stable handle.
 */
import { Page, Locator } from '@playwright/test';

export class RowanView {
  constructor(private readonly page: Page) {}

  /** The gemstoneRowan tree in the sidebar. */
  get tree(): Locator {
    return this.page.locator('.part.sidebar').getByRole('tree', { name: 'Rowan' });
  }

  /** The Rowan pane (the one containing the Rowan tree). */
  get pane(): Locator {
    return this.page.locator('.part.sidebar .pane', { has: this.page.getByRole('tree', { name: 'Rowan' }) });
  }

  /** Ensure the Rowan pane section is expanded (its tree renders only then). */
  async open(): Promise<void> {
    const section = this.page.locator('.part.sidebar').getByRole('button', { name: /^Rowan.*Section/ });
    if ((await section.getAttribute('aria-expanded')) === 'false') await section.click();
  }

  /** Click the pane's "Refresh Rowan View" action — the view re-queries the image
   *  (loaded projects, drift) only on refresh. */
  async refresh(): Promise<void> {
    await this.pane.hover();
    await this.pane.getByRole('button', { name: 'Refresh Rowan View' }).click();
  }

  /** A tree row (section, repo, loaded project, change) by visible text. */
  row(name: string | RegExp): Locator {
    return this.tree.getByRole('treeitem').filter({ hasText: name });
  }

  /** Expand a collapsible row if it isn't already. */
  async expand(name: string | RegExp): Promise<void> {
    const row = this.row(name).first();
    if ((await row.getAttribute('aria-expanded')) === 'false') await row.click();
  }

  /** Click the inline "Load into Image" action on a repository row. */
  async loadIntoImage(repo: string | RegExp): Promise<void> {
    const row = this.row(repo).first();
    await row.hover();
    await row.getByRole('button', { name: 'Load into Image' }).click();
  }
}
