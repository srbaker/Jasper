import * as vscode from 'vscode';

// A thin, native wrapper over VS Code's built-in Simple Browser: open a URL in an
// in-editor webview tab (an iframe to the target), rather than kicking the user
// out to the OS browser with `env.openExternal`. This is the in-editor preview
// surface for a running WebGS/Seaside endpoint — "view it without leaving Jasper".
//
// Simple Browser ships with VS Code (the built-in `vscode.simple-browser`
// extension); its command `simpleBrowser.show` accepts a URL string. We keep our
// own command so there's a stable, GemStone-branded palette entry to drive and so
// the default URL is the WebGS convention.

// WebGS's HttpListener defaults to port 8888 (Sample runHttp), so that's the
// preview default.
export const DEFAULT_PREVIEW_URL = 'http://localhost:8888/';

// Open `url` (or prompt for one, defaulting to the WebGS port) in Simple Browser.
// A no-op if the prompt is dismissed. `url` is passed straight through, so callers
// (and the acceptance suite) can target an exact endpoint like
// 'http://localhost:8888/counter.gs'.
export async function openWebPreview(url?: string): Promise<void> {
  let target = url;
  if (!target) {
    target = await vscode.window.showInputBox({
      prompt: 'URL to open in the web preview',
      value: DEFAULT_PREVIEW_URL,
      ignoreFocusOut: true,
    });
  }
  if (!target) return;
  await vscode.commands.executeCommand('simpleBrowser.show', target);
}
