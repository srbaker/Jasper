/**
 * Page Object over the "Rowan" view in the GemStone sidebar (gemstoneRowan) — the
 * one with Repositories / Loaded Projects / Changes sections (distinct from the
 * disk-first gemstoneRowanProject view in the Explorer). This is where you load a
 * project into the connected image and see whether it has drifted from disk.
 *
 * Rows are matched inside the sidebar's `tree "Rowan"` by visible text; the repo
 * row's accessible name is its filesystem path, so text is the stable handle.
 */
import { Page, Locator, expect } from '@playwright/test';
import { runCommand } from './palette';

export class RowanView {
  constructor(private readonly page: Page) {}

  /** Add a Rowan repository by cloning a git URL — drive the "Add Rowan
   *  Repository…" command, choose "Clone from Git URL", and enter the URL (which
   *  may carry a `#branch`). Returns once the URL is submitted; the clone then
   *  runs and the repo row appears under Repositories. */
  async addRepoFromGit(url: string): Promise<void> {
    await runCommand(this.page, 'Add Rowan Repository');
    const qi = this.page.locator('.quick-input-widget');
    const clone = qi.locator('.monaco-list-row').filter({ hasText: 'Clone from Git URL' });
    await expect(clone).toBeVisible({ timeout: 15_000 });
    await clone.click();
    await expect(qi.locator('input.input')).toBeVisible();
    await this.page.keyboard.type(url);
    await this.page.keyboard.press('Enter');
  }

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

  /** Click the inline "Load into Image" action on a repository row. A project
   *  with more than one load spec then shows a "which spec?" QuickPick — pass
   *  `spec` (matched against the option text) to choose one. */
  async loadIntoImage(repo: string | RegExp, spec?: string | RegExp): Promise<void> {
    const row = this.row(repo).first();
    await row.hover();
    await row.getByRole('button', { name: 'Load into Image' }).click();
    if (spec !== undefined) {
      const option = this.page.locator('.quick-input-widget .monaco-list-row').filter({ hasText: spec });
      await expect(option.first()).toBeVisible({ timeout: 15_000 });
      await option.first().click();
    }
  }
}
