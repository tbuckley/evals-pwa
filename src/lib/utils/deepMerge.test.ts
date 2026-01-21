import { describe, it, expect } from 'vitest';
import { deepMerge } from './deepMerge';

describe('deepMerge', () => {
  it('should merge two objects', () => {
    const a = { a: 1, b: 2 };
    const b = { c: 3, d: 4 };
    const result = deepMerge(a, b);
    expect(result).toEqual({ a: 1, b: 2, c: 3, d: 4 });
  });

  it('should use the second value where they diverge', () => {
    const a = { a: 1, b: 2, c: [1, 2, 3] };
    const b = { b: 3, c: [4, 5, 6], d: 4 };
    const result = deepMerge(a, b);
    expect(result).toEqual({ a: 1, b: 3, c: [4, 5, 6], d: 4 });
  });

  it('should deep-merge objects', () => {
    const a = { a: 1, b: { c: 2 } };
    const b = { b: { d: 3 } };
    const result = deepMerge(a, b);
    expect(result).toEqual({ a: 1, b: { c: 2, d: 3 } });
  });

  it('should delete for null values', () => {
    const a = { a: 1, b: { c: 2 }, d: { foo: 'bar' } };
    const b = { b: { c: null, e: 3 }, d: null };
    const result = deepMerge(a, b);
    expect(result).toEqual({ a: 1, b: { e: 3 } });
  });
});
