import { describe, expect, test, afterEach } from 'vitest';
import * as CodeSandbox from './CodeSandbox';

describe('CodeSandbox', () => {
  afterEach(async () => {
    await CodeSandbox.clear();
  });
  test('can run code', async () => {
    const execute = CodeSandbox.bind('export function execute(a, b) { return a + b; }');

    const res = await execute(1, 2);
    expect(res).toBe(3);
  });

  test('supports module imports', async () => {
    const execute = CodeSandbox.bind(`
				import _ from 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/+esm';

				export function execute(arr) { return _.uniq(arr); }
			`);

    const res = await execute([1, 2, 1, 3, 2, 4]);
    expect(res).toEqual([1, 2, 3, 4]);
  });

  test('forwards any errors from the sandbox', async () => {
    const execute = CodeSandbox.bind(`
				export function execute(arr) { throw new Error('This is a test error'); }
			`);

    try {
      await execute('test');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain('This is a test error');
    }
  });

  test('errors if a function is reused after destroy', async () => {
    const execute = CodeSandbox.bind(`
				export function execute() { }
			`);
    await CodeSandbox.clear();

    try {
      await execute('test');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain('after destroy');
    }
  });
});
