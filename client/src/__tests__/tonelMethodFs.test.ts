import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => import('../__mocks__/vscode'));

import { readMethodSource, spliceMethodSource, buildTonelMethodUri, parseTonelMethodUri } from '../tonelMethodFs';

const THING_CLASS = [
  "Class { #name : 'Thing', #superclass : 'Object', #category : 'Pkg-Core' }",
  '',
  "{ #category : 'accessing' }",
  'Thing >> value [',
  '\t^ 42',
  ']',
  '',
  "{ #category : 'instance creation' }",
  'Thing class >> named: aName [',
  '\t^ self new',
  ']',
].join('\n');

describe('readMethodSource', () => {
  it('returns a method as the image sees it — pattern + body, no prefix or annotation', () => {
    expect(readMethodSource(THING_CLASS, 'instance', 'value')).toBe('value\n\t^ 42');
    expect(readMethodSource(THING_CLASS, 'class', 'named:')).toBe('named: aName\n\t^ self new');
  });

  it('returns undefined when the class no longer holds the method', () => {
    expect(readMethodSource(THING_CLASS, 'instance', 'gone')).toBeUndefined();
    expect(readMethodSource(THING_CLASS, 'class', 'value')).toBeUndefined();
  });
});

describe('spliceMethodSource', () => {
  it('replaces the method body in place, preserving its category and the other methods', () => {
    const next = spliceMethodSource(THING_CLASS, 'Thing', 'instance', 'value', 'value\n\t^ 43');

    expect(readMethodSource(next, 'instance', 'value')).toBe('value\n\t^ 43');
    // Category annotation kept.
    expect(next).toContain("{ #category : 'accessing' }");
    // The class-side method is untouched.
    expect(readMethodSource(next, 'class', 'named:')).toBe('named: aName\n\t^ self new');
  });

  it('rewrites a class-side method with the correct `class >>` signature', () => {
    const next = spliceMethodSource(THING_CLASS, 'Thing', 'class', 'named:', 'named: aName\n\t^ super new');

    expect(next).toContain('Thing class >> named: aName [');
    expect(readMethodSource(next, 'class', 'named:')).toBe('named: aName\n\t^ super new');
  });

  it('supports a multi-line edited body', () => {
    const next = spliceMethodSource(THING_CLASS, 'Thing', 'instance', 'value', 'value\n\tivar isNil ifTrue: [ ^ 0 ].\n\t^ ivar');

    expect(readMethodSource(next, 'instance', 'value')).toBe('value\n\tivar isNil ifTrue: [ ^ 0 ].\n\t^ ivar');
  });

  it('throws when the method is not in the file', () => {
    expect(() => spliceMethodSource(THING_CLASS, 'Thing', 'instance', 'gone', 'gone\n^ 1')).toThrow();
  });
});

describe('tonel-method URI round-trip', () => {
  it('recovers the file, side, and selector — even for an awkward selector', () => {
    const uri = buildTonelMethodUri('/proj/src/Pkg/Thing.class.st', 'class', 'at:put:');

    expect(parseTonelMethodUri(uri)).toEqual({
      file: '/proj/src/Pkg/Thing.class.st',
      side: 'class',
      selector: 'at:put:',
    });
  });

  it('survives a binary selector containing a slash', () => {
    const uri = buildTonelMethodUri('/proj/src/Pkg/Fraction.class.st', 'instance', '/');

    expect(parseTonelMethodUri(uri).selector).toBe('/');
  });
});
