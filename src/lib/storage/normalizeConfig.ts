import type { NormalizedConfig, NormalizedProvider, NormalizedTestCase } from '$lib/types';
import type { FsConfig, FsTestCase } from './types';

export function normalizeConfig(config: FsConfig): NormalizedConfig {
  return {
    description: config.description,
    providers: normalizeProviders(config.providers),
    prompts: normalizePrompts(config.prompts),
    tests: normalizeTestCases(config.tests, config.defaultTest),
  };
}

function normalizePrompts(prompts: FsConfig['prompts']): string[] {
  if (!prompts) {
    return [];
  }
  return prompts;
}

function normalizeProviders(providers: FsConfig['providers']): NormalizedProvider[] {
  if (!providers) {
    return [];
  }

  const normalized: NormalizedProvider[] = [];
  for (const provider of providers) {
    if (typeof provider === 'string') {
      normalized.push({ id: provider });
    } else {
      normalized.push(provider);
    }
  }
  return normalized;
}

function normalizeTestCases(
  tests: FsConfig['tests'],
  defaultTest: FsConfig['defaultTest'],
): NormalizedTestCase[] {
  if (!tests) {
    return [{ vars: {}, assert: [] }];
  }
  return tests.map((test) => normalizeTestCase(test, defaultTest ?? {}));
}

function normalizeTestCase(test: FsTestCase, defaultTest: Partial<FsTestCase>): NormalizedTestCase {
  const vars: NormalizedTestCase['vars'] = {
    ...(defaultTest.vars ?? {}),
    ...(test.vars ?? {}),
  };
  const assert: NormalizedTestCase['assert'] = [
    ...(defaultTest.assert ?? []),
    ...(test.assert ?? []),
  ].map((assert) => ({ ...assert, vars: assert.vars ?? {} }));

  const result: NormalizedTestCase = {
    description: test.description ?? defaultTest.description,
    vars,
    assert,
  };

  if (test.only !== undefined) {
    result.only = test.only;
  }

  return result;
}
