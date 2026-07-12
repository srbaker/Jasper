import { describe, it, expect } from 'vitest';
import { parseTonelClass, selectorFromPattern } from '../tonelReader';

// A representative `<Class>.class.st`: a leading comment, a Class header, and a
// mix of instance and class-side methods with categories.
const CLASS_ST = [
  '"',
  'I am a thing.',
  '"',
  'Class {',
  "\t#name : 'JasperThing',",
  "\t#superclass : 'Object',",
  "\t#instVars : [ 'ivar' ],",
  "\t#category : 'JasperThing-Core'",
  '}',
  '',
  "{ #category : 'accessing' }",
  'JasperThing >> ivar [',
  '\t^ ivar',
  ']',
  '',
  "{ #category : 'accessing' }",
  'JasperThing >> ivar: aValue [',
  '\tivar := aValue',
  ']',
  '',
  "{ #category : 'printing' }",
  'JasperThing class >> default [',
  '\t^ self new',
  ']',
].join('\n');

describe('parseTonelClass', () => {
  it('reads the class header — name, superclass, category, kind', () => {
    const cls = parseTonelClass(CLASS_ST);

    expect(cls).toMatchObject({
      name: 'JasperThing',
      superclass: 'Object',
      category: 'JasperThing-Core',
      kind: 'class',
    });
  });

  it('lists instance and class-side methods with their selectors and categories', () => {
    const cls = parseTonelClass(CLASS_ST);

    expect(cls.methods.map((m) => [m.selector, m.side, m.category])).toEqual([
      ['ivar', 'instance', 'accessing'],
      ['ivar:', 'instance', 'accessing'],
      ['default', 'class', 'printing'],
    ]);
  });

  it('exposes each method as the image sees it — selector pattern + body, no prefix or annotation', () => {
    const cls = parseTonelClass(CLASS_ST);

    expect(cls.methods[1].source).toBe('ivar: aValue\n\tivar := aValue');
  });

  it('records the on-disk line span of each method so a caller can slice it out', () => {
    const cls = parseTonelClass(CLASS_ST);

    expect(cls.methods[0]).toMatchObject({ annotationLine: 10, signatureLine: 11, closingLine: 13 });
    expect(cls.methods[2]).toMatchObject({ annotationLine: 20, signatureLine: 21, closingLine: 23 });
  });

  it('treats an Extension file as extending its named class', () => {
    const ext = parseTonelClass(
      ["Extension { #name : 'Object' }", '', "{ #category : '*JasperThing' }", 'Object >> asThing [', '\t^ self', ']'].join('\n'),
    );

    expect(ext.kind).toBe('extension');
    expect(ext.name).toBe('Object');
    expect(ext.methods.map((m) => m.selector)).toEqual(['asThing']);
  });

  it('counts brackets past strings and comments so a body with ] inside survives', () => {
    const cls = parseTonelClass(
      ['Class { #name : \'X\' }', '', 'X >> weird [', "\t^ '] not a close'", '\t\"nor ] this\"', ']'].join('\n'),
    );

    expect(cls.methods).toHaveLength(1);
    expect(cls.methods[0].closingLine).toBe(5);
  });
});

describe('selectorFromPattern', () => {
  it('returns a unary selector unchanged', () => {
    expect(selectorFromPattern('bar')).toBe('bar');
  });

  it('extracts a binary operator', () => {
    expect(selectorFromPattern('<= other')).toBe('<=');
  });

  it('joins keyword parts, dropping the argument names', () => {
    expect(selectorFromPattern('at: aKey put: aValue')).toBe('at:put:');
  });
});
