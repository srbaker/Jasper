/**
 * Situation-creating building blocks that chapters DEPEND ON.
 *
 * A chapter that needs a situation (a live session, a loaded project, …) embeds
 * the flow that *creates* that situation as its Given, rather than reimplementing
 * the setup. Each flow is written against the same page objects the standalone
 * chapter for that situation uses, so there is one source of truth for how the
 * situation is reached — and the dependency reads plainly in the steps.
 *
 * Flows compose: a deeper situation embeds the shallower ones it depends on (e.g.
 * "a project is loaded" logs in first). Never fake the situation — reach it for
 * real, exactly as a user would.
 */
import { expect, type Page } from '@playwright/test';
import { Workbench } from '../pageobjects/workbench';
import { LoginLauncher } from '../pageobjects/loginLauncher';
import { dismissWalkthrough } from '../pageobjects/walkthrough';

/**
 * Logged in to the provisioned @stone via the Login Launcher — the live-session
 * situation the "Connecting to a stone" chapter demonstrates, and the dependency
 * every stone-backed chapter builds on.
 */
export async function logIn(window: Page): Promise<void> {
  await new Workbench(window).openGemStoneSidebar();
  const launcher = new LoginLauncher(window);
  await expect(launcher.login(/DataCurator/)).toBeVisible({ timeout: 30_000 });
  await launcher.connect();
  // Wait for the REAL connected state: the disconnect (⏹) button exists only once
  // connected. (Don't match the status text for /Connected/ — "Not connected"
  // contains "connected", so that would pass on the disconnected state.)
  await expect(launcher.disconnectButton).toBeVisible({ timeout: 60_000 });
  // First connect opens the Getting Started walkthrough; close it so the
  // situation this flow sets up is the clean connected state, not the onboarding.
  await dismissWalkthrough(window);
}
