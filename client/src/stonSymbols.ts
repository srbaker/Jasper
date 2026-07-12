import * as vscode from 'vscode';
import { parseSton, isStonParseError, friendlyClassName, StonValue, StonEntry, StonScalar } from './stonParser';

// Outline / breadcrumbs / Go-to-Symbol for .ston files: the spec's keys become a
// navigable tree — scalars show their value, arrays their length (with items
// nested), nested maps their friendly class. Drives the Outline view when a
// .ston is open as text (the settings editor is a webview, so switch to text to
// use it).
export class StonSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const parsed = parseSton(document.getText());
    if (isStonParseError(parsed) || parsed.kind !== 'object') return [];
    return parsed.entries.map((e) => entrySymbol(e, document));
  }
}

function entrySymbol(entry: StonEntry, doc: vscode.TextDocument): vscode.DocumentSymbol {
  const range = span(doc, entry.range);
  const selection = span(doc, entry.keyRange);
  const v = entry.value;
  if (v.kind === 'object') {
    const sym = new vscode.DocumentSymbol(
      entry.key,
      v.className ? friendlyClassName(v.className) : '',
      vscode.SymbolKind.Object,
      range,
      selection,
    );
    sym.children = v.entries.map((e) => entrySymbol(e, doc));
    return sym;
  }
  if (v.kind === 'list') {
    const sym = new vscode.DocumentSymbol(
      entry.key,
      `${v.items.length} item${v.items.length === 1 ? '' : 's'}`,
      vscode.SymbolKind.Array,
      range,
      selection,
    );
    sym.children = v.items.map((it, i) => itemSymbol(it, i, doc));
    return sym;
  }
  return new vscode.DocumentSymbol(entry.key, scalarLabel(v), scalarKind(v), range, selection);
}

function itemSymbol(item: StonValue, index: number, doc: vscode.TextDocument): vscode.DocumentSymbol {
  const range = span(doc, item.range);
  if (item.kind === 'object') {
    const sym = new vscode.DocumentSymbol(
      item.className ? friendlyClassName(item.className) : `[${index}]`,
      '',
      vscode.SymbolKind.Object,
      range,
      range,
    );
    sym.children = item.entries.map((e) => entrySymbol(e, doc));
    return sym;
  }
  if (item.kind === 'list') {
    const sym = new vscode.DocumentSymbol(`[${index}]`, `${item.items.length} items`, vscode.SymbolKind.Array, range, range);
    sym.children = item.items.map((it, i) => itemSymbol(it, i, doc));
    return sym;
  }
  return new vscode.DocumentSymbol(scalarLabel(item), '', scalarKind(item), range, range);
}

function span(doc: vscode.TextDocument, [start, end]: [number, number]): vscode.Range {
  return new vscode.Range(doc.positionAt(start), doc.positionAt(end));
}

function scalarLabel(s: StonScalar): string {
  return s.kind === 'symbol' ? `#${s.value}` : s.value;
}

function scalarKind(s: StonScalar): vscode.SymbolKind {
  switch (s.kind) {
    case 'string': return vscode.SymbolKind.String;
    case 'symbol': return vscode.SymbolKind.EnumMember;
    case 'number': return vscode.SymbolKind.Number;
    case 'boolean': return vscode.SymbolKind.Boolean;
    case 'nil': return vscode.SymbolKind.Null;
  }
}
