/**
 * Page Object over the Stage Browser — the cascading class-browser panes in the
 * GemStone sidebar (Dictionaries → Class Categories → Classes → Hierarchy →
 * Methods), which appear only once a session is connected. Panes are native
 * TreeViews; their section headers read "<Name> Section" and may start collapsed.
 */
import { Page, Locator } from '@playwright/test';

export class StageBrowser {
  constructor(private readonly page: Page) {}

  /** A pane's collapsible section-header toggle (e.g. "Classes Section"). */
  header(title: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`${title}.*Section`) });
  }

  /** A Stage Browser pane by its title. */
  pane(title: string): Locator {
    return this.page.locator('.part.sidebar .pane', { has: this.header(title) });
  }

  /** Expand a pane if it's collapsed (its rows aren't rendered until then). */
  async openPane(title: string): Promise<void> {
    const h = this.header(title);
    if ((await h.getAttribute('aria-expanded')) === 'false') await h.click();
  }

  /**
   * A tree row in a pane, matched EXACTLY by name. Stage Browser rows expose an
   * accessible name of "<Name>, has actions" (or just "<Name>"), so a plain
   * substring would also match ByteArray, ArrayedCollection, … for "Array". Anchor
   * on the start + a name boundary so "Array" hits only the Array class.
   */
  row(paneTitle: string, name: string | RegExp): Locator {
    const exact = typeof name === 'string'
      ? new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(,|$)`)
      : name;
    return this.pane(paneTitle).getByRole('treeitem', { name: exact });
  }
}
