import type {
  NormalizedConfig,
  NormalizedPipelineStep,
  NormalizedPrompt,
  NormalizedProvider,
  NormalizedTestCase,
} from '$lib/types';
import type { FsConfig, FsPipelinePrompt, FsPrompt, FsTestCase } from './types';
import yaml from 'yaml';

export function normalizeConfig(config: FsConfig): NormalizedConfig {
  return {
    description: config.description,
    providers: normalizeProviders(config.providers),
    prompts: normalizePrompts(config.prompts),
    tests: normalizeTestCases(config.tests, config.defaultTest),
    options: config.options,
  };
}

function normalizePrompts(prompts: FsConfig['prompts']): NormalizedPrompt[] {
  if (!prompts) {
    return [];
  }
  return prompts.map(normalizePrompt);
}

function normalizePrompt(prompt: FsPrompt): NormalizedPrompt {
  if (typeof prompt === 'string') {
    return prompt;
  }
  if (Array.isArray(prompt)) {
    // If it's a conversation, encode it as a yaml string
    return yaml.stringify(prompt);
  }
  if (typeof prompt === 'object' && 'prompt' in prompt) {
    return prompt;
  }
  return { $pipeline: prompt.$pipeline.map((step, index) => normalizePipelineStep(step, index)) };
}

function normalizePipelineStep(
  step: FsPipelinePrompt['$pipeline'][number],
  index: number,
): NormalizedPipelineStep {
  if (typeof step === 'string') {
    return {
      id: `step-${index}`,
      prompt: step,
    };
  }
  if (Array.isArray(step)) {
    return {
      id: `step-${index}`,
      prompt: yaml.stringify(step),
    };
  }
  return {
    id: `step-${index}`, // Provide a default ID
    ...step,
    prompt: Array.isArray(step.prompt) ? yaml.stringify(step.prompt) : step.prompt,
  };
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
  if (test.repeat !== undefined || defaultTest.repeat !== undefined) {
    result.repeat = test.repeat ?? defaultTest.repeat;
  }

  return result;
}
