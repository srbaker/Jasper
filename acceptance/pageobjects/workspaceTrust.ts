/**
 * Thin Page Object over VS Code's Workspace Trust startup dialog — the modal that
 * asks whether you trust the authors of a folder before running its code.
 */
import { Page, Locator } from '@playwright/test';

export class WorkspaceTrust {
  constructor(private readonly page: Page) {}

  /** The modal trust dialog. */
  get dialog(): Locator {
    return this.page.locator('.monaco-dialog-box');
  }

  /**
   * The primary "Yes, I trust the authors" button. Must be the *Yes* one — the
   * dialog also offers "No, I don't trust the authors", so matching only on
   * "trust the authors" would ambiguously hit both (and closing on No leaves the
   * workspace restricted — a false green).
   */
  get trustButton(): Locator {
    return this.dialog.getByRole('button', { name: /Yes,?\s*I trust the authors/i });
  }

  /**
   * The status-bar "Restricted Mode" indicator — shown while the workspace is NOT
   * trusted, gone once it is. The real signal that trust was actually granted.
   */
  get restrictedMode(): Locator {
    return this.page.locator('.part.statusbar').getByText('Restricted Mode');
  }

  /** Accept trust. */
  async trust(): Promise<void> {
    await this.trustButton.click();
  }
}
