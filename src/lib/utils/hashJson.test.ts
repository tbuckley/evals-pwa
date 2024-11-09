import { describe, it, expect } from 'vitest';
import { hashJson } from './hashJson';

describe('hashJson', () => {
  it('provides the same hash for the same object', async () => {
    const hash1 = await hashJson({ a: 1, b: 2 });
    const hash2 = await hashJson({ a: 1, b: 2 });
    expect(hash1).toEqual(hash2);
  });

  it('provides the same hash for the same object with different order', async () => {
    const hash1 = await hashJson({ a: 1, b: 2 });
    const hash2 = await hashJson({ b: 2, a: 1 });
    expect(hash1).toEqual(hash2);
  });

  it('supports nested objects', async () => {
    const hash1 = await hashJson({ a: 1, b: { c: 3, d: [true, 'asdf'] } });
    const hash2 = await hashJson({ b: { d: [true, 'asdf'], c: 3 }, a: 1 });
    expect(hash1).toEqual(hash2);
  });

  it('provides different hashes for different objects', async () => {
    let hash1: string, hash2: string;

    hash1 = await hashJson({ a: 1, b: 2 });
    hash2 = await hashJson({ a: 1, b: '2' });
    expect(hash1).not.toEqual(hash2);

    hash1 = await hashJson({ a: 1, b: 2 });
    hash2 = await hashJson({ a: 1 });
    expect(hash1).not.toEqual(hash2);
  });
});
