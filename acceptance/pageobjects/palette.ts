/**
 * Run a VS Code command through the Command Palette (F1) — the robust,
 * cross-platform way to invoke an extension command from a test (no chord
 * keybindings). `name` is matched against the palette rows.
 */
import { Page, expect } from '@playwright/test';

export async function runCommand(page: Page, name: string): Promise<void> {
  await page.keyboard.press('F1'); // opens the palette with ">" prefilled
  const palette = page.locator('.quick-input-widget');
  await expect(palette).toBeVisible();
  await page.keyboard.type(name);
  const row = palette.locator('.monaco-list-row').filter({ hasText: name }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
}
