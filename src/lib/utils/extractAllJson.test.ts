import { describe, expect, test } from 'vitest';
import { extractAllJsonObjects } from './extractAllJson';

describe('extractAllJson', () => {
  test('extracts json from a string', function () {
    const res = extractAllJsonObjects('{"hello": "world"}');
    expect(res).toEqual([{ hello: 'world' }]);
  });
  test('extracts json from a markdown block', function () {
    const res = extractAllJsonObjects('This is some json:\n```json\n{"hello": "world"}\n```');
    expect(res).toEqual([{ hello: 'world' }]);
  });
  test('extracts multiple objects', function () {
    const res = extractAllJsonObjects('{"hello": "world"} and {"goodbye": "world"}');
    expect(res).toEqual([{ hello: 'world' }, { goodbye: 'world' }]);
  });
  test('handles braces in strings', function () {
    const res = extractAllJsonObjects('{"{hello}": "{world}"}');
    expect(res).toEqual([{ '{hello}': '{world}' }]);
  });
});
