import { keyDoc, KeyDoc, availableKeys, validateKey, isSimplifiedKey, isRequiredKey } from './stonKeyDocs';

// A focused STON (Smalltalk Object Notation) reader — enough for the flat,
// well-formed .ston files a Rowan project carries (specs, components, project
// metadata): typed objects `Class { #key : value, … }`, maps, arrays, strings,
// symbols, numbers, booleans, nil. Not a general STON parser (no references,
// dates, byte arrays) — those don't appear in these files.
//
// Scalar values carry their source `range`, so the pretty editor can write an
// edited value back by replacing exactly that span (formatting elsewhere is
// preserved).

export type StonValue = StonObject | StonList | StonScalar;

export interface StonObject {
  kind: 'object';
  className: string | null;
  entries: StonEntry[];
  // [start, end) source offsets of the whole object (class tag through `}`).
  range: [number, number];
}
export interface StonEntry {
  key: string;
  keyKind: 'symbol' | 'string';
  value: StonValue;
  // [start, end) of the key token, and of the whole `key : value` entry.
  keyRange: [number, number];
  range: [number, number];
}
export interface StonList {
  kind: 'list';
  className: string | null;
  items: StonValue[];
  // [start, end) source offsets of the whole array (class tag through `]`).
  range: [number, number];
}

// The [start, end) source offsets of any value.
export function valueRange(v: StonValue): [number, number] {
  return v.range;
}
export interface StonScalar {
  kind: 'string' | 'symbol' | 'number' | 'boolean' | 'nil';
  value: string;
  // [start, end) source offsets of the literal (quotes included for strings).
  range: [number, number];
}

export interface StonParseError {
  error: string;
}

export function isStonParseError(v: StonValue | StonParseError): v is StonParseError {
  return (v as StonParseError).error !== undefined;
}
export function isStonScalar(v: StonValue): v is StonScalar {
  return v.kind !== 'object' && v.kind !== 'list';
}

class Reader {
  private pos = 0;
  constructor(private readonly s: string) {}

  parse(): StonValue {
    const v = this.value();
    this.ws();
    if (this.pos < this.s.length) throw new Error(`Unexpected trailing content at offset ${this.pos}`);
    return v;
  }

  private ws(): void {
    while (this.pos < this.s.length && /\s/.test(this.s[this.pos])) this.pos++;
  }
  private peek(): string {
    return this.s[this.pos];
  }
  private expect(ch: string): void {
    if (this.s[this.pos] !== ch) throw new Error(`Expected '${ch}' at offset ${this.pos}`);
    this.pos++;
  }

  private value(): StonValue {
    this.ws();
    const start = this.pos;
    if (this.pos >= this.s.length) throw new Error('Unexpected end of input');
    const c = this.peek();
    if (c === '{') return this.map(null, start);
    if (c === '[') return this.list(null, start);
    if (c === "'") return { kind: 'string', value: this.string(), range: [start, this.pos] };
    if (c === '#') return { kind: 'symbol', value: this.symbol(), range: [start, this.pos] };
    if (c === '-' || (c >= '0' && c <= '9')) return { kind: 'number', value: this.number(), range: [start, this.pos] };

    const id = this.identifier();
    if (id === 'true' || id === 'false') return { kind: 'boolean', value: id, range: [start, this.pos] };
    if (id === 'nil') return { kind: 'nil', value: 'nil', range: [start, this.pos] };
    this.ws();
    if (this.peek() === '{') return this.map(id, start);
    if (this.peek() === '[') return this.list(id, start);
    throw new Error(`Unexpected token '${id}' at offset ${this.pos}`);
  }

  private map(className: string | null, start: number): StonObject {
    this.ws();
    this.expect('{');
    const entries: StonEntry[] = [];
    this.ws();
    while (this.peek() !== '}') {
      this.ws();
      const keyStart = this.pos;
      const { key, keyKind } = this.key();
      const keyEnd = this.pos;
      this.ws();
      this.expect(':');
      const value = this.value();
      entries.push({ key, keyKind, value, keyRange: [keyStart, keyEnd], range: [keyStart, value.range[1]] });
      this.ws();
      if (this.peek() === ',') {
        this.pos++;
        this.ws();
      }
      if (this.pos >= this.s.length) throw new Error("Unterminated '{'");
    }
    this.expect('}');
    return { kind: 'object', className, entries, range: [start, this.pos] };
  }

