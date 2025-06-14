import { describe, test, expect } from 'vitest';
import { createRegexAssertion } from './regex';

const DEFAULT_CONTEXT = {
  provider: { id: 'reverser:whatever' },
  prompt: { prompt: '{{ output }}' },
};

describe('createRegexAssertion', () => {
  test('tests against a regex pattern', async function () {
    const assertion = createRegexAssertion({ pattern: 'Hello, .+!' });
    const res1 = await assertion.run(['Hello, world!'], DEFAULT_CONTEXT);
    expect(res1.pass).toBe(true);

    const res2 = await assertion.run(['Hello!'], DEFAULT_CONTEXT);
    expect(res2.pass).toBe(false);
  });
  test('supports case-insensitive flags', async function () {
    const assertion = createRegexAssertion({ pattern: 'Hello, .+!', flags: 'i' });
    const res1 = await assertion.run(['hello, world!'], DEFAULT_CONTEXT);
    expect(res1.pass).toBe(true);
  });
});
