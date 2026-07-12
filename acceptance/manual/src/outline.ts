/**
 * The manual's table of contents.
 *
 * This is the ONE place to shape the manual's structure. Each section lists its
 * chapters in order, by the chapter's **Feature name** (the `Feature:` line in
 * the .feature file). The generator turns this into the Starlight sidebar:
 *
 *   - chapters render in the order listed here, grouped under their section;
 *   - a chapter listed here but not yet generated (its test hasn't run) is
 *     silently skipped — so you can plan the TOC ahead of the coverage;
 *   - a generated chapter NOT listed here still appears, under a trailing
 *     "More" section, so nothing is ever lost by forgetting to add it.
 *
 * Product-specific content: the engine (src/engine) reads this as data and knows
 * nothing about Jasper.
 */
export interface ManualSection {
  title: string;
  chapters: string[];
}

export const OUTLINE: ManualSection[] = [
  {
    title: 'Getting started',
    chapters: [
      'The GemStone sidebar',
      'Trusting your workspace',
      'Downloading a GemStone release',
      'Installing Jasper',
    ],
  },
  {
    title: 'Databases & environment',
    chapters: [
      'The GemStone Manager',
      'Creating a database',
    ],
  },
  {
    title: 'Connecting to a stone',
    chapters: [
      'A folder must be open to log in',
      'Connecting to a stone',
      'The Login Launcher',
    ],
  },
  {
    title: 'Writing Smalltalk',
    chapters: [
      'Executing Smalltalk',
    ],
  },
  {
    title: 'Browsing the image',
    chapters: [
      'The Stage Browser',
    ],
  },
  {
    title: 'Rowan projects',
    chapters: [
      'Creating a Rowan project',
      'Working with a Rowan project',
      "A project's Rowan settings",
      'Committing changes to disk',
    ],
  },
];
