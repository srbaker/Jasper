import { describe, it, expect } from 'vitest';
import { availableKeys, validateKey, keyDoc, isRequiredKey } from '../stonKeyDocs';

describe('availableKeys', () => {
  it('lists the keys a project spec may carry', () => {
    const keys = availableKeys('RwProjectSpecificationV3');

    expect(keys).toContain('packageFormat');
    expect(keys).toContain('packagesPath');
    expect(keys).toContain('comment');
  });

  it('is empty for an unknown class', () => {
    expect(availableKeys('SomethingElse')).toEqual([]);
    expect(availableKeys(null)).toEqual([]);
  });
});

describe('validateKey', () => {
  it("warns when project.ston's specName is not 'project'", () => {
    expect(validateKey('RwProjectSpecificationV3', 'specName', 'project')).toBeUndefined();
    expect(validateKey('RwProjectSpecificationV3', 'specName', 'MyApp')).toMatch(/must be 'project'/);
  });

  it('does not impose that rule on a load spec', () => {
    expect(validateKey('RwLoadSpecificationV2', 'specName', 'MyApp')).toBeUndefined();
  });

  it('warns when an enum-valued key is off its allowed set', () => {
    expect(validateKey('RwProjectSpecificationV3', 'packageFormat', 'tonel')).toBeUndefined();
    expect(validateKey('RwProjectSpecificationV3', 'packageFormat', 'xml')).toMatch(/Must be one of/);
  });

  it('warns when a required field is left empty', () => {
    expect(validateKey('RwLoadSpecificationV2', 'projectName', '')).toMatch(/required/);
    expect(validateKey('RwLoadComponent', 'name', '   ')).toMatch(/required/);
  });

  it('accepts a required field that has a value', () => {
    expect(validateKey('RwLoadSpecificationV2', 'projectName', 'MyApp')).toBeUndefined();
  });
});

describe('isRequiredKey', () => {
  it('marks the load-defining keys of each spec as required', () => {
    expect(isRequiredKey('RwLoadSpecificationV2', 'projectName')).toBe(true);
    expect(isRequiredKey('RwLoadComponent', 'name')).toBe(true);
    expect(isRequiredKey('RwProjectSpecificationV3', 'specName')).toBe(true);
  });

  it('does not treat optional keys, or an unknown class, as required', () => {
    expect(isRequiredKey('RwLoadSpecificationV2', 'revision')).toBe(false);
    expect(isRequiredKey(null, 'projectName')).toBe(false);
  });
});

describe('keyDoc', () => {
  it('carries a default for keys that have one', () => {
    expect(keyDoc('packageFormat')?.default).toBe('tonel');
    expect(keyDoc('packageConvention')?.default).toBe('RowanHybrid');
  });
});