  private list(className: string | null, start: number): StonList {
    this.ws();
    this.expect('[');
    const items: StonValue[] = [];
    this.ws();
    while (this.peek() !== ']') {
      items.push(this.value());
      this.ws();
      if (this.peek() === ',') {
        this.pos++;
        this.ws();
      }
      if (this.pos >= this.s.length) throw new Error("Unterminated '['");
    }
    this.expect(']');
    return { kind: 'list', className, items, range: [start, this.pos] };
  }

  private key(): { key: string; keyKind: 'symbol' | 'string' } {
    this.ws();
    if (this.peek() === '#') return { key: this.symbol(), keyKind: 'symbol' };
    if (this.peek() === "'") return { key: this.string(), keyKind: 'string' };
    throw new Error(`Expected a symbol or string key at offset ${this.pos}`);
  }

  private string(): string {
    this.expect("'");
    let out = '';
    while (this.pos < this.s.length) {
      const c = this.s[this.pos++];
      if (c === "'") {
        if (this.s[this.pos] === "'") {
          out += "'";
          this.pos++;
        } else {
          return out;
        }
      } else {
        out += c;
      }
    }
    throw new Error('Unterminated string');
  }

  private symbol(): string {
    this.expect('#');
    if (this.peek() === "'") return this.string();
    const start = this.pos;
    while (this.pos < this.s.length && /[A-Za-z0-9_:]/.test(this.s[this.pos])) this.pos++;
    if (this.pos === start) throw new Error(`Empty symbol at offset ${this.pos}`);
    return this.s.slice(start, this.pos);
  }

  private number(): string {
    const start = this.pos;
    if (this.peek() === '-') this.pos++;
    while (this.pos < this.s.length && /[0-9.eE+-]/.test(this.s[this.pos])) this.pos++;
    return this.s.slice(start, this.pos);
  }

  private identifier(): string {
    const start = this.pos;
    while (this.pos < this.s.length && /[A-Za-z0-9_]/.test(this.s[this.pos])) this.pos++;
    if (this.pos === start) throw new Error(`Unexpected character '${this.peek()}' at offset ${this.pos}`);
    return this.s.slice(start, this.pos);
  }
}

