import { describe, expect, test } from 'vitest';
import { CodeReference } from './CodeReference';
import type { ReadonlyFileStorage } from '$lib/types/storage';

async function load(files: Record<string, string>, entry: string) {
  const fs = {
    loadFile: (name: string) => new File([files[name]], name),
  } as unknown as ReadonlyFileStorage;
  return new CodeReference(entry, await fs.loadFile(entry), fs);
}

describe('CodeReference', () => {
  test('throws error when syntax is invalid', async () => {
    const ref = await load({ 'file:///test.ts': 'invalid(' }, 'file:///test.ts');
    await expect(ref.getCode()).rejects.toThrowError();
  });
});
