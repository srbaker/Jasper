/**
 * Thin Page Object over Jasper's **Versions** view — the list of GemStone
 * releases (fetched from downloads.gemtalksystems.com). Each row carries inline
 * action buttons (Download, then Extract / Delete Download once fetched),
 * revealed on hover.
 */
import { Page, Locator, expect } from '@playwright/test';
import { Workbench } from './workbench';

export class VersionsView {
  constructor(private readonly page: Page) {}

  /** The Versions pane inside the GemStone sidebar. */
  get pane(): Locator {
    return this.page.locator('.pane', { has: this.page.getByText('Versions', { exact: true }) });
  }

  /** The progress notification shown while a release downloads ("Downloading
   * GemStone X…"). Deliberately does NOT match the "GemStone X downloaded."
   * completion toast, so waiting for it to hide means the download finished. */
  get progressToast(): Locator {
    return this.page
      .locator('.notifications-toasts .notification-toast')
      .filter({ hasText: /Downloading/i })
      .first();
  }

  /** The tree row for a release, located by its version number. */
  row(version: string): Locator {
    return this.pane
      .getByRole('treeitem', { name: new RegExp(`^${version.replace(/\./g, '\\.')}(\\s|$)`) })
      .first();
  }

  /** An inline action button on a release row (revealed on hover). */
  private action(version: string, name: string): Locator {
    return this.row(version).getByRole('button', { name, exact: true });
  }

  /** Open the GemStone sidebar and wait for the Versions list to populate. */
  async open(): Promise<void> {
    await new Workbench(this.page).openGemStoneSidebar();
    await expect(this.pane).toBeVisible();
    // Releases are fetched from the network; wait for at least one row.
    await this.pane.locator('.monaco-list-row').first().waitFor({ state: 'visible', timeout: 30_000 });
  }

  /**
   * Click a release's inline Download button. Returns false (does nothing) when
   * the release is already downloaded — the cache-hit case (no Download button).
   */
  async startDownload(version: string): Promise<boolean> {
    const row = this.row(version);
    await expect(row).toBeVisible();
    await row.hover();
    const download = this.action(version, 'Download');
    if (!(await download.isVisible().catch(() => false))) return false;
    await download.click();
    await this.progressToast.waitFor({ state: 'visible', timeout: 30_000 });
    return true;
  }

  /** Wait for the download progress notification to clear (release is large). */
  async waitForDownloadComplete(): Promise<void> {
    await this.progressToast.waitFor({ state: 'hidden', timeout: 900_000 });
  }

  /** True when the release is downloaded (its row offers an Extract action). */
  async isDownloaded(version: string): Promise<boolean> {
    const row = this.row(version);
    await expect(row).toBeVisible();
    await row.hover();
    return this.action(version, 'Extract').isVisible().catch(() => false);
  }
}