export function parseSton(src: string): StonValue | StonParseError {
  try {
    return new Reader(src).parse();
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Readable names for the STON class tags in Rowan files; anything else is
// de-camel-cased with the `Rw` prefix and `V<n>` suffix stripped.
const FRIENDLY: Record<string, string> = {
  RwProjectSpecificationV3: 'Project',
  RwProjectSpecificationV2: 'Project',
  RwLoadSpecificationV2: 'Load Specification',
  RwLoadComponent: 'Component',
  RwSimpleProjectLoadComponentV2: 'Component',
};
export function friendlyClassName(className: string | null): string {
  if (!className) return 'Object';
  if (FRIENDLY[className]) return FRIENDLY[className];
  const s = className
    .replace(/^Rw/, '')
    .replace(/V\d+$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return s || className;
}

// Walk `path` (map keys as strings, array indices as numbers) to a scalar value.
export function findScalarByPath(root: StonValue, path: (string | number)[]): StonScalar | undefined {
  let cur: StonValue | undefined = root;
  for (const seg of path) {
    if (!cur) return undefined;
    if (cur.kind === 'object' && typeof seg === 'string') {
      cur = cur.entries.find((e) => e.key === seg)?.value;
    } else if (cur.kind === 'list' && typeof seg === 'number') {
      cur = cur.items[seg];
    } else {
      return undefined;
    }
  }
  return cur && isStonScalar(cur) ? cur : undefined;
}

// The STON literal for an edited scalar of the given kind.
export function serializeScalarLiteral(kind: StonScalar['kind'], value: string): string {
  switch (kind) {
    case 'string':
      return `'${value.replace(/'/g, "''")}'`;
    case 'symbol':
      return /^[A-Za-z0-9_:]+$/.test(value) ? `#${value}` : `#'${value.replace(/'/g, "''")}'`;
    case 'boolean':
      return value === 'true' ? 'true' : 'false';
    case 'nil':
      return 'nil';
    case 'number':
      return value.trim();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Render a parsed STON value as the body of the settings grid — rows of
// key → editable value. Documented keys get an info tooltip; keys with a closed
// value set render as a dropdown. `fileId` (a URI string) tags every input so
// the editor can route an edit to the right file when several are aggregated
// into one view. Pure (no DOM/vscode) so the shape is unit-testable.
// Which keys to show:
//   simplified — the handful that matter at a glance (per-class SIMPLIFIED_KEYS)
//   specified  — every key the file sets
//   different  — only keys whose value differs from the Rowan default
//   all        — everything the file sets *plus* available-but-unset keys
export type StonFilter = 'simplified' | 'specified' | 'different' | 'all';

// An extra, context-dependent validity check the caller supplies (e.g. the
// editor checking that a path-valued key points at something on disk). Returns
// a warning string, or undefined when the value is fine. Kept out of the pure
// parser so fs access lives with the editor.
export type StonWarn = (key: string, value: string) => string | undefined;

export function renderStonForm(root: StonValue, fileId = '', filter: StonFilter = 'all', warn?: StonWarn): string {
  if (root.kind !== 'object') return renderValue(root, [], fileId, filter, warn);
  const present = renderEntries(root.entries, [], fileId, root.className, filter, warn);
  const unset = filter === 'all' ? renderAvailableRows(root, fileId) : '';
  const body = present + unset;
  return body ? `<div class="ston-rows">${body}</div>` : `<div class="ston-empty">Nothing matches this filter.</div>`;
}

function renderValue(v: StonValue, path: (string | number)[], fileId: string, filter: StonFilter, warn?: StonWarn): string {
  if (v.kind === 'object') {
    const inner = renderEntries(v.entries, path, fileId, v.className, filter, warn);
    return inner ? `<div class="ston-rows">${inner}</div>` : `<div class="ston-empty">(empty)</div>`;
  }
  if (v.kind === 'list') return renderArray(v, path, fileId, filter, warn);
  return renderScalarRow('value', v, path, fileId, null, warn);
}

// Concatenated entry HTML (each entry may render '' under the filter); '' when
// nothing passes, so callers can drop an empty container/section.
function renderEntries(entries: StonEntry[], basePath: (string | number)[], fileId: string, className: string | null, filter: StonFilter, warn?: StonWarn): string {
  return entries.map((e) => renderEntry(e, [...basePath, e.key], fileId, className, filter, warn)).join('');
}

function renderEntry(entry: StonEntry, path: (string | number)[], fileId: string, className: string | null, filter: StonFilter, warn?: StonWarn): string {
  if (filter === 'simplified' && !isSimplifiedKey(className, entry.key)) return '';
  const v = entry.value;
  if (v.kind === 'object') {
    const inner = renderEntries(v.entries, path, fileId, v.className, filter, warn);
    if (!inner) return '';
    return (
      `<div class="ston-section"><div class="ston-subtitle">${labelInner(entry.key)}</div>` +
      `<div class="ston-indent"><div class="ston-rows">${inner}</div></div></div>`
    );
  }
  if (v.kind === 'list') {
    return `<div class="ston-row"><div class="ston-label">${labelInner(entry.key)}</div><div class="ston-field">${renderArray(v, path, fileId, filter, warn)}</div></div>`;
  }
  const doc = keyDoc(entry.key);
  if (filter === 'different' && doc?.default !== undefined && doc.default === v.value) return '';
  return renderScalarRow(entry.key, v, path, fileId, className, warn);
}

function renderScalarRow(key: string, scalar: StonScalar, path: (string | number)[], fileId: string, className: string | null, warn?: StonWarn): string {
  const doc = keyDoc(key);
  const atDefault = doc?.default !== undefined && doc.default === scalar.value;
  const tag = atDefault ? `<span class="ston-tag">default</span>` : '';
  const warning = validateKey(className, key, scalar.value) ?? warn?.(key, scalar.value);
  const warn_ = warning ? warnIcon(warning) : '';
  return (
    `<div class="ston-row${warning ? ' ston-row-warn' : ''}"><div class="ston-label">${labelInner(key)}</div>` +
    `<div class="ston-field">${renderInput(scalar, path, fileId, key)}${tag}${warn_}</div></div>`
  );
}

// The available-but-unset keys for the root object's class, shown (with their
// defaults) after the keys the file actually sets, each with a "Set" affordance.
function renderAvailableRows(root: StonObject, fileId: string): string {
  const present = new Set(root.entries.map((e) => e.key));
  const missing = availableKeys(root.className).filter((k) => !present.has(k));
  if (missing.length === 0) return '';
  const rows = missing.map((k) => renderUnsetRow(k, fileId, root.className)).join('');
  return `<div class="ston-avail-head">Available</div>${rows}`;
}

function renderUnsetRow(key: string, fileId: string, className: string | null): string {
  const doc = keyDoc(key);
  const required = isRequiredKey(className, key);
  const hasDefault = doc?.default !== undefined;
  const shown = required
    ? `<span class="ston-required">required — not set</span>`
    : hasDefault
      ? `${escapeHtml(doc!.default === '' ? "''" : doc!.default!)} <span class="ston-tag">default</span>`
      : `<span class="ston-not-set">not set</span>`;
  return (
    `<div class="ston-row ston-row-unset${required ? ' ston-row-warn' : ''}"><div class="ston-label">${labelInner(key)}</div>` +
    `<div class="ston-field"><span class="ston-default-val">${shown}</span>` +
    `<button class="ston-set" data-file="${escapeAttr(fileId)}" data-key="${escapeAttr(key)}" data-value="${escapeAttr(doc?.default ?? '')}">Set</button>` +
    `</div></div>`
  );
}

function warnIcon(message: string): string {
  return (
    `<span class="ston-warn" tabindex="0" aria-label="${escapeAttr(message)}"><span class="ston-warn-mark">!</span>` +
    `<span class="ston-tip ston-tip-warn">${escapeHtml(message)}</span></span>`
  );
}

// The key text plus, when the key is documented, an info dot whose hover tooltip
// explains what it represents and its allowed values.
function labelInner(key: string): string {
  const doc = keyDoc(key);
  return `<span class="ston-key">${escapeHtml(key)}</span>${doc ? helpIcon(doc) : ''}`;
}

function helpIcon(doc: KeyDoc): string {
  const opts = doc.values
    ? `<div class="ston-tip-opts">Options: ${doc.values.map((v) => `<code>${escapeHtml(v)}</code>`).join(', ')}</div>`
    : '';
  return (
    `<span class="ston-help" tabindex="0" aria-label="${escapeAttr(doc.description)}"><span class="ston-help-dot">i</span>` +
    `<span class="ston-tip"><span class="ston-tip-desc">${escapeHtml(doc.description)}</span>${opts}</span></span>`
  );
}

function renderInput(scalar: StonScalar, path: (string | number)[], fileId: string, key: string): string {
  const f = escapeAttr(fileId);
  const p = escapeAttr(JSON.stringify(path));
  if (scalar.kind === 'boolean') {
    return `<label class="ston-toggle"><input type="checkbox" data-file="${f}" data-path="${p}" data-kind="boolean"${scalar.value === 'true' ? ' checked' : ''}><span>${scalar.value}</span></label>`;
  }
  if (scalar.kind === 'nil') {
    return `<span class="ston-nil">nil</span>`;
  }
  const doc = keyDoc(key);
  if (doc?.values && scalar.kind === 'string') {
    const opts = doc.values.includes(scalar.value) ? doc.values : [scalar.value, ...doc.values];
    return (
      `<select class="ston-input ston-select" data-file="${f}" data-path="${p}" data-kind="string">` +
      opts.map((o) => `<option${o === scalar.value ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('') +
      `</select>`
    );
  }
  if (doc?.suggestions && scalar.kind === 'string') {
    const listId = `ston-dl-${escapeAttr(key)}`;
    const options = doc.suggestions.map((o) => `<option value="${escapeAttr(o)}"></option>`).join('');
    return (
      `<input type="text" class="ston-input ston-input-string" list="${listId}" data-file="${f}" data-path="${p}" data-kind="string" value="${escapeAttr(scalar.value)}">` +
      `<datalist id="${listId}">${options}</datalist>`
    );
  }
  return `<input type="text" class="ston-input ston-input-${scalar.kind}" data-file="${f}" data-path="${p}" data-kind="${scalar.kind}" value="${escapeAttr(scalar.value)}">`;
}

function renderArray(list: StonList, path: (string | number)[], fileId: string, filter: StonFilter, warn?: StonWarn): string {
  if (list.items.length === 0) return `<span class="ston-empty">(none)</span>`;
  const items = list.items
    .map((it, i) =>
      isStonScalar(it)
        ? `<span class="ston-chip ston-chip-${it.kind}">${escapeHtml(it.kind === 'symbol' ? '#' + it.value : it.value)}</span>`
        : `<div class="ston-array-node">${renderValue(it, [...path, i], fileId, filter, warn)}</div>`,
    )
    .join('');
  return `<div class="ston-array">${items}</div>`;
}
