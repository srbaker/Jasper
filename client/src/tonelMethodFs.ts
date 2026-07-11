import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseTonelClass, TonelMethod } from './tonelReader';

// A virtual file system that presents a single Tonel method for focused,
// disk-first editing: opening a `tonel-method://` document reads just that
// method's source (selector pattern + body, as a System Browser shows it) out of
// its `.class.st` file, and saving splices the edit back into the file in place,
// leaving the rest of the class untouched. No stone/session involved.
//
// The method is identified entirely in the URI's query (base64url so any path or
// selector — including binary `/` — round-trips cleanly); the path is a readable
// label that becomes the editor tab title.

const SCHEME = 'tonel-method';

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

export interface TonelMethodRef {
  file: string;
  side: 'instance' | 'class';
  selector: string;
}

export function buildTonelMethodUri(file: string, side: 'instance' | 'class', selector: string): vscode.Uri {
  const label = `${side === 'class' ? 'class ' : ''}${selector}`.replace(/[\\/:*?"<>|]/g, '·');
  return vscode.Uri.from({
    scheme: SCHEME,
    path: `/${label}.st`,
    query: `f=${b64url(file)}&s=${side}&m=${b64url(selector)}`,
  });
}

export function parseTonelMethodUri(uri: vscode.Uri): TonelMethodRef {
  const q = new URLSearchParams(uri.query);
  const f = q.get('f');
  const s = q.get('s');
  const m = q.get('m');
  if (!f || !m || (s !== 'instance' && s !== 'class')) {
    throw vscode.FileSystemError.FileNotFound(uri);
  }
  return { file: unb64url(f), side: s, selector: unb64url(m) };
}

function findMethod(fileText: string, side: 'instance' | 'class', selector: string): TonelMethod | undefined {
  return parseTonelClass(fileText).methods.find(m => m.side === side && m.selector === selector);
}

// The editable source (selector pattern + body) of `selector` on `side`, or
// undefined when the class file no longer holds that method.
export function readMethodSource(fileText: string, side: 'instance' | 'class', selector: string): string | undefined {
  return findMethod(fileText, side, selector)?.source;
}

// Return `fileText` with the method's block replaced by `editedSource` (a
// selector pattern + body). The `{ #category }` annotation and every other
// method are preserved verbatim; the class name and side come from the original
// signature. Throws when the method isn't found.
export function spliceMethodSource(
  fileText: string, className: string, side: 'instance' | 'class', selector: string, editedSource: string,
): string {
  const newline = fileText.includes('\r\n') ? '\r\n' : '\n';
  const lines = fileText.split(/\r?\n/);
  const m = findMethod(fileText, side, selector);
  if (!m) throw new Error(`Method ${side} ${selector} not found`);

  const edited = editedSource.split(/\r?\n/);
  const pattern = edited[0] ?? selector;
  const body = edited.slice(1);
  const signature = `${className}${side === 'class' ? ' class' : ''} >> ${pattern} [`;

  const block: string[] = [];
  // Keep the annotation line(s) (and any blanks) between it and the signature.
  const start = m.annotationLine ?? m.signatureLine;
  if (m.annotationLine !== undefined) {
    for (let i = m.annotationLine; i < m.signatureLine; i++) block.push(lines[i]);
  }
  block.push(signature, ...body, ']');

  const next = [...lines.slice(0, start), ...block, ...lines.slice(m.closingLine + 1)];
  return next.join(newline);
}

export class TonelMethodFileSystemProvider implements vscode.FileSystemProvider {
  static readonly scheme = SCHEME;

  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.emitter.event;

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => { /* nothing to watch — backed by a .class.st */ });
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const { file } = parseTonelMethodUri(uri);
    let mtime = 0;
    try { mtime = fs.statSync(file).mtimeMs; } catch { /* new/unreadable */ }
    return { type: vscode.FileType.File, ctime: 0, mtime, size: this.read(uri).byteLength };
  }

  readFile(uri: vscode.Uri): Uint8Array {
    return this.read(uri);
  }

  writeFile(uri: vscode.Uri, content: Uint8Array): void {
    const { file, side, selector } = parseTonelMethodUri(uri);
    const fileText = fs.readFileSync(file, 'utf8');
    const className = parseTonelClass(fileText).name;
    if (!className) throw vscode.FileSystemError.FileNotFound(uri);
    const next = spliceMethodSource(fileText, className, side, selector, Buffer.from(content).toString('utf8'));
    fs.writeFileSync(file, next);
    this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  private read(uri: vscode.Uri): Uint8Array {
    const { file, side, selector } = parseTonelMethodUri(uri);
    let fileText: string;
    try { fileText = fs.readFileSync(file, 'utf8'); } catch { throw vscode.FileSystemError.FileNotFound(uri); }
    const source = readMethodSource(fileText, side, selector);
    if (source === undefined) throw vscode.FileSystemError.FileNotFound(uri);
    return Buffer.from(source, 'utf8');
  }

  // Method docs aren't directories and can't be created/removed through the FS.
  createDirectory(): void { throw vscode.FileSystemError.NoPermissions(); }
  readDirectory(): [string, vscode.FileType][] { return []; }
  delete(): void { throw vscode.FileSystemError.NoPermissions(); }
  rename(): void { throw vscode.FileSystemError.NoPermissions(); }
}
