/**
 * Page Object over the "Login" launcher — the sidebar WebviewView (view id
 * gemstoneLoginLauncher) that replaced the old Logins & Sessions tree. It's a
 * Run-and-Debug-style login picker with a connect (▶) / disconnect (⏹) control
 * and a status line. Being a webview, its controls live inside VS Code's nested
 * iframe.webview → #active-frame.
 */
import { Page, FrameLocator, Locator } from '@playwright/test';
import { jasperWebview } from './webview';

export class LoginLauncher {
  constructor(private readonly page: Page) {}

  /** The launcher's webview document (Jasper's webview, not the built-in Chat). */
  private get frame(): FrameLocator {
    return jasperWebview(this.page);
  }

  /** The header/menu row for a configured login (matched by its label text). */
  login(match: string | RegExp): Locator {
    return this.frame.getByText(match).first();
  }

  /** The connect (▶) action. */
  get connectButton(): Locator {
    return this.frame.locator('.iconbtn.play[data-act="connect"]');
  }

  /** The disconnect (⏹) action. */
  get disconnectButton(): Locator {
    return this.frame.locator('.iconbtn.stop[data-act="disconnect"]');
  }

  /** The status line ("Connected — …" / "Not connected · …"). */
  get status(): Locator {
    return this.frame.locator('.status');
  }

  async connect(): Promise<void> {
    await this.connectButton.click();
  }
}
