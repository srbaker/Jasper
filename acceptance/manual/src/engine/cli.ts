/**
 * `npm run generate` entry point.
 *
 * Resolves the concrete paths for this package and drives the (generic) engine.
 * This file is the one spot in `engine/` that hard-codes *where* things live in
 * the Astro project, so the rest of the engine stays portable.
 *
 * Usage:
 *   tsx src/engine/cli.ts [--report <file-or-dir>]
 *
 * Default report path is `../cucumber-report` — the Cucumber JSON the acceptance
 * harness writes next to this package.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateManual } from './generate.js';

const packageRoot = path.resolve(import.meta.dirname, '..', '..');

function parseReportArg(argv: string[]): string {
  const i = argv.indexOf('--report');
  if (i !== -1 && argv[i + 1]) return path.resolve(argv[i + 1]);
  return path.join(packageRoot, '..', 'cucumber-report');
}

const reportPath = parseReportArg(process.argv.slice(2));

if (!fs.existsSync(reportPath)) {
  console.error(
    `✗ No Cucumber report at ${reportPath}\n` +
      `  Run the acceptance suite first (\`npm test\` in the parent workspace),\n` +
      `  or pass --report <file-or-dir>.`,
  );
  process.exit(1);
}

const contentDir = path.join(packageRoot, 'src', 'content', 'docs', 'features');
const dataDir = path.join(packageRoot, 'src', 'generated', 'features');
const screensDir = path.join(packageRoot, 'public', 'screens');

const manual = generateManual({
  reportPath,
  contentDir,
  dataDir,
  screensDir,
  screensUrlBase: '/screens',
});

// Stamp the clock here (the engine is deterministic/clock-free) and write the
// whole-manual index the print route consumes.
manual.generatedAt = new Date().toISOString();
fs.mkdirSync(path.join(packageRoot, 'src', 'generated'), { recursive: true });
fs.writeFileSync(
  path.join(packageRoot, 'src', 'generated', 'manual.json'),
  JSON.stringify(manual, null, 2),
);

const featureCount = manual.features.length;
const scenarioCount = manual.features.reduce((n, f) => n + f.scenarios.length, 0);
const shotCount = manual.features.reduce(
  (n, f) => n + f.scenarios.reduce((m, s) => m + s.steps.reduce((k, st) => k + st.screenshots.length, 0), 0),
  0,
);
console.log(
  `✓ Generated manual: ${featureCount} feature(s), ${scenarioCount} scenario(s), ${shotCount} screenshot(s).`,
);
