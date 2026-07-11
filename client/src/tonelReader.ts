// A focused reader for a single Tonel class file (`<Class>.class.st` /
// `<Class>.extension.st`) — enough to drive the Rowan package tree (class name +
// its methods) and, later, disk-first method editing (each method carries the
// line range of its block so a caller can slice it out and splice an edit back).
//
// A Tonel class file is:
//   "optional class comment"
//   Class { #name : 'Foo', #superclass : 'Object', #category : 'Foo-Core', … }
//   { #category : 'accessing' }
//   Foo >> bar [ …body… ]
//   { #category : 'accessing' }
//   Foo class >> baz [ …body… ]
//
// This is a line-based port of server/src/tonel/tonelParser.ts (which isn't
// reachable from the client workspace), returning client-friendly shapes rather
// than LSP TopazRegions. Not a general Smalltalk parser — just the structure
// these files carry.

export interface TonelMethod {
  // The canonical selector, e.g. 'bar', '+', or 'at:put:'.
  selector: string;
  // The signature as written between `>>` and `[`, e.g. 'at: k put: v'.
  pattern: string;
  side: 'instance' | 'class';
  category?: string;
  // The method as the image sees it: selector pattern + body, without the
  // `Class >>` prefix or the `{ #category }` annotation. This is the editable
  // source (what a System Browser shows).
  source: string;
  // 0-based line indices into the file. `signatureLine` is the `Class >> sel [`
  // line; `closingLine` is the matching `]`; `annotationLine` is the preceding
  // `{ #category }` line when present. The block [annotationLine ?? signatureLine
  // .. closingLine] is the whole method on disk — the slice a caller replaces.
  signatureLine: number;
  closingLine: number;
  annotationLine?: number;
}

export interface TonelClass {
  // The class the file defines (Class) or extends (Extension); undefined if the
  // header is missing/unrecognized.
  name?: string;
  superclass?: string;
  category?: string;
  kind: 'class' | 'extension' | 'unknown';
  methods: TonelMethod[];
}

// Derive the canonical selector from a signature pattern:
//   'bar'            -> 'bar'        (unary)
//   '<= other'       -> '<='        (binary)
//   'at: k put: v'   -> 'at:put:'   (keyword)
export function selectorFromPattern(pattern: string): string {
  const p = pattern.trim();
  if (p.includes(':')) {
    const keywords = p.match(/[A-Za-z_]\w*:/g);
    if (keywords && keywords.length > 0) return keywords.join('');
  }
  if (!/^\w/.test(p)) {
    const binary = p.match(/^([-+*/~<>=&|@%,?!]+)/);
    if (binary) return binary[1];
  }
  const unary = p.match(/^(\w+)/);
  return unary ? unary[1] : p;
}

// A value from STON-like header text: extractStonField("#name : 'Foo'", 'name') → 'Foo'.
function extractStonField(text: string, key: string): string | undefined {
  const m = text.match(new RegExp(`#${key}\\s*:\\s*'([^']*)'`));
  return m ? m[1] : undefined;
}

// A Tonel method signature line: `Class >> sel [` / `Class class >> sel [`.
function parseSignature(line: string): { isClassSide: boolean; pattern: string } | null {
  const m = line.match(/^\s*(\w+)(\s+class)?\s*>>\s*(.+?)\s*\[\s*$/);
  if (!m) return null;
  return { isClassSide: !!m[2], pattern: m[3].trim() };
}

// The line index of the `]` closing the method opened at `openLine`, counting
// brackets while ignoring those inside strings ('…') and comments ("…").
function findMethodEnd(lines: string[], openLine: number): number {
  let depth = 0;
  let inString = false;
  let inComment = false;
  for (let i = openLine; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (inString) {
        if (ch === "'") {
          if (line[j + 1] === "'") j++;
          else inString = false;
        }
        continue;
      }
      if (inComment) {
        if (ch === '"') inComment = false;
        continue;
      }
      if (ch === "'") { inString = true; continue; }
      if (ch === '"') { inComment = true; continue; }
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return lines.length - 1;
}

export function parseTonelClass(text: string): TonelClass {
  const lines = text.split('\n');
  let i = 0;

  // Skip an optional leading class comment ("...").
  if (i < lines.length && lines[i].trimStart().startsWith('"')) {
    const afterQuote = lines[i].trimStart().slice(1);
    if (afterQuote.includes('"')) {
      i++;
    } else {
      i++;
      while (i < lines.length && !lines[i].includes('"')) i++;
      if (i < lines.length) i++;
    }
    while (i < lines.length && lines[i].trim() === '') i++;
  }

  // Header: Class { … } or Extension { … } (Package files have no class).
  let name: string | undefined;
  let superclass: string | undefined;
  let category: string | undefined;
  let kind: TonelClass['kind'] = 'unknown';
  const headerMatch = i < lines.length ? lines[i].match(/^(Class|Extension)\s*\{/) : null;
  if (headerMatch) {
    kind = headerMatch[1] === 'Class' ? 'class' : 'extension';
    let depth = 0;
    let end = i;
    outer: for (let h = i; h < lines.length; h++) {
      for (const ch of lines[h]) {
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = h; break outer; } }
      }
    }
    const headerText = lines.slice(i, end + 1).join('\n');
    name = extractStonField(headerText, 'name');
    superclass = extractStonField(headerText, 'superclass');
    category = extractStonField(headerText, 'category');
    i = end + 1;
  }

  // Methods.
  const methods: TonelMethod[] = [];
  while (i < lines.length) {
    if (lines[i].trim() === '') { i++; continue; }

    // Optional annotation: { #category : '…' } (not a Class/Extension header).
    let annotationLine: number | undefined;
    let methodCategory: string | undefined;
    const t = lines[i].trimStart();
    if (t.startsWith('{') && !/^(Class|Extension|Package)\s*\{/.test(t)) {
      annotationLine = i;
      let depth = 0;
      let annotText = '';
      let done = false;
      for (let a = i; a < lines.length && !done; a++) {
        annotText += lines[a];
        for (const ch of lines[a]) {
          if (ch === '{') depth++;
          else if (ch === '}') { depth--; if (depth === 0) { i = a + 1; done = true; break; } }
        }
      }
      methodCategory = extractStonField(annotText, 'category');
      while (i < lines.length && lines[i].trim() === '') i++;
    }

    if (i >= lines.length) break;

    const sig = parseSignature(lines[i]);
    if (!sig) { i++; continue; }

    const signatureLine = i;
    const closingLine = findMethodEnd(lines, signatureLine);
    const body = lines.slice(signatureLine + 1, closingLine).join('\n');
    methods.push({
      selector: selectorFromPattern(sig.pattern),
      pattern: sig.pattern,
      side: sig.isClassSide ? 'class' : 'instance',
      category: methodCategory,
      source: body.length > 0 ? `${sig.pattern}\n${body}` : sig.pattern,
      signatureLine,
      closingLine,
      annotationLine,
    });
    i = closingLine + 1;
  }

  return { name, superclass, category, kind, methods };
}
