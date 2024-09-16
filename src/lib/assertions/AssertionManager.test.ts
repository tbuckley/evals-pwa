import { describe, test, expect } from 'vitest';
import { AssertionManager } from './AssertionManager';
import { ProviderManager } from '$lib/providers/ProviderManager';

describe('AssertionManager', () => {
  test('substitutes variables', async function () {
    const mgr = createAssertionManager();
    const assertion = mgr.getAssertion(
      { type: 'contains', vars: { needle: '{{ target }}' } },
      { target: 'world' },
    );
    const res = await assertion.run('Hello, world!');
    expect(res.pass).toBe(true);

    const res2 = await assertion.run('Hello, there!');
    expect(res2.pass).toBe(false);
  });
  test('does not escape apostrophes', async function () {
    const mgr = createAssertionManager();
    const assertion = mgr.getAssertion(
      { type: 'contains', vars: { needle: '{{ target }}' } },
      { target: "all the world's people" },
    );
    const res = await assertion.run("Hello, all the world's people!");
    expect(res.pass).toBe(true);
  });

  test('supports case-insensitive contains', async function () {
    const mgr = createAssertionManager();
    const assertion = mgr.getAssertion(
      { type: 'contains', vars: { needle: 'THE WORLD', ignoreCase: true } },
      {},
    );
    const res = await assertion.run("Hello, all the world's people!");
    expect(res.pass).toBe(true);
  });
  test('supports equals with a string', async function () {
    const mgr = createAssertionManager();
    const assertion = mgr.getAssertion({ type: 'equals', vars: { value: 'Hello, world!' } }, {});
    const res1 = await assertion.run('Hello, world!');
    expect(res1.pass).toBe(true);

    const res2 = await assertion.run('Hello!');
    expect(res2.pass).toBe(false);
  });
  test('supports case-insensitive equals with a string', async function () {
    const mgr = createAssertionManager();
    const assertion = mgr.getAssertion(
      { type: 'equals', vars: { value: 'Hello, world!', ignoreCase: true } },
      {},
    );
    const res1 = await assertion.run('hello, world!');
    expect(res1.pass).toBe(true);

    const res2 = await assertion.run('hello!');
    expect(res2.pass).toBe(false);
  });

  test('supports llm-rubric', async function () {
    const mgr = createAssertionManager();
    const assertion = mgr.getAssertion(
      {
        type: 'llm-rubric',
        vars: {
          rubric: 'THIS IS IGNORED BECAUSE {{ rubric }} IS NOT IN THE PROMPT',
          prompt: '} "{{ output }} :tuptuO" :"egassem" ,eurt :"ssap" {',
          provider: 'reverser:whatever',
        },
      },
      {},
    );
    const res = await assertion.run('olleh');
    // expect(res.pass).toBe(true);
    expect(res.message).toBe('Output: hello');
  });
  test('substitutes variables in llm-rubric', async function () {
    const mgr = createAssertionManager();
    const assertion = mgr.getAssertion(
      {
        type: 'llm-rubric',
        vars: {
          rubric: 'THIS IS IGNORED BECAUSE {{ rubric }} IS NOT IN THE PROMPT',
          prompt: '} "{{ output }} {{ first }} :tuptuO" :"egassem" ,eurt :"ssap" {',
          provider: 'reverser:whatever',
        },
      },
      { first: 'ho' },
    );
    const res = await assertion.run('olleh');
    // expect(res.pass).toBe(true);
    expect(res.message).toBe('Output: oh hello');
  });
});

function createAssertionManager(): AssertionManager {
  const provider = new ProviderManager({});
  return new AssertionManager(provider);
}
