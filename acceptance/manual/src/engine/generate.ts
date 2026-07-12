/**
 * The generator: Cucumber JSON → normalized manual model → MDX pages + extracted
 * screenshots. Generic and product-agnostic (see `cucumberJson.ts`).
 *
 * `buildManual` is pure (no fs, no clock): raw report in, model + asset bodies
 * out — so it is trivially testable and its output diffs cleanly. `generateManual`
 * is the thin fs shell that writes the model's assets, per-feature data JSON, and
 * per-feature MDX pages to disk.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  CucumberReport,
  CucumberScenario,
  CucumberStep,
  CucumberDocString,
  CucumberDataTable,
} from './cucumberJson.js';
import type {
  Manual,
  ManualFeature,
  ManualScenario,
  ManualStep,
  ManualScreenshot,
  ScenarioStatus,
  StepStatus,
} from './model.js';

// ── pure translation ────────────────────────────────────────────────────────

export interface BuildOptions {
  /** URL base the built pages reference screenshots by, e.g. "/screens". */
  screensUrlBase: string;
}

export interface AssetBody {
  /** Path relative to the public screens directory, e.g. "feature/scenario/1-0.png". */
  relPath: string;
  /** base64-encoded body from the Cucumber embedding. */
  base64: string;
}

export interface BuildResult {
  manual: Manual;
  assets: AssetBody[];
}

const STEP_STATUSES: StepStatus[] = [
  'passed', 'failed', 'skipped', 'pending', 'undefined', 'ambiguous', 'unknown',
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'item';
}

function uniqueSlug(base: string, taken: Set<string>): string {
  let slug = base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  taken.add(slug);
  return slug;
}

function normalizeStatus(raw: string | undefined): StepStatus {
  const s = (raw ?? 'unknown').toLowerCase() as StepStatus;
  return STEP_STATUSES.includes(s) ? s : 'unknown';
}

function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mime] ?? 'bin';
}

function stepArguments(step: CucumberStep): Pick<ManualStep, 'docString' | 'dataTable'> {
  const out: Pick<ManualStep, 'docString' | 'dataTable'> = {};
  for (const arg of step.arguments ?? []) {
    if ((arg as CucumberDocString).value !== undefined) {
      out.docString = (arg as CucumberDocString).value;
    } else if ((arg as CucumberDataTable).rows !== undefined) {
      out.dataTable = (arg as CucumberDataTable).rows.map((r) => r.cells);
    }
  }
  return out;
}

function scenarioStatus(steps: ManualStep[]): ScenarioStatus {
  if (steps.some((s) => s.status === 'failed')) return 'failed';
  if (steps.length > 0 && steps.every((s) => s.status === 'passed')) return 'passed';
  return 'skipped';
}

function buildScenario(
  raw: CucumberScenario,
  featureSlug: string,
  takenSlugs: Set<string>,
  opts: BuildOptions,
  assets: AssetBody[],
): ManualScenario {
  const slug = uniqueSlug(slugify(raw.name), takenSlugs);
  const steps: ManualStep[] = [];

  raw.steps.forEach((rawStep, stepIndex) => {
    if (rawStep.hidden) return; // Before/After hook pseudo-steps

    const screenshots: ManualScreenshot[] = [];
    (rawStep.embeddings ?? []).forEach((emb, embIndex) => {
      if (!emb.mime_type.startsWith('image/')) return;
      const ext = extensionForMime(emb.mime_type);
      const relPath = `${featureSlug}/${slug}/${stepIndex}-${embIndex}.${ext}`;
      assets.push({ relPath, base64: emb.data });
      screenshots.push({
        name: (rawStep.name ?? `Step ${stepIndex + 1}`).trim(),
        src: `${opts.screensUrlBase}/${relPath}`,
      });
    });

    steps.push({
      keyword: (rawStep.keyword ?? '').trim(),
      text: (rawStep.name ?? '').trim(),
      status: normalizeStatus(rawStep.result?.status),
      durationMs:
        rawStep.result?.duration !== undefined
          ? Math.round(rawStep.result.duration / 1e6)
          : undefined,
      error: rawStep.result?.error_message,
      ...stepArguments(rawStep),
      screenshots,
    });
  });

  return {
    id: raw.id,
    slug,
    name: raw.name,
    description: raw.description?.trim() || undefined,
    tags: (raw.tags ?? []).map((t) => t.name),
    status: scenarioStatus(steps),
    steps,
  };
}

