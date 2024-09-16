import { describe, it, expect } from 'vitest';
import { matchesMimeType } from './media';

describe('matchesMimeType', () => {
  it('should return true for the same mime type', () => {
    expect(matchesMimeType('image/png', 'image/png')).toBe(true);
    expect(matchesMimeType('image/png', 'text/plain')).toBe(false);
  });
  it('should return true for */*', () => {
    expect(matchesMimeType('*/*', 'image/png')).toBe(true);
    expect(matchesMimeType('*/*', 'text/plain')).toBe(true);
    expect(matchesMimeType('*/*', '')).toBe(true);
  });
  it('should return true for partial matches', () => {
    expect(matchesMimeType('image/*', 'image/png')).toBe(true);
    expect(matchesMimeType('image/*', 'image/jpeg')).toBe(true);
    expect(matchesMimeType('image/*', 'text/plain')).toBe(false);
  });
});
