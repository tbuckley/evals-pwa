import { CONSISTENCY_PROMPT, DEFAULT_LLM_ASSERTION_PROVIDER } from '$lib/prompts';
import type { ProviderManager } from '$lib/providers/ProviderManager';
import {
  assertionResultSchema,
  providerSchema,
  type AssertionResult,
  type NormalizedTestCase,
  type RowAssertionProvider,
  type TestOutput,
} from '$lib/types';
import { extractAllJsonObjects } from '$lib/utils/extractAllJson';
import { PipelineEnvironment } from '$lib/utils/PipelineEnvironment';
import { makeSingleStepPipeline } from '$lib/utils/pipelinePrompt';
import { z } from 'zod';
import { CodeReference } from '$lib/storage/CodeReference';

const argsSchema = z.object({
  criteria: z.string(),
  prompt: z.string().optional(),
  provider: providerSchema.optional(),
});

export function createConsistencyAssertion(
  args: unknown,
  testVars: NormalizedTestCase['vars'],
  providerManager: ProviderManager,
  abortSignal: AbortSignal,
): RowAssertionProvider {
  const parsedArgs = argsSchema.safeParse(args);
  if (!parsedArgs.success) {
    throw new Error('Invalid LLM Rubric arguments');
  }

  const { criteria, prompt, provider: providerOptions } = parsedArgs.data;
  const provider =
    providerOptions instanceof CodeReference
      ? { id: providerOptions, config: {} }
      : typeof providerOptions === 'string'
        ? { id: providerOptions, config: {} }
        : (providerOptions ?? { id: DEFAULT_LLM_ASSERTION_PROVIDER, config: {} });
  const model = providerManager.getProvider(provider.id, provider.config);
  const env = new PipelineEnvironment({
    models: { default: model },
    pipeline: makeSingleStepPipeline(prompt ?? CONSISTENCY_PROMPT),
  });
  // TODO also populate placeholders in the rubric
  // TODO make rubric optional if prompt is provided

  return {
    type: 'row',
    run: async function (results, _context): Promise<AssertionResult[]> {
      const output = results.map((r) => {
        if (!r.output) {
          // TODO ignore these indices in the evaluation
          return [];
        }
        if (!Array.isArray(r.output)) {
          return [r.output];
        }
        return r.output;
      });

      const generator = env.run({ output, criteria, ...testVars }, { abortSignal });
      let next;
      while (!next?.done) {
        // Skip over the streaming responses.
        next = await generator.next();
      }
      const result = next.value;
      const rubricOutput = extractOutputAsString(result.output);
      // If there's no output, return an array of failures
      if (!rubricOutput) {
        const res = {
          pass: false,
          message: `Rubric did not succeed: ${result.error ?? 'No error message'}`,
        } satisfies AssertionResult;
        return Array(results.length).fill(res) as AssertionResult[];
      }

      const objs = extractAllJsonObjects(rubricOutput);
      try {
        const validated = assertionResultSchema.parse(objs[0]);
        return Array(results.length).fill(validated) as AssertionResult[];
      } catch {
        return Array(results.length).fill({
          pass: false,
          message: `Invalid rubric output: "${rubricOutput}"`,
        }) as AssertionResult[];
      }
    },
  };
}

function extractOutputAsString(output: TestOutput['output']): string | undefined {
  if (!output) {
    return undefined;
  }
  if (typeof output === 'string') {
    return output;
  }

  // It's an array
  const strings = output.filter((val): val is string => typeof val === 'string');
  if (strings.length === 0) {
    return undefined;
  }
  return strings.join(' '); // Just concatenate all strings
}