/** Translate a raw Cucumber report into the manual model plus its asset bodies. */
export function buildManual(report: CucumberReport, opts: BuildOptions): BuildResult {
  const assets: AssetBody[] = [];
  const featureSlugs = new Set<string>();

  const features: ManualFeature[] = report
    .filter((f) => f.elements.some((e) => e.type !== 'background'))
    .map((raw) => {
      const slug = uniqueSlug(slugify(raw.name || path.basename(raw.uri)), featureSlugs);
      const scenarioSlugs = new Set<string>();
      const scenarios = raw.elements
        .filter((e) => e.type !== 'background')
        .map((e) => buildScenario(e, slug, scenarioSlugs, opts, assets));
      return {
        id: raw.id,
        slug,
        name: raw.name,
        description: raw.description?.trim() || undefined,
        uri: raw.uri,
        tags: (raw.tags ?? []).map((t) => t.name),
        status: scenarioStatus(scenarios.flatMap((s) => s.steps)),
        scenarios,
      };
    });

  return { manual: { features }, assets };
}

// ── fs shell ────────────────────────────────────────────────────────────────

export interface GenerateManualOptions {
  /** A Cucumber JSON file, or a directory containing `*.json` reports. */
  reportPath: string;
  /** Filesystem dir for per-feature MDX pages (Starlight content), created if absent. */
  contentDir: string;
  /** Filesystem dir for per-feature data JSON, created if absent. */
  dataDir: string;
  /** Filesystem dir screenshots are written under, created if absent. */
  screensDir: string;
  /** URL base the pages reference screenshots by. */
  screensUrlBase: string;
  /** Import specifier for the Feature component in generated MDX. */
  featureComponentImport?: string;
  /** Import specifier base for per-feature data JSON in generated MDX. */
  dataImportBase?: string;
  /** The manual's table of contents. Chapters render grouped + ordered per this. */
  outline?: ManualSection[];
  /** File to write the generated Starlight sidebar JSON to (needs `outline`). */
  sidebarPath?: string;
  /** Chapter name → authored page link, so the outline can place hand-written pages. */
  authoredPages?: Record<string, string>;
  /** Derive per-scenario/feature "runs against" notes from tags (product-specific). */
  annotate?: (tags: string[]) => string[];
}

function readReport(reportPath: string): CucumberReport {
  const stat = fs.statSync(reportPath);
  const files = stat.isDirectory()
    ? fs.readdirSync(reportPath)
        .filter((f) => f.endsWith('.json'))
        .map((f) => path.join(reportPath, f))
    : [reportPath];
  const report: CucumberReport = [];
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) report.push(...parsed);
  }
  return report;
}

function emptyDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

/** A named group of chapters (by Feature name) for the manual's sidebar. */
export interface ManualSection {
  title: string;
  chapters: string[];
}

/**
 * Parse a Markdown table of contents into sections. `##` headings are sections;
 * `-`/`*` list items are chapters (by Feature name). Everything else — the title,
 * HTML comments, prose — is ignored. Empty sections are dropped.
 */
export function parseOutlineMarkdown(markdown: string): ManualSection[] {
  const withoutComments = markdown.replace(/<!--[\s\S]*?-->/g, '');
  const sections: ManualSection[] = [];
  let current: ManualSection | undefined;
  for (const raw of withoutComments.split('\n')) {
    const line = raw.trim();
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = { title: heading[1], chapters: [] };
      sections.push(current);
      continue;
    }
    const item = /^[-*]\s+(.+?)\s*$/.exec(line);
    if (item && current) current.chapters.push(item[1]);
  }
  return sections.filter((s) => s.chapters.length > 0);
}

