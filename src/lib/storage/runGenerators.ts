import type { TestCase } from '$lib/types';
import { parseCSV } from '$lib/utils/csv';
import { getFileExtension } from '$lib/utils/path';
import { CodeReference, toCodeReference } from './CodeReference';
import { FileReference } from './FileReference';

interface Generator {
  '=gen': string | CodeReference;
  args?: unknown[];
}

function isGenerator(target: unknown): target is Generator {
  return typeof target === 'object' && target != null && '=gen' in target;
}

function hasKey(target: unknown, key: string): target is Record<string, unknown> {
  return typeof target === 'object' && target !== null && key in target;
}

function ensureArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export async function runGenerators(target: unknown) {
  const state = { changed: false };
  const result = await runGeneratorsImpl(target, state);
  return { result, changed: state.changed };
}

export async function runGeneratorsImpl(target: unknown, state: { changed: boolean }) {
  if (target == null) return target;
  if (typeof target !== 'object') {
    return target;
  }
  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      const value = target[i] as unknown;
      const result = await runGeneratorsImpl(value, state);
      if (isGenerator(value) || hasKey(value, '=gen-tests')) {
        // Flatten generated arrays into arrays.
        const results = ensureArray(result);
        target.splice(i, 1, ...results);
        i += results.length - 1;
      } else {
        target[i] = result;
      }
    }
    return target as unknown;
  }
  if (isGenerator(target)) {
    state.changed = true;
    const code = await toCodeReference(target['=gen']);
    const execute = await code.bind();
    const args = ensureArray(target.args);
    return await execute(...args);
  }

  // Check for built-in generators
  if (hasKey(target, '=gen-tests')) {
    state.changed = true;
    return generateTests(target['=gen-tests']);
  }

  for (const [key, value] of Object.entries(target)) {
    const result = await runGeneratorsImpl(value, state);
    Object.assign(target, { [key]: result });
    // Spread operator spreads objects or arrays of objects into the target.
    if (key === '...') {
      for (const props of Array.isArray(result) ? result : [result]) {
        Object.assign(target, props);
      }
      if ('...' in target) {
        delete target['...'];
      }
    }
  }
  return target;
}

async function generateTests(value: unknown): Promise<TestCase[]> {
  if (value instanceof FileReference && getFileExtension(value.uri) === 'csv') {
    const csv = await value.file.text();
    const data = parseCSV(csv);

    return data.map((row) => {
      const { __description: description, ...vars } = row;
      return {
        description,
        vars,
      };
    });
  }

  throw new Error('Unsupported value for =gen-tests');
}
