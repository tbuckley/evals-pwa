import type { TestCase } from '$lib/types';

export function getVarNamesForTests(tests: TestCase[]): string[] {
  const varNames: string[] = [];
  const seen = new Set<string>();
  for (const test of tests) {
    if (!test.vars) {
      continue;
    }
    for (const key of Object.keys(test.vars)) {
      if (!seen.has(key)) {
        seen.add(key);
        varNames.push(key);
      }
    }
  }
  return varNames;
}
