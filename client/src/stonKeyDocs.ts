// Human documentation for the STON keys that appear in a Rowan project's files.
// Drives the settings editor's per-row info tooltips, enum dropdowns (`values`),
// the "at default" markers (`default`), and — via SCHEMAS — the list of keys a
// given spec *could* carry, so the editor can surface available-but-unset ones.

export interface KeyDoc {
  // One-line explanation of what the key represents.
  description: string;
  // A closed set of allowed values, when the key is a strict enumeration
  // (rendered as a dropdown; off-set values warn).
  values?: string[];
  // Common values for an *open* key — offered as autocomplete suggestions, but
  // any value (including a new one) is allowed and never warns.
  suggestions?: string[];
  // The value Rowan assumes when the key is omitted, when there is one.
  default?: string;
  // The value is a path (relative to the project root) that should exist — the
  // editor warns when it doesn't. 'dir' or 'file'.
  pathKind?: 'dir' | 'file';
}

export const STON_KEY_DOCS: Record<string, KeyDoc> = {
  // ── project spec (RwProjectSpecificationV3 / project.ston) ──
  specName: { description: "This specification's name. In project.ston it is always 'project'." },
  projectVersion: { description: 'The project version — a semantic version string like 1.0.0.' },
  projectSpecPath: { description: 'Directory holding the project spec, relative to the project root.', default: 'rowan', pathKind: 'dir' },
  componentsPath: { description: 'Directory holding load components, relative to the project root.', default: 'rowan/components', pathKind: 'dir' },
  packagesPath: { description: 'Directory holding package source, relative to the project root.', default: 'src', pathKind: 'dir' },
  projectsPath: { description: 'Directory holding nested subproject specs, relative to the project root.', default: 'rowan/projects', pathKind: 'dir' },
  specsPath: { description: 'Directory holding load specifications, relative to the project root.', default: 'rowan/specs', pathKind: 'dir' },
  packageFormat: {
    description: 'On-disk format for package source.',
    values: ['tonel', 'filetree'],
    default: 'tonel',
  },
  packageConvention: {
    description: 'How package structure and method categories are interpreted when loading.',
    values: ['RowanHybrid', 'Rowan'],
    default: 'RowanHybrid',
  },
  comment: { description: 'Free-text description of this spec.', default: '' },

  // ── load spec (RwLoadSpecificationV2 / rowan/specs/<name>.ston) ──
  projectName: { description: 'The Rowan project this specification loads.' },
  projectSpecFile: { description: 'Path to the project spec, relative to the project root.', default: 'rowan/project.ston', pathKind: 'file' },
  componentNames: { description: 'The components this specification loads.' },
  groupNames: { description: 'Named package groups to load (in addition to the components).' },
  customConditionalAttributes: {
    description: 'Conditional attributes that switch optional packages/components on at load time (e.g. tests).',
  },
  gitUrl: { description: 'Git remote the project is fetched from.' },
  revision: { description: 'Git branch, tag, or commit to load.' },
  platformProperties: { description: 'Per-platform settings, e.g. the GemStone symbol dictionary to load into.' },
  defaultSymbolDictName: {
    description: 'Symbol dictionary new classes are created in. Any existing (or new) dictionary name is allowed; these are just the common ones.',
    suggestions: ['UserGlobals', 'Globals'],
    default: 'UserGlobals',
  },

  // ── component (RwLoadComponent / rowan/components/<name>.ston) ──
  name: { description: 'The component name.' },
  packageNames: { description: 'Packages this component loads.' },
  conditionalPackages: { description: 'Packages loaded only when their conditional attribute is active.' },
  projectNames: { description: 'Other Rowan projects this component depends on.' },
  condition: {
    description: 'The conditional attribute under which this component applies. Custom attributes are allowed.',
    suggestions: ['common'],
    default: 'common',
  },
  preloadDoitName: {
    description: 'A doit run before this component loads — used to pre-load Metacello dependencies.',
  },
};

