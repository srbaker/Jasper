/**
 * Page Object over the "Web Apps" view — a section in the GemStone sidebar that
 * is HIDDEN until WebGS is loaded in the connected session. `section` is the pane
 * header (asserting it proves the gating); `tree` is the view itself.
 */
import { Page, Locator } from '@playwright/test';

export class WebAppsView {
  constructor(private readonly page: Page) {}

  /** The "Web Apps" section header — present only when WebGS is loaded. */
  get section(): Locator {
    return this.page.locator('.part.sidebar').getByRole('button', { name: /^Web Apps.*Section/ });
  }

  /** Expand the Web Apps section if it's collapsed. */
  async open(): Promise<void> {
    const s = this.section;
    if ((await s.getAttribute('aria-expanded')) === 'false') await s.click();
  }

  /** The Web Apps tree. */
  get tree(): Locator {
    return this.page.locator('.part.sidebar').getByRole('tree', { name: 'Web Apps' });
  }

  /** A row (app or route) by visible text. */
  row(name: string | RegExp): Locator {
    return this.tree.getByRole('treeitem').filter({ hasText: name });
  }

  /** Expand an app row if it isn't already (stopped apps start collapsed). */
  async expand(name: string | RegExp): Promise<void> {
    const row = this.row(name).first();
    if ((await row.getAttribute('aria-expanded')) === 'false') await row.click();
  }
}
