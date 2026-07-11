/**
 * Thin Page Object over VS Code's Extensions view — the marketplace search,
 * an extension's details editor, and its Install button. Centralizes those
 * `.monaco-*` selectors so the "Install Jasper" chapter reads as behaviour.
 */
import { Page, Locator, expect } from '@playwright/test';

export class ExtensionsView {
  constructor(private readonly page: Page) {}

  /** The Extensions item in the activity bar. */
  get activityItem(): Locator {
    return this.page.locator('.activitybar [aria-label^="Extensions"]').first();
  }

  /** The Extensions viewlet container. */
  get viewlet(): Locator {
    return this.page.locator('.extensions-viewlet');
  }

  /**
   * The marketplace search box — a monaco mini-editor (no `placeholder`
   * attribute; the grey prompt is a non-interactive text overlay). Click the
   * editor itself to focus it, then type.
   */
  get searchEditor(): Locator {
    return this.viewlet.locator('.monaco-editor').first();
  }

  /** The extension details editor (opens when a result is clicked). */
  get detailsEditor(): Locator {
    return this.page.locator('.extension-editor');
  }

  /** The "Reload"/"Reload Required" button VS Code sometimes shows after install. */
  get reloadButton(): Locator {
    return this.page.getByRole('button', { name: /^Reload/ }).first();
  }

  /** Open the Extensions view and wait for it to render. */
  async open(): Promise<void> {
    await this.activityItem.click();
    await expect(this.page.getByRole('heading', { name: 'Extensions', level: 2 })).toBeVisible();
  }

  /** Type a marketplace query and wait for results to render. */
  async search(query: string): Promise<void> {
    await this.searchEditor.click();
    await this.page.keyboard.type(query);
    await this.viewlet.locator('.monaco-list-row').first().waitFor({ state: 'visible' });
  }

  /** The result row whose text contains `name` (e.g. "Jasper"). */
  resultItem(name: string): Locator {
    return this.page
      .locator('.extensions-viewlet .monaco-list-row')
      .filter({ hasText: name })
      .first();
  }

  /** Open an extension's details editor by clicking its result row. */
  async openDetails(name: string): Promise<void> {
    await this.resultItem(name).click();
    await expect(this.detailsEditor).toBeVisible();
  }

  /** Click Install in the open details editor. */
  async clickInstall(): Promise<void> {
    await this.detailsEditor.getByRole('button', { name: 'Install', exact: true }).click();
  }
}
