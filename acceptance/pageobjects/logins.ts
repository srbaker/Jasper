/**
 * Thin Page Object over the "Logins & Sessions" view — a configured login row,
 * its inline Login action, and the live session that appears under it.
 */
import { Page, Locator } from '@playwright/test';

export class LoginsView {
  constructor(private readonly page: Page) {}

  get sidebar(): Locator {
    return this.page.locator('.part.sidebar');
  }

  /** A configured login row, e.g. "DataCurator on <stone>". */
  login(userMatch: RegExp): Locator {
    return this.sidebar.getByRole('treeitem', { name: userMatch });
  }

  /** Click the inline Login action on a login row. */
  async connect(userMatch: RegExp): Promise<void> {
    const row = this.login(userMatch);
    await row.hover();
    await row.getByRole('button', { name: 'Login', exact: true }).click();
  }

  /** A live session node under a login (e.g. "Session 1"). */
  get session(): Locator {
    return this.sidebar.getByText(/Session \d+/);
  }
}
