import * as fs from 'fs';
import * as path from 'path';
import { RowanCatalogEntry } from './rowanCatalog';
import { metacelloLoadExpression } from './rowanMetacello';

// The default pre-load doit name used when a component doesn't already have one.
const DEFAULT_PRELOAD_DOIT = 'preload';

export interface AddDependencyResult {
  success: boolean;
  // Absolute path to the doit file written/updated.
  doitFile?: string;
  // True when the dependency was already present (nothing to do).
  alreadyPresent?: boolean;
  error?: string;
}

// Add a Metacello-baseline dependency to a Rowan project as a component
// **pre-load doit**: Rowan runs the doit (via String>>evaluate) before loading
// the component's packages, so the dependency is loaded first. Pure disk — no
// stone needed to declare it.
//
// A component has a single #preloadDoitName, so all pre-load work lives in one
// doit; adding a package appends its idiomatic Metacello load to that doit
// (creating it, and setting #preloadDoitName on the component, if absent).
export function addPreloadDependency(
  projectRoot: string,
  entry: RowanCatalogEntry,
  componentName = 'Core',
): AddDependencyResult {
  const componentsDir = path.join(projectRoot, 'rowan', 'components');
  const componentFile = path.join(componentsDir, `${componentName}.ston`);
  if (!fs.existsSync(componentFile)) {
    return { success: false, error: `Rowan component "${componentName}" not found at ${componentFile}.` };
  }
  try {
    let spec = fs.readFileSync(componentFile, 'utf8');
    const existingName = spec.match(/#preloadDoitName\s*:\s*'([^']*)'/);
    const doitName = existingName ? existingName[1] : DEFAULT_PRELOAD_DOIT;
    if (!existingName) {
      // Add #preloadDoitName right after #name : '...' (Rowan omits nil fields,
      // so a freshly-created component has no preload doit line yet).
      const withField = spec.replace(
        /(#name\s*:\s*'[^']*',\n)/,
        `$1\t#preloadDoitName : '${doitName}',\n`,
      );
      if (withField === spec) {
        return { success: false, error: `Could not add a pre-load doit to ${componentName}.ston.` };
      }
      spec = withField;
      fs.writeFileSync(componentFile, spec);
    }

    const doitFile = path.join(componentsDir, `${doitName}.st`);
    const existing = fs.existsSync(doitFile) ? fs.readFileSync(doitFile, 'utf8') : '';
    // Idempotent: this baseline+repository already loaded by the doit.
    if (existing.includes(entry.repository)) {
      return { success: true, doitFile, alreadyPresent: true };
    }
    const load = metacelloLoadExpression(entry);
    const contents = existing.trim().length > 0
      ? `${existing.replace(/\n*$/, '')}\n\n${load}\n`
      : `${load}\n`;
    fs.writeFileSync(doitFile, contents);
    return { success: true, doitFile };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// A dependency currently declared as a component pre-load doit.
export interface RowanDependency {
  // Display name, from the load block's leading comment.
  name: string;
  baseline: string;
  repository: string;
  // The component whose #preloadDoitName references the doit holding it.
  componentName: string;
  // Absolute path to the doit .st file.
  doitFile: string;
}

// One metacelloLoadExpression block: from its `"Load …"` comment to the `].` that
// closes the GsDeployer send. The block's only `].` is that terminator (the inner
// `onLock: [:ex | ex honor]` closes with `];`), so a non-greedy match is exact.
const DEP_BLOCK = /"Load [\s\S]*?\]\./g;

function parseDependencies(doit: string, componentName: string, doitFile: string): RowanDependency[] {
  return (doit.match(DEP_BLOCK) ?? []).map((block) => ({
    name: (block.match(/"Load (.+?) \(Metacello baseline '/) ?? [])[1]?.trim() ?? '(unknown)',
    baseline: (block.match(/baseline:\s*'((?:[^']|'')*)'/) ?? [])[1] ?? '',
    repository: (block.match(/repository:\s*'((?:[^']|'')*)'/) ?? [])[1] ?? '',
    componentName,
    doitFile,
  }));
}

// Every pre-load dependency declared across the project's components. Reads each
// component that has a #preloadDoitName and parses the load blocks in its doit.
export function listPreloadDependencies(projectRoot: string): RowanDependency[] {
  const componentsDir = path.join(projectRoot, 'rowan', 'components');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(componentsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const deps: RowanDependency[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ston')) continue;
    const componentName = path.basename(entry.name, '.ston');
    let spec: string;
    try {
      spec = fs.readFileSync(path.join(componentsDir, entry.name), 'utf8');
    } catch {
      continue;
    }
    const doitName = spec.match(/#preloadDoitName\s*:\s*'([^']*)'/)?.[1];
    if (!doitName) continue;
    const doitFile = path.join(componentsDir, `${doitName}.st`);
    let doit: string;
    try {
      doit = fs.readFileSync(doitFile, 'utf8');
    } catch {
      continue;
    }
    deps.push(...parseDependencies(doit, componentName, doitFile));
  }
  return deps;
}

// Remove the pre-load dependency identified by `repository` from its doit. The
// doit's remaining blocks are rewritten (joined by a blank line); an emptied doit
// becomes an empty file. Idempotent — succeeds even when nothing matched.
export function removePreloadDependency(projectRoot: string, repository: string): AddDependencyResult {
  for (const dep of listPreloadDependencies(projectRoot)) {
    if (dep.repository !== repository) continue;
    try {
      const doit = fs.readFileSync(dep.doitFile, 'utf8');
      const kept = (doit.match(DEP_BLOCK) ?? []).filter(
        (block) => !block.includes(`repository: '${repository}'`),
      );
      fs.writeFileSync(dep.doitFile, kept.length ? `${kept.join('\n\n')}\n` : '');
      return { success: true, doitFile: dep.doitFile };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { success: true };
}
