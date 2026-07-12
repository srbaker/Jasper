/**
 * The active Jasper webview's document.
 *
 * VS Code renders webview content in a nested pair of iframes
 * (outer `iframe.webview` → inner `#active-frame`). More than one webview can be
 * present — notably VS Code's built-in Chat panel — so target Jasper's by the
 * extension id in the outer iframe's src (the Chat webview has an empty
 * extensionId). Only one Jasper webview (launcher / manager / STON editor) is open
 * at a time, so this resolves unambiguously.
 */
import { Page, FrameLocator } from '@playwright/test';

export function jasperWebview(page: Page): FrameLocator {
  return page
    .frameLocator('iframe.webview[src*="gemtalksystems.gemstone-ide"]')
    .frameLocator('#active-frame');
}
