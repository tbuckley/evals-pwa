import { describe, test, expect } from 'vitest';
import { permuteLabeled } from './permuteLabeled';

const defaultLabel = Symbol('default');

function hasLabel(instance: { id?: string; labels?: string[] }, label: string | symbol) {
  if (typeof label === 'string') {
    return instance.labels?.includes(label) ?? false;
  }
  if (label === defaultLabel) {
    return instance.labels === undefined;
  }
  return false;
}

describe('permuteLabeled', {}, () => {
  test('returns the same array if no labels', {}, () => {
    const a = { labels: ['a'] };
    const b = { labels: ['b'] };
    expect(permuteLabeled(new Set(['a', 'b']), [a, b], hasLabel)).toStrictEqual([{ a, b }]);
  });

  test('ignores unused labels', {}, () => {
    const a = { labels: ['a'] };
    const b = { labels: ['b'] };
    const c = { labels: ['c'] };
    expect(permuteLabeled(new Set(['a', 'b']), [a, b, c], hasLabel)).toStrictEqual([{ a, b }]);
  });

  test('permutes all options', {}, () => {
    const a = { id: 'a', labels: ['a', 'b'] };
    const b = { id: 'b', labels: ['a', 'b'] };
    const c = { id: 'c', labels: ['b'] };
    const output = permuteLabeled(new Set(['a', 'b']), [a, b, c], hasLabel);
    expect(output).toEqual(
      expect.arrayContaining([
        { a: a, b: a },
        { a: a, b: b },
        { a: a, b: c },
        { a: b, b: a },
        { a: b, b: b },
        { a: b, b: c },
      ]),
    );
  });

  test('supports default label', {}, () => {
    const a = { id: 'a' };
    const b = { id: 'b', labels: ['b'] };
    const c = { id: 'c', labels: ['b'] };
    expect(permuteLabeled(new Set([defaultLabel, 'b']), [a, b, c], hasLabel)).toEqual(
      expect.arrayContaining([
        { [defaultLabel]: a, b: b },
        { [defaultLabel]: a, b: c },
      ]),
    );
  });

  test('throws if no instances for a label', {}, () => {
    const a = { id: 'a', labels: ['a'] };
    const b = { id: 'b', labels: ['a'] };
    expect(() => permuteLabeled(new Set(['a', 'b']), [a, b], hasLabel)).toThrow(
      'No instances found for label: b',
    );
  });
});
