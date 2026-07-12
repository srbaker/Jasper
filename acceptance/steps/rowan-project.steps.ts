/**
 * Steps for features/rowan-project.feature. `@rowan-project` seeds the workspace
 * with the HelloRowan fixture project, so Jasper's disk-first Rowan view lights
 * up (the view is gated on the gemstone.workspaceIsRowanProject context). No
 * stone is involved — this is the on-disk lens.
 */
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { Workbench } from '../pageobjects/workbench';
import { RowanProjectView } from '../pageobjects/rowanProject';

const { Given, Then } = createBdd(test);

Given('I have opened the HelloRowan project', async ({ window, screen }) => {
  await new Workbench(window).openExplorer();
  await screen('A Rowan project, open in Jasper');
});

Then('the Rowan view lists the {string} package', async ({ window, screen }, pkg: string) => {
  const view = new RowanProjectView(window);
  await view.open();
  await expect(view.item(pkg)).toBeVisible({ timeout: 30_000 });
  await screen('The Rowan view listing the project packages');
});

Then('expanding the package reveals the {string} class and its methods', async ({ window, screen }, cls: string) => {
  const view = new RowanProjectView(window);
  await view.expand(/HelloRowan-Core/);
  await expect(view.item(cls)).toBeVisible({ timeout: 15_000 });
  await view.expand(new RegExp(cls));
  await expect(view.item(/greet:/)).toBeVisible({ timeout: 15_000 });
  await screen('Drilling into a class and its methods');
});