// The keys each spec class may carry, so the editor can list available-but-unset
// options (with their defaults) alongside the ones the file actually sets.
export const STON_SCHEMAS: Record<string, string[]> = {
  RwProjectSpecificationV3: [
    'specName', 'projectVersion', 'projectSpecPath', 'componentsPath', 'packagesPath',
    'projectsPath', 'specsPath', 'packageFormat', 'packageConvention', 'comment',
  ],
  RwProjectSpecificationV2: [
    'specName', 'projectVersion', 'projectSpecPath', 'componentsPath', 'packagesPath',
    'projectsPath', 'specsPath', 'packageFormat', 'packageConvention', 'comment',
  ],
  RwLoadSpecificationV2: [
    'specName', 'projectName', 'projectSpecFile', 'componentNames', 'groupNames',
    'customConditionalAttributes', 'platformProperties', 'gitUrl', 'revision', 'comment',
  ],
  RwLoadComponent: [
    'name', 'condition', 'projectNames', 'componentNames', 'packageNames',
    'conditionalPackages', 'preloadDoitName', 'comment',
  ],
  RwSimpleProjectLoadComponentV2: [
    'name', 'condition', 'projectNames', 'componentNames', 'packageNames',
    'conditionalPackages', 'preloadDoitName', 'comment',
  ],
};

// The handful of keys that matter at a glance, per class — shown in the
// "Simplified" filter.
export const SIMPLIFIED_KEYS: Record<string, string[]> = {
  RwProjectSpecificationV3: ['projectVersion', 'packageFormat', 'packageConvention'],
  RwProjectSpecificationV2: ['projectVersion', 'packageFormat', 'packageConvention'],
  RwLoadSpecificationV2: ['projectName', 'componentNames', 'revision'],
  RwLoadComponent: ['name', 'packageNames', 'preloadDoitName'],
  RwSimpleProjectLoadComponentV2: ['name', 'packageNames', 'preloadDoitName'],
};

export function isSimplifiedKey(className: string | null, key: string): boolean {
  return !!className && (SIMPLIFIED_KEYS[className]?.includes(key) ?? false);
}

// The keys a spec of a given class must carry a non-empty value for. Editing one
// to empty — or omitting it — is flagged.
export const REQUIRED_KEYS: Record<string, string[]> = {
  RwProjectSpecificationV3: ['specName'],
  RwProjectSpecificationV2: ['specName'],
  RwLoadSpecificationV2: ['projectName'],
  RwLoadComponent: ['name'],
  RwSimpleProjectLoadComponentV2: ['name'],
};

export function isRequiredKey(className: string | null, key: string): boolean {
  return !!className && (REQUIRED_KEYS[className]?.includes(key) ?? false);
}

export function keyDoc(key: string): KeyDoc | undefined {
  return STON_KEY_DOCS[key];
}

// The keys a spec of `className` may carry (empty for unknown classes).
export function availableKeys(className: string | null): string[] {
  return (className && STON_SCHEMAS[className]) || [];
}

// Class-specific value rules, beyond the enum-membership check every keyed value
// with a closed `values` set already gets. Return a warning string when invalid.
const projectSpecName = (v: string): string | undefined =>
  v === 'project' ? undefined : "In project.ston, specName must be 'project'.";

const STON_VALIDATORS: Record<string, Record<string, (v: string) => string | undefined>> = {
  RwProjectSpecificationV3: { specName: projectSpecName },
  RwProjectSpecificationV2: { specName: projectSpecName },
};

// A warning for `value` at `key` within a spec of `className`, or undefined when
// it's valid. Runs the class-specific rule first, then falls back to checking
// membership for enum-valued keys.
export function validateKey(className: string | null, key: string, value: string): string | undefined {
  const explicit = className ? STON_VALIDATORS[className]?.[key]?.(value) : undefined;
  if (explicit) return explicit;
  if (isRequiredKey(className, key) && value.trim() === '') {
    return 'This field is required — it must not be empty.';
  }
  const doc = STON_KEY_DOCS[key];
  if (doc?.values && !doc.values.includes(value)) {
    return `Must be one of: ${doc.values.join(', ')}.`;
  }
  return undefined;
}
