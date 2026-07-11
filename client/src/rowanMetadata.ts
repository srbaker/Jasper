import * as fs from 'fs';
import * as path from 'path';
import { readRowanWorkspaceProject, RowanWorkspaceProject } from './rowanProject';
import { findRowanLoadSpecs } from './rowanLoad';

// Disk edits to a Rowan project's metadata. Like rowanCreate.ts / rowanDependency.ts,
// these are pure fs + regex over the small flat STON files — no STON parser, no
// stone. Each returns a MetadataResult; the command layer surfaces errors.

export interface MetadataResult {
  success: boolean;
  // Absolute path to the file/dir written (for "open it" affordances).
  path?: string;
  error?: string;
}

// STON single-quoted string escaping: a literal quote is doubled.
function q(s: string): string {
  return s.replace(/'/g, "''");
}

// The load-spec file for a project: the sole spec, else the one whose name
// matches the project's display name. undefined when ambiguous/absent.
function loadSpecPath(project: RowanWorkspaceProject): string | undefined {
  const specs = findRowanLoadSpecs(path.join(project.root, project.specsPath ?? 'rowan/specs'));
  if (specs.length === 1) return specs[0].path;
  return specs.find((s) => s.name === project.name)?.path;
}

// The quoted-string elements of a STON array field `#field : [ … ]`, or null when
// the field is absent. The arrays we touch (packageNames, componentNames,
// projectNames) hold only quoted strings, so the first `]` closes the array.
function stonArrayElements(content: string, field: string): string[] | null {
  const m = content.match(new RegExp(`#${field}\\s*:\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) return null;
  return [...m[1].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1]);
}

// Replace a STON array field's contents with `elements`, emitted in the shipped
// multi-line style (elements at two tabs, closing bracket at one) — or `[ ]` when
// empty. Assumes the field exists.
function setStonArray(content: string, field: string, elements: string[]): string {
  const body = elements.length
    ? `\n${elements.map((e) => `\t\t'${q(e)}'`).join(',\n')}\n\t`
    : ' ';
  return content.replace(
    new RegExp(`(#${field}\\s*:\\s*\\[)[\\s\\S]*?(\\])`),
    `$1${body}$2`,
  );
}

// The properties.st a new package carries (per-package format/convention),
// matching rowanCreate.ts's byte layout.
function propertiesSt(format: string, convention: string): string {
  return `{ \n\t#format : '${q(format)}',\n\t#convention : '${q(convention)}'\n}\n`;
}

// A fresh load component (RwLoadComponent), matching rowanCreate.ts's Core.ston.
function componentSton(name: string): string {
  return [
    'RwLoadComponent {',
    `\t#name : '${q(name)}',`,
    '\t#projectNames : [ ],',
    '\t#componentNames : [ ],',
    '\t#packageNames : [ ],',
    "\t#comment : ''",
    '}',
  ].join('\n');
}

// A project/package name that is safe as a folder and a STON identifier: letters,
// digits, and the separators Rowan uses in package names (`-`, `.`, `_`).
export function isValidRowanName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name);
}

// Set a scalar project.ston field (packageFormat / packageConvention). Inserts the
// field before #comment when absent (Rowan omits nil fields from a spec).
export function setProjectSpecField(
  root: string,
  field: 'packageFormat' | 'packageConvention',
  value: string,
): MetadataResult {
  const specPath = path.join(root, 'rowan', 'project.ston');
  let content: string;
  try {
    content = fs.readFileSync(specPath, 'utf8');
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
  const re = new RegExp(`(#${field}\\s*:\\s*')(?:[^']|'')*(')`);
  if (re.test(content)) {
    content = content.replace(re, `$1${q(value)}$2`);
  } else {
    const inserted = content.replace(
      /(\n\t#comment\s*:)/,
      `\n\t#${field} : '${q(value)}',$1`,
    );
    if (inserted === content) {
      return { success: false, error: `Could not set ${field} in project.ston.` };
    }
    content = inserted;
  }
  try {
    fs.writeFileSync(specPath, content);
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { success: true, path: specPath };
}

// Rename the project: rewrite the load spec's #projectName (and #specName if
// present) and rename the spec file to <newName>.ston, since the display name is
// derived from the spec's #specName/filename.
export function renameProject(root: string, newName: string): MetadataResult {
  if (!isValidRowanName(newName)) {
    return { success: false, error: `"${newName}" is not a valid project name.` };
  }
  const project = readRowanWorkspaceProject(root);
  if (!project) return { success: false, error: 'Not a Rowan project.' };
  const specPath = loadSpecPath(project);
  if (!specPath) {
    return { success: false, error: 'Could not find a single load spec to rename.' };
  }
  const newSpecPath = path.join(path.dirname(specPath), `${newName}.ston`);
  if (newSpecPath !== specPath && fs.existsSync(newSpecPath)) {
    return { success: false, error: `A spec named "${newName}.ston" already exists.` };
  }
  try {
    let content = fs.readFileSync(specPath, 'utf8');
    content = content.replace(/(#projectName\s*:\s*')(?:[^']|'')*(')/, `$1${q(newName)}$2`);
    content = content.replace(/(#specName\s*:\s*')(?:[^']|'')*(')/, `$1${q(newName)}$2`);
    fs.writeFileSync(specPath, content);
    if (newSpecPath !== specPath) fs.renameSync(specPath, newSpecPath);
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { success: true, path: newSpecPath };
}

// Create a package directory (with properties.st) under the project's packages
// root and register it in `componentName`'s #packageNames so it loads.
export function addProjectPackage(
  root: string,
  packageName: string,
  componentName = 'Core',
): MetadataResult {
  if (!isValidRowanName(packageName)) {
    return { success: false, error: `"${packageName}" is not a valid package name.` };
  }
  const project = readRowanWorkspaceProject(root);
  if (!project) return { success: false, error: 'Not a Rowan project.' };
  const pkgDir = path.join(root, project.packagesPath, packageName);
  if (fs.existsSync(pkgDir)) {
    return { success: false, error: `Package "${packageName}" already exists.` };
  }
  try {
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'properties.st'),
      propertiesSt(project.packageFormat ?? 'tonel', project.packageConvention ?? 'RowanHybrid'),
    );
    registerInComponent(project, componentName, 'packageNames', packageName);
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { success: true, path: pkgDir };
}

// Create a load component (rowan/components/<name>.ston) and wire it into the
// load spec's #componentNames so it loads with the project.
export function addProjectComponent(root: string, componentName: string): MetadataResult {
  if (!isValidRowanName(componentName)) {
    return { success: false, error: `"${componentName}" is not a valid component name.` };
  }
  const project = readRowanWorkspaceProject(root);
  if (!project) return { success: false, error: 'Not a Rowan project.' };
  const componentsDir = path.join(root, project.componentsPath ?? 'rowan/components');
  const compFile = path.join(componentsDir, `${componentName}.ston`);
  if (fs.existsSync(compFile)) {
    return { success: false, error: `Component "${componentName}" already exists.` };
  }
  try {
    fs.mkdirSync(componentsDir, { recursive: true });
    fs.writeFileSync(compFile, componentSton(componentName));
    const specPath = loadSpecPath(project);
    if (specPath) {
      let content = fs.readFileSync(specPath, 'utf8');
      const els = stonArrayElements(content, 'componentNames') ?? [];
      if (!els.includes(componentName)) {
        content = setStonArray(content, 'componentNames', [...els, componentName]);
        fs.writeFileSync(specPath, content);
      }
    }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { success: true, path: compFile };
}

// Add `value` to a component's STON array field (idempotent). No-op when the
// component file is absent — the package/dir is still created either way.
function registerInComponent(
  project: RowanWorkspaceProject,
  componentName: string,
  field: 'packageNames' | 'componentNames',
  value: string,
): void {
  const compFile = path.join(
    project.root,
    project.componentsPath ?? 'rowan/components',
    `${componentName}.ston`,
  );
  if (!fs.existsSync(compFile)) return;
  let content = fs.readFileSync(compFile, 'utf8');
  const els = stonArrayElements(content, field) ?? [];
  if (els.includes(value)) return;
  content = setStonArray(content, field, [...els, value].sort());
  fs.writeFileSync(compFile, content);
}

// The load components declared under the project (name + file path), for pickers.
export function listComponents(root: string): { name: string; path: string }[] {
  const project = readRowanWorkspaceProject(root);
  if (!project) return [];
  const dir = path.join(root, project.componentsPath ?? 'rowan/components');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.ston'))
    .map((e) => ({ name: path.basename(e.name, '.ston'), path: path.join(dir, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
