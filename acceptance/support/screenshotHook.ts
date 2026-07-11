/**
 * Automatic per-step evidence for the living-documentation manual.
 *
 * After every Gherkin step, screenshot the workbench and attach it to the test.
 * playwright-bdd's Cucumber-JSON reporter turns test attachments into per-step
 * `embeddings`, which Cukedoctor renders inline beneath each step in the manual.
 *
 * This file is loaded because it sits under the `steps` glob in
 * `playwright.config.ts`; importing `test` from the shared fixtures keeps the
 * hook bound to the same fixtures the steps use.
 */
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { AfterStep } = createBdd(test);

AfterStep(async ({ $testInfo, $step, window }) => {
  const body = await window.screenshot();
  await $testInfo.attach($step.title, { body, contentType: 'image/png' });
});
