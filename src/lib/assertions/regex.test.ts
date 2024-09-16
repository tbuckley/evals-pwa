import { describe, test, expect } from 'vitest';
import { createRegexAssertion } from './regex';

describe('createRegexAssertion', () => {
  test('tests against a regex pattern', async function () {
    const assertion = createRegexAssertion({ pattern: 'Hello, .+!' });
    const res1 = await assertion.run('Hello, world!');
    expect(res1.pass).toBe(true);

    const res2 = await assertion.run('Hello!');
    expect(res2.pass).toBe(false);
  });
  test('supports case-insensitive flags', async function () {
    const assertion = createRegexAssertion({ pattern: 'Hello, .+!', flags: 'i' });
    const res1 = await assertion.run('hello, world!');
    expect(res1.pass).toBe(true);
  });
});
