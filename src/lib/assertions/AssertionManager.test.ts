import { describe, test, expect } from 'vitest';
import { AssertionManager } from './AssertionManager';
import { ProviderManager } from '$lib/providers/ProviderManager';
import type { CellAssertionProvider, RowAssertionProvider } from '$lib/types';

const DEFAULT_CONTEXT = { provider: { id: 'reverser:whatever' }, prompt: '{{ output }}' };

describe('AssertionManager', () => {
  test('substitutes variables', async function () {
    const mgr = createAssertionManager();
    const assertion = mgr.getAssertion(
      { type: 'contains', vars: { needle: '{{ target }}' } },
      { target: 'world' },
    ) as CellAssertionProvider;
    const res = await assertion.run(['Hello, world!'], DEFAULT_CONTEXT);
    expect(res.pass).toBe(true);

    const res2 = await assertion.run(['Hello, there!'], DEFAULT_CONTEXT);
    expect(res2.pass).toBe(false);
  });
  test('does not escape apostrophes', async function () {
    const mgr = createAssertionManager();
    const assertion = mgr.getAssertion(
      { type: 'contains', vars: { needle: '{{ target }}' } },
      { target: "all the world's people" },
    ) as CellAssertionProvider;
    const res = await assertion.run(["Hello, all the world's people!"], DEFAULT_CONTEXT);
    expect(res.pass).toBe(true);
  });

  test('supports case-insensitive contains', async function () {
    const mgr = createAssertionManager();
    const assertion = mgr.getAssertion(
      { type: 'contains', vars: { needle: 'THE WORLD', ignoreCase: true } },
      {},
    ) as CellAssertionProvider;
    const res = await assertion.run(["Hello, all the world's people!"], DEFAULT_CONTEXT);
    expect(res.pass).toBe(true);
  });
  test('supports equals with a string', async function () {
    const mgr = createAssertionManager();
    const assertion = mgr.getAssertion(
      { type: 'equals', vars: { value: 'Hello, world!' } },
      {},
    ) as CellAssertionProvider;
    const res1 = await assertion.run(['Hello, world!'], DEFAULT_CONTEXT);
    expect(res1.pass).toBe(true);

    const res2 = await assertion.run(['Hello!'], DEFAULT_CONTEXT);
    expect(res2.pass).toBe(false);
  });
  test('supports case-insensitive equals with a string', async function () {
    const mgr = createAssertionManager();
    const assertion = mgr.getAssertion(
      { type: 'equals', vars: { value: 'Hello, world!', ignoreCase: true } },
      {},
    ) as CellAssertionProvider;
    const res1 = await assertion.run(['hello, world!'], DEFAULT_CONTEXT);
    expect(res1.pass).toBe(true);

    const res2 = await assertion.run(['hello!'], DEFAULT_CONTEXT);
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
    ) as CellAssertionProvider;
    const res = await assertion.run(['olleh'], DEFAULT_CONTEXT);
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
          prompt: '} "{{ output }} {{ ./first }} :tuptuO" :"egassem" ,eurt :"ssap" {',
          provider: 'reverser:whatever',
        },
      },
      { first: 'ho' },
    ) as CellAssertionProvider;
    const res = await assertion.run(['olleh'], DEFAULT_CONTEXT);
    // expect(res.pass).toBe(true);
    expect(res.message).toBe('Output: oh hello');
  });

  test('supports select-best', async function () {
    const mgr = createAssertionManager();
    const assertion = mgr.getAssertion(
      {
        type: 'select-best',
        vars: {
          prompt: '2',
          criteria: 'DOES NOT MATTER',
          provider: 'echo:whatever',
        },
      },
      {},
    ) as RowAssertionProvider;
    const res = await assertion.run([{ output: 'The first' }, { output: 'The second' }], {
      prompts: ['', ''],
    });
    expect(res).toMatchInlineSnapshot(`
      [
        {
          "pass": false,
        },
        {
          "pass": false,
        },
        {
          "pass": true,
        },
      ]
    `);
  });

  test('supports consistency', async function () {
    const mgr = createAssertionManager();
    const assertion = mgr.getAssertion(
      {
        type: 'consistency',
        vars: {
          prompt:
            '{ "pass": true, "message": "{{criteria}} :: {{#each output}}{{ this }}{{/each}}" }',
          criteria: 'The best haiku about New York City',
          provider: 'echo:whatever',
        },
      },
      {},
    ) as RowAssertionProvider;
    const res = await assertion.run([{ output: ['Hello, world!'] }], { prompts: [''] });
    expect(res).toMatchInlineSnapshot(`
      [
        {
          "message": "The best haiku about New York City :: Hello, world!",
          "pass": true,
        },
      ]
    `);
  });
});

function createAssertionManager(): AssertionManager {
  const provider = new ProviderManager({});
  return new AssertionManager(provider, new AbortController().signal);
}
