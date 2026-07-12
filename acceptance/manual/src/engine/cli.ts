/**
 * `npm run manual` entry point.
 *
 * Turns the Cucumber JSON feed into ONE self-contained HTML page: the report,
 * organized by feature, formatted with native disclosure. Screenshots are written
 * as files next to the page under screens/ and linked relatively.
 *
 * Usage: tsx src/engine/cli.ts [--report <file-or-dir>]
 * The report defaults to ../cucumber-report; the chapter order comes from the
 * sibling `.chapters` dotfile (the table of contents).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildManual } from './generate.js';
import { renderHtml, type Section } from './html.js';
import { annotate } from '../annotations.js';

const packageRoot = path.resolve(import.meta.dirname, '..', '..');
const acceptanceRoot = path.join(packageRoot, '..');

function parseReportArg(argv: string[]): string {
  const i = argv.indexOf('--report');
  if (i !== -1 && argv[i + 1]) return path.resolve(argv[i + 1]);
  return path.join(acceptanceRoot, 'cucumber-report');
}

function readReport(reportPath: string): any[] {
  const stat = fs.statSync(reportPath);
  const files = stat.isDirectory()
    ? fs.readdirSync(reportPath).filter((f) => f.endsWith('.json')).map((f) => path.join(reportPath, f))
    : [reportPath];
  const report: any[] = [];
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) report.push(...parsed);
  }
  return report;
}

/** Parse the `.chapters` dotfile: `## Section` headings, feature names as lines. */
function parseChapters(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section | undefined;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      current = { title: line.slice(3).trim(), chapters: [] };
      sections.push(current);
    } else if (!line || line.startsWith('#') || line.startsWith('<!--') || line.startsWith('-->')) {
      continue;
    } else {
      const name = line.replace(/^[-*]\s+/, '');
      if (!current) { current = { title: '', chapters: [] }; sections.push(current); }
      current.chapters.push(name);
    }
  }
  return sections.filter((s) => s.chapters.length);
}

const reportPath = parseReportArg(process.argv.slice(2));
if (!fs.existsSync(reportPath)) {
  console.error(`✗ No Cucumber report at ${reportPath}\n  Run the acceptance suite first, or pass --report <file-or-dir>.`);
  process.exit(1);
}

const { manual, assets } = buildManual(readReport(reportPath), { screensUrlBase: 'screens' });

const outDir = path.join(packageRoot, 'dist');
const screensDir = path.join(outDir, 'screens');
fs.rmSync(screensDir, { recursive: true, force: true });
for (const asset of assets) {
  const target = path.join(screensDir, asset.relPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(asset.base64, 'base64'));
}

const chaptersPath = path.join(acceptanceRoot, '.chapters');
const sections = fs.existsSync(chaptersPath) ? parseChapters(fs.readFileSync(chaptersPath, 'utf8')) : undefined;

const html = renderHtml(manual, {
  title: 'The Jasper User Manual',
  generatedAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
  sections,
  annotate,
});
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'manual.html'), html);

const scenarioCount = manual.features.reduce((n, f) => n + f.scenarios.length, 0);
console.log(`✓ Manual: ${manual.features.length} feature(s), ${scenarioCount} scenario(s), ${assets.length} screenshot(s) → ${path.relative(process.cwd(), path.join(outDir, 'manual.html'))}`);
