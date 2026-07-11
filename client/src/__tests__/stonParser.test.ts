import { describe, it, expect } from 'vitest';
import {
  parseSton,
  renderStonForm,
  findScalarByPath,
  serializeScalarLiteral,
  friendlyClassName,
  isStonParseError,
  StonValue,
} from '../stonParser';

function ok(src: string): StonValue {
  const v = parseSton(src);
  if (isStonParseError(v)) throw new Error(`expected a parse, got error: ${v.error}`);
  return v;
}

describe('parseSton', () => {
  it('reads a class-tagged object with symbol keys and string values', () => {
    const v = ok("RwProjectSpecificationV3 {\n\t#packageFormat : 'tonel',\n\t#comment : ''\n}");

    expect(v).toMatchObject({ kind: 'object', className: 'RwProjectSpecificationV3' });
    if (v.kind !== 'object') throw new Error('not an object');
    expect(v.entries.map((e) => e.key)).toEqual(['packageFormat', 'comment']);
    expect(v.entries[0].value).toMatchObject({ kind: 'string', value: 'tonel' });
  });

  it('records the source range of a scalar value, quotes included', () => {
    const src = "Foo { #a : 'tonel' }";
    const v = ok(src);

    if (v.kind !== 'object') throw new Error('not an object');
    const value = v.entries[0].value;
    if (value.kind !== 'string') throw new Error('not a string');
    expect(src.slice(value.range[0], value.range[1])).toBe("'tonel'");
  });

  it('records the key range and the whole-entry range', () => {
    const src = "Foo { #packageFormat : 'tonel' }";
    const v = ok(src);

    if (v.kind !== 'object') throw new Error('not an object');
    const entry = v.entries[0];
    expect(src.slice(entry.keyRange[0], entry.keyRange[1])).toBe('#packageFormat');
    expect(src.slice(entry.range[0], entry.range[1])).toBe("#packageFormat : 'tonel'");
  });

  it('reads nested objects and string keys', () => {
    const v = ok("Spec { #platformProperties : { 'gemstone' : { #dict : 'UserGlobals' } } }");

    if (v.kind !== 'object') throw new Error('not an object');
    const props = v.entries[0].value;
    expect(props).toMatchObject({ kind: 'object', className: null });
    if (props.kind !== 'object') throw new Error('not an object');
    expect(props.entries[0]).toMatchObject({ key: 'gemstone', keyKind: 'string' });
  });

  it('reads arrays, including empty ones', () => {
    const v = ok("Comp { #packageNames : [ 'A-Core', 'A-Tests' ], #componentNames : [ ] }");

    if (v.kind !== 'object') throw new Error('not an object');
    expect(v.entries[0].value).toMatchObject({ kind: 'list' });
    expect((v.entries[0].value as { items: unknown[] }).items).toHaveLength(2);
    expect((v.entries[1].value as { items: unknown[] }).items).toHaveLength(0);
  });

  it('unescapes a doubled single quote inside a string', () => {
    const v = ok("Foo { #c : 'it''s here' }");

    if (v.kind !== 'object') throw new Error('not an object');
    expect(v.entries[0].value).toMatchObject({ kind: 'string', value: "it's here" });
  });

  it('reads numbers, booleans, and nil', () => {
    const v = ok('Foo { #n : 42, #b : true, #z : nil }');

    if (v.kind !== 'object') throw new Error('not an object');
    expect(v.entries.map((e) => e.value.kind)).toEqual(['number', 'boolean', 'nil']);
  });

  it('reports an error for malformed STON', () => {
    expect(isStonParseError(parseSton('Foo { #a : }'))).toBe(true);
    expect(isStonParseError(parseSton('Foo { #a : 1'))).toBe(true);
  });
});

describe('findScalarByPath', () => {
  it('resolves a top-level scalar', () => {
    const scalar = findScalarByPath(ok("Foo { #a : 'x' }"), ['a']);

    expect(scalar).toMatchObject({ kind: 'string', value: 'x' });
  });

  it('resolves a nested scalar through map keys', () => {
    const scalar = findScalarByPath(ok("Foo { #p : { 'g' : { #d : 'Globals' } } }"), ['p', 'g', 'd']);

    expect(scalar).toMatchObject({ value: 'Globals' });
  });

  it('returns undefined for a path that is not a scalar', () => {
    expect(findScalarByPath(ok("Foo { #p : { } }"), ['p'])).toBeUndefined();
    expect(findScalarByPath(ok("Foo { #a : 'x' }"), ['nope'])).toBeUndefined();
  });
});

describe('serializeScalarLiteral', () => {
  it('quotes and escapes strings', () => {
    expect(serializeScalarLiteral('string', 'tonel')).toBe("'tonel'");
    expect(serializeScalarLiteral('string', "it's")).toBe("'it''s'");
  });

  it('emits symbols, booleans, and numbers as literals', () => {
    expect(serializeScalarLiteral('symbol', 'foo')).toBe('#foo');
    expect(serializeScalarLiteral('boolean', 'true')).toBe('true');
    expect(serializeScalarLiteral('number', ' 42 ')).toBe('42');
  });
});

