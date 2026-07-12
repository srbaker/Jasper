/**
 * The normalized manual model — the shape the Astro components render.
 *
 * The generator translates raw Cucumber JSON (`cucumberJson.ts`) into this model
 * once, so the components never touch the wire format. Keeping this boundary means
 * a different input format could be supported by writing a new translator without
 * touching a single component. Generic: no product-specific fields.
 */

export type StepStatus =
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'pending'
  | 'undefined'
  | 'ambiguous'
  | 'unknown';

/** A scenario is 'passed' only if every step passed; 'failed' if any failed; else 'skipped'. */
export type ScenarioStatus = 'passed' | 'failed' | 'skipped';

export interface ManualScreenshot {
  /** Human name (the attachment name / step title). */
  name: string;
  /** Site-absolute URL the built page references, e.g. "/screens/foo/bar/1.png". */
  src: string;
}

export interface ManualStep {
  /** Trimmed keyword: "Given" | "When" | "Then" | "And" | "But". */
  keyword: string;
  /** The step text without the keyword. */
  text: string;
  status: StepStatus;
  durationMs?: number;
  error?: string;
  /** DocString body, if the step had one. */
  docString?: string;
  /** Data-table rows, if the step had one. */
  dataTable?: string[][];
  screenshots: ManualScreenshot[];
}

export interface ManualScenario {
  id: string;
  /** URL-safe slug, unique within its feature. */
  slug: string;
  name: string;
  description?: string;
  tags: string[];
  /** Human-readable "runs against" notes derived from tags (extent, user, …). */
  annotations?: string[];
  status: ScenarioStatus;
  steps: ManualStep[];
}

export interface ManualFeature {
  id: string;
  /** URL-safe slug, unique within the manual. */
  slug: string;
  name: string;
  description?: string;
  /** Source feature-file path, for provenance. */
  uri: string;
  tags: string[];
  /** Human-readable "runs against" notes derived from tags (extent, user, …). */
  annotations?: string[];
  status: ScenarioStatus;
  scenarios: ManualScenario[];
}

export interface Manual {
  features: ManualFeature[];
  /**
   * ISO timestamp stamped by the caller (not the engine — the engine is
   * deterministic and clock-free so its output diffs cleanly).
   */
  generatedAt?: string;
}
