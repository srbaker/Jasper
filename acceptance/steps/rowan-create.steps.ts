/**
 * Steps for features/rowan-create.feature. Starts from the default (empty)
 * throwaway workspace — no stone, no fixture. The Rowan view's welcome offers
 * "Create Rowan Project" when the open folder isn't a project yet; clicking it
 * runs gemstone.rowanInitHere, which generates the project structure in place
 * (the folder basename becomes the project name) and the disk-first Rowan view
 * then lights up.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { Workbench } from '../pageobjects/workbench';
import { RowanProjectView } from '../pageobjects/rowanProject';

const { Given, When, Then } = createBdd(test);

Given('I have opened an empty folder', async ({ window }) => {
  await new Workbench(window).openGemStoneSidebar();
});

When('I create a Rowan project from the Rowan view', async ({ window }) => {
  await window.locator('.part.sidebar')
    .getByRole('button', { name: 'Create Rowan Project' })
    .click();
});

Then('the folder becomes a Rowan project', async ({ window }) => {
  // Creation flips the gemstone.workspaceIsRowanProject context, which reveals
  // the disk-first Rowan view in the Explorer.
  await new Workbench(window).openExplorer();
  await expect(new RowanProjectView(window).header).toBeVisible({ timeout: 30_000 });
});