describe('friendlyClassName', () => {
  it('maps known Rowan classes to readable names', () => {
    expect(friendlyClassName('RwProjectSpecificationV3')).toBe('Project');
    expect(friendlyClassName('RwLoadSpecificationV2')).toBe('Load Specification');
    expect(friendlyClassName('RwLoadComponent')).toBe('Component');
  });

  it('de-camel-cases an unknown class, dropping the Rw prefix and version', () => {
    expect(friendlyClassName('RwSomeOtherThingV2')).toBe('Some Other Thing');
  });
});

describe('renderStonForm', () => {
  it('renders a scalar value as an input tagged with its path and file', () => {
    const html = renderStonForm(ok("Foo { #name : 'Bar' }"), 'file://x.ston');

    expect(html).toContain('ston-input');
    expect(html).toContain('data-path="[&quot;name&quot;]"');
    expect(html).toContain('data-file="file://x.ston"');
    expect(html).toContain('value="Bar"');
  });

  it('renders an enum key (packageFormat) as a dropdown of its options', () => {
    const html = renderStonForm(ok("RwProjectSpecificationV3 { #packageFormat : 'tonel' }"));

    expect(html).toContain('<select');
    expect(html).toContain('<option selected>tonel</option>');
    expect(html).toContain('<option>filetree</option>');
  });

  it('renders an open suggestions key as a typeable combobox, not a strict dropdown', () => {
    const html = renderStonForm(ok("Foo { #defaultSymbolDictName : 'MyOwnDict' }"));

    expect(html).toContain('list="ston-dl-defaultSymbolDictName"');
    expect(html).toContain('<datalist id="ston-dl-defaultSymbolDictName">');
    expect(html).toContain('value="MyOwnDict"');
    expect(html).not.toContain('<select');
  });

  it('adds an info tooltip for a documented key', () => {
    const html = renderStonForm(ok("RwProjectSpecificationV3 { #packageFormat : 'tonel' }"));

    expect(html).toContain('ston-help');
    expect(html).toContain('On-disk format for package source.');
  });

  it('escapes HTML so a value cannot inject markup', () => {
    const html = renderStonForm(ok("Foo { #x : '<b>hi' }"));

    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;hi');
  });

  it('renders an array as read-only chips', () => {
    const html = renderStonForm(ok("Foo { #names : [ 'Core' ] }"));

    expect(html).toContain('ston-chip');
    expect(html).toContain('Core');
  });

  it('lists available-but-unset keys with a Set affordance', () => {
    const html = renderStonForm(ok("RwProjectSpecificationV3 { #specName : 'project' }"));

    expect(html).toContain('Available');
    expect(html).toContain('ston-set');
    expect(html).toContain('data-key="packageFormat"');
  });

  it('marks a value that is at its default', () => {
    const html = renderStonForm(ok("RwProjectSpecificationV3 { #packageFormat : 'tonel' }"));

    expect(html).toContain('ston-tag');
  });

  it('flags a value that fails validation', () => {
    const html = renderStonForm(ok("RwProjectSpecificationV3 { #specName : 'nope' }"));

    expect(html).toContain('ston-row-warn');
    expect(html).toContain("must be 'project'");
  });

  it('flags a value the caller-supplied check reports as invalid', () => {
    const warn = (key: string) => (key === 'packagesPath' ? 'no such directory' : undefined);

    const html = renderStonForm(ok("RwProjectSpecificationV3 { #packagesPath : 'lib' }"), '', 'all', warn);

    expect(html).toContain('ston-row-warn');
    expect(html).toContain('no such directory');
  });

  it('prefers the built-in rule over the caller check when both would fire', () => {
    const warn = () => 'from the caller';

    const html = renderStonForm(ok("RwProjectSpecificationV3 { #specName : 'nope' }"), '', 'all', warn);

    expect(html).toContain("must be 'project'");
    expect(html).not.toContain('from the caller');
  });

  it('flags a required field that has been emptied', () => {
    const html = renderStonForm(ok("RwLoadSpecificationV2 { #projectName : '' }"));

    expect(html).toContain('ston-row-warn');
    expect(html).toContain('required');
  });

  it('flags a required field that is missing entirely in the available list', () => {
    const html = renderStonForm(ok("RwLoadSpecificationV2 { #revision : 'main' }"));

    expect(html).toContain('ston-required');
    expect(html).toContain('required — not set');
  });
});

describe('renderStonForm filters', () => {
  const proj = () => ok("RwProjectSpecificationV3 { #specName : 'project', #packageFormat : 'tonel', #comment : 'hi' }");

  it('"specified" shows set keys but omits the available-but-unset ones', () => {
    const html = renderStonForm(proj(), '', 'specified');

    expect(html).toContain('packageFormat');
    expect(html).not.toContain('Available');
    expect(html).not.toContain('ston-row-unset');
  });

  it('"different" hides values that equal their default', () => {
    const html = renderStonForm(proj(), '', 'different');

    expect(html).not.toContain('packageFormat');
    expect(html).toContain('comment');
  });

  it('"simplified" shows only the curated keys for the class', () => {
    const html = renderStonForm(proj(), '', 'simplified');

    expect(html).toContain('packageFormat');
    expect(html).not.toContain('specName');
  });
});
