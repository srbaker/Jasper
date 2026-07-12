/**
 * Page Object over the "Rowan" project view — the disk-first tree Jasper shows in
 * the Explorer when the open folder is a Rowan project (packages → classes →
 * methods, read straight from the Tonel source). Its section header reads e.g.
 * "Rowan - HelloRowan Section" (the project name is the section description).
 */
import { Page, Locator } from '@playwright/test';

export class RowanProjectView {
  constructor(private readonly page: Page) {}

  /** The Rowan pane's collapsible section-header toggle. */
  get header(): Locator {
    return this.page.getByRole('button', { name: /Rowan.*Section/ });
  }

  /** The "Rowan" pane inside the Explorer. */
  get pane(): Locator {
    return this.page.locator('.pane', { has: this.header });
  }

  /** Expand the Rowan pane if it's collapsed (its body isn't rendered until then). */
  async open(): Promise<void> {
    if ((await this.header.getAttribute('aria-expanded')) === 'false') {
      await this.header.click();
    }
  }

  /**
   * A tree row in the Rowan view (package, class, or method) by its visible text.
   * Matched on text, not accessible name: package/class rows expose their file
   * path as the accessible name and method rows expose "instance · category", so
   * the visible label is the only uniform handle.
   */
  item(name: string | RegExp): Locator {
    return this.pane.getByRole('treeitem').filter({ hasText: name });
  }

  /** Expand a collapsed tree row (click its label). */
  async expand(name: string | RegExp): Promise<void> {
    await this.item(name).click();
  }
}
