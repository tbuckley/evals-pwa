import { describe, test, expect } from 'vitest';
import { orderedMerge } from './orderedMerge';

describe('orderedMerge', () => {
  test('merges two sorted arrays', {}, function () {
    const a = [1, 3, 5];
    const b = [2, 4, 6];
    expect(orderedMerge(a, b, (a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('removes initial duplicates', {}, function () {
    const a = [1, 2, 3, 4];
    const b = [1, 2, 5, 6];
    expect(orderedMerge(a, b, (a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('is commutative', {}, function () {
    const a = [1, 2, 3, 5];
    const b = [1, 2, 4, 6];
    expect(orderedMerge(a, b, (a, b) => a - b)).toEqual(orderedMerge(b, a, (a, b) => a - b));
  });

  test('is idempotent', {}, function () {
    const a = [1, 2, 3, 5];
    const b = [2, 3, 4, 6];
    const mergeFn = (a: number, b: number) => a - b;
    expect(orderedMerge(a, orderedMerge(a, b, mergeFn), mergeFn)).toEqual(
      orderedMerge(a, b, mergeFn),
    );
  });
});
