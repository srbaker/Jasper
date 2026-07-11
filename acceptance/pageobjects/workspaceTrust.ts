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

  /** The "Yes, I trust the authors" primary button. */
  get trustButton(): Locator {
    return this.dialog.getByRole('button', { name: /trust the authors/i }).first();
  }

  /** Accept trust and dismiss the dialog. */
  async trust(): Promise<void> {
    await this.trustButton.click();
  }
}
