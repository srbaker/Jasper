/**
 * Page Object over the "Web Apps" view — WebGS's own activity-bar container,
 * which is HIDDEN until WebGS is loaded in the connected session. `icon` is the
 * activity-bar entry (asserting it proves the gating); `tree` is the view itself.
 */
import { Page, Locator } from '@playwright/test';

export class WebAppsView {
  constructor(private readonly page: Page) {}

  /** The Web Apps entry in the activity bar (present only when WebGS is loaded). */
  get icon(): Locator {
    return this.page.locator('.activitybar').getByRole('tab', { name: /Web Apps/ });
  }

  /** Open the Web Apps container from the activity bar. */
  async open(): Promise<void> {
    await this.icon.click();
  }

  /** The Web Apps tree. */
  get tree(): Locator {
    return this.page.getByRole('tree', { name: 'Web Apps' });
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
