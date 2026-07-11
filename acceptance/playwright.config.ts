import { defineConfig } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from 'playwright-bdd';

/**
 * Acceptance suite: Gherkin features → playwright-bdd → Playwright `_electron`
 * driving a real VS Code with Jasper loaded from source. The primary output is
 * the Cucumber JSON feed (with per-step screenshot embeddings) that Cukedoctor
 * turns into the living-documentation user manual.
 *
 * Host-native, no Docker: on macOS the window is driven off-screen (see
 * `fixtures/vscode.ts`); in CI the whole command runs under `xvfb-run`.
 */
const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  // `fixtures/**` is included so bddgen can discover the custom `test` instance;
  // `support/**` so the per-step screenshot hook is loaded.
  steps: ['steps/**/*.ts', 'support/**/*.ts', 'fixtures/**/*.ts'],
  outputDir: '.features-gen',
});

export default defineConfig({
  testDir,
  outputDir: 'test-results',
  // One VS Code window at a time — the Electron app is a shared, stateful
  // resource, so parallelism would have scenarios fighting over the same window.
  workers: 1,
  fullyParallel: false,
  // A cold VS Code launch plus extension activation is not fast.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    // The living-documentation feed. Screenshots attached during a step ride in
    // as that step's `embeddings`.
    cucumberReporter('json', { outputFile: 'cucumber-report/report.json' }),
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    // We capture screenshots explicitly (per step + named screens), so leave the
    // runner's automatic capture off; keep a trace only when a scenario fails.
    trace: 'retain-on-failure',
    screenshot: 'off',
  },
});
