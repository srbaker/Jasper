/**
 * Page Object over the Enhanced Inspector install flow and the two inspectors it
 * routes between.
 *
 * On connect to a 3.7.5+ stone that lacks the support, Jasper (in `ask` mode)
 * pops a MODAL offer to install it — a `.monaco-dialog-box`, exactly like the
 * Workspace Trust dialog. Choosing Install files the support in over a transient
 * SystemUser session (a progress notification), commits it, and re-probes the
 * session so "Inspect It" then opens the rich Enhanced Inspector (a webview panel,
 * viewType `gemstoneEnhancedInspector`, titled "Inspector") instead of the classic
 * tree Inspector.
 */
import { Page, Locator } from '@playwright/test';

export class EnhancedInspectorInstall {
  constructor(private readonly page: Page) {}

  /** The modal install offer ("Install enhanced inspector support on …?"). */
  get offerDialog(): Locator {
    return this.page.locator('.monaco-dialog-box');
  }

  /** A button in the modal offer, by its label (Install / Always / Never). */
  offerButton(label: string | RegExp): Locator {
    return this.offerDialog.getByRole('button', { name: label });
  }

  /** The install progress notification ("Installing enhanced inspector support…"). */
  get installProgress(): Locator {
    return this.page
      .locator('.notifications-toasts .notification-toast')
      .filter({ hasText: /nstalling enhanced inspector support/ });
  }

  /**
   * True when the Enhanced Inspector is open. It's a webview panel with a
   * Raw/Print/Meta view switcher — unique to it (the classic inspector is a plain
   * sidebar tree, and the Login Launcher webview has no such control). VS Code
   * hosts webview iframes in a global overlay (not nested under `.part.editor`),
   * and more than one Jasper webview is present (launcher + inspector), so a scoped
   * FrameLocator can't target it unambiguously — search every frame for the marker.
   */
  async enhancedInspectorPresent(): Promise<boolean> {
    for (const frame of this.page.frames()) {
      const count = await frame.getByText('Raw', { exact: true }).count().catch(() => 0);
      if (count > 0) return true;
    }
    return false;
  }

  /**
   * A root row in the CLASSIC inspector — the `gemstoneInspector` sidebar tree
   * that Inspect It reveals when the enhanced support is absent. The root's label
   * is the inspected object's printString (e.g. "7" for 3 + 4).
   */
  classicInspectorRoot(label: string | RegExp): Locator {
    return this.page.getByRole('treeitem', { name: label });
  }
}
