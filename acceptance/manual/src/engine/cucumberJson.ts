/**
 * The input contract: classic Cucumber JSON as emitted by playwright-bdd's
 * `cucumberReporter('json')`. These types mirror that reporter's output exactly
 * (see playwright-bdd `dist/reporter/cucumber/json.js`), which is itself based on
 * cucumber-js's `json_formatter`.
 *
 * This file — and everything under `engine/` — is deliberately generic: it knows
 * nothing about Jasper, GemStone, or VS Code. It is the seam that makes the whole
 * `manual/` package extractable: any suite that emits Cucumber JSON can feed it.
 */

/** A per-step attachment (e.g. a screenshot), base64-encoded. */
export interface CucumberEmbedding {
  /** base64-encoded body. */
  data: string;
  /** e.g. "image/png", "text/plain". */
  mime_type: string;
}

export interface CucumberStepResult {
  /** "passed" | "failed" | "skipped" | "pending" | "undefined" | "ambiguous" | "unknown" */
  status: string;
  /** Duration in nanoseconds. */
  duration?: number;
  error_message?: string;
}

export interface CucumberDocString {
  line?: number;
  value: string;
  content_type?: string;
}

export interface CucumberDataTable {
  rows: { cells: string[] }[];
}

export interface CucumberStep {
  /** Includes the trailing space, e.g. "Given ", "When ", "Then ", "And ". */
  keyword?: string;
  name?: string;
  line?: number;
  /** true for the hidden Before/After hook pseudo-steps — skip these in the manual. */
  hidden?: boolean;
  result?: CucumberStepResult;
  embeddings?: CucumberEmbedding[];
  arguments?: Array<CucumberDocString | CucumberDataTable>;
}

export interface CucumberTag {
  name: string;
  line?: number;
}

export interface CucumberScenario {
  id: string;
  keyword: string;
  /** "scenario" | "background" */
  type: string;
  name: string;
  description?: string;
  line: number;
  tags?: CucumberTag[];
  steps: CucumberStep[];
}

export interface CucumberFeature {
  uri: string;
  id: string;
  keyword: string;
  name: string;
  description?: string;
  line: number;
  tags?: CucumberTag[];
  elements: CucumberScenario[];
}

export type CucumberReport = CucumberFeature[];