/** A Starlight sidebar entry: a link, or a labelled group of links. */
type SidebarLink = { label: string; link: string };
type SidebarGroup = { label: string; items: SidebarLink[] };
type SidebarEntry = SidebarLink | SidebarGroup;

/**
 * Build the Starlight sidebar from the outline and the features that actually
 * generated. Chapters render in outline order under their section; a listed
 * chapter with no generated page (and no authored page) is skipped; a generated
 * chapter absent from the outline lands under a trailing "More" group so nothing
 * is lost. `authoredPages` maps chapter names to hand-written page links (e.g.
 * the Glossary), so the outline can place authored pages alongside generated ones.
 */
function buildSidebar(
  features: ManualFeature[],
  outline: ManualSection[],
  authoredPages: Record<string, string> = {},
): SidebarEntry[] {
  const bySlugForName = new Map(features.map((f) => [f.name, f.slug]));
  const placed = new Set<string>();

  const sections: SidebarGroup[] = [];
  for (const section of outline) {
    const items: SidebarLink[] = [];
    for (const name of section.chapters) {
      const slug = bySlugForName.get(name);
      if (slug && !placed.has(slug)) {
        placed.add(slug);
        items.push({ label: name, link: `/features/${slug}/` });
      } else if (authoredPages[name]) {
        items.push({ label: name, link: authoredPages[name] });
      }
    }
    if (items.length) sections.push({ label: section.title, items });
  }

  const leftover = features.filter((f) => !placed.has(f.slug));
  if (leftover.length) {
    sections.push({
      label: 'More',
      items: leftover.map((f) => ({ label: f.name, link: `/features/${f.slug}/` })),
    });
  }

  return [{ label: 'Introduction', link: '/' }, ...sections];
}

function mdxPage(
  feature: ManualFeature,
  componentImport: string,
  dataImport: string,
): string {
  // Frontmatter title drives Starlight's page title + sidebar label.
  return `---
title: ${JSON.stringify(feature.name)}
description: ${JSON.stringify(feature.description?.split('\n')[0] ?? feature.name)}
---
import Feature from '${componentImport}';
import feature from '${dataImport}';

<Feature feature={feature} />
`;
}

/**
 * Read the Cucumber report, write screenshots, per-feature data JSON, and
 * per-feature MDX pages. Returns the model (with `generatedAt` stamped by the
 * caller if desired). Idempotent: the three output dirs are cleared first.
 */
export function generateManual(options: GenerateManualOptions): Manual {
  const componentImport = options.featureComponentImport ?? '@components/Feature.astro';
  const dataImportBase = options.dataImportBase ?? '@generated/features';

  const report = readReport(options.reportPath);
  const { manual, assets } = buildManual(report, { screensUrlBase: options.screensUrlBase });

  if (options.annotate) {
    for (const feature of manual.features) {
      feature.annotations = options.annotate(feature.tags);
      for (const scenario of feature.scenarios) scenario.annotations = options.annotate(scenario.tags);
    }
  }

  emptyDir(options.contentDir);
  emptyDir(options.dataDir);
  emptyDir(options.screensDir);

  for (const asset of assets) {
    const target = path.join(options.screensDir, asset.relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(asset.base64, 'base64'));
  }

  for (const feature of manual.features) {
    fs.writeFileSync(
      path.join(options.dataDir, `${feature.slug}.json`),
      JSON.stringify(feature, null, 2),
    );
    fs.writeFileSync(
      path.join(options.contentDir, `${feature.slug}.mdx`),
      mdxPage(feature, componentImport, `${dataImportBase}/${feature.slug}.json`),
    );
  }

  if (options.outline && options.sidebarPath) {
    fs.mkdirSync(path.dirname(options.sidebarPath), { recursive: true });
    fs.writeFileSync(
      options.sidebarPath,
      JSON.stringify(buildSidebar(manual.features, options.outline, options.authoredPages), null, 2),
    );
  }

  return manual;
}
