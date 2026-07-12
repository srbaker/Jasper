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

const { Given, When, Then } = createBdd(test);

Given('I have opened the HelloRowan project', async ({ window }) => {
  // The disk-first "This Project" view lives in the GemStone sidebar now.
  await new Workbench(window).openGemStoneSidebar();
});

Then('the Rowan view lists the {string} package', async ({ window }, pkg: string) => {
  const view = new RowanProjectView(window);
  await view.open();
  await expect(view.item(pkg)).toBeVisible({ timeout: 30_000 });
});

Then('the {string} package contains the {string} class', async ({ window }, pkg: string, cls: string) => {
  const view = new RowanProjectView(window);
  await view.expand(pkg);
  await expect(view.item(cls)).toBeVisible({ timeout: 15_000 });
});

Then('the {string} class has a {string} method', async ({ window }, cls: string, method: string) => {
  const view = new RowanProjectView(window);
  await view.expand(cls);
  await expect(view.item(method)).toBeVisible({ timeout: 15_000 });
});

When('I open the {string} method from the Rowan view', async ({ window }, selector: string) => {
  const view = new RowanProjectView(window);
  await view.open();
  await view.expand(/HelloRowan-Core/);
  await view.expand(/Greeter/);
  await view.item(selector).click(); // a method row's click opens its tonel-method:// doc
});

Then('its source opens on its own, ready to edit', async ({ window }) => {
  // The method opens as a focused slice of the .class.st in a normal editor.
  const editor = window.locator('.part.editor .monaco-editor').first();
  await expect(editor).toContainText('greet:', { timeout: 15_000 });
  await expect(editor).toContainText('Hello, ');
});
