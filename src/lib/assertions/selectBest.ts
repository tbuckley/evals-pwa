import { DEFAULT_LLM_ASSERTION_PROVIDER, SELECT_BEST_PROMPT } from '$lib/prompts';
import type { ProviderManager } from '$lib/providers/ProviderManager';
import {
  providerSchema,
  type AssertionResult,
  type RowAssertionProvider,
  type NormalizedTestCase,
  type TestOutput,
} from '$lib/types';
import { extractAllJsonObjects } from '$lib/utils/extractAllJson';
import { SimpleEnvironment } from '$lib/utils/SimpleEnvironment';
import { z } from 'zod';

const argsSchema = z.object({
  prompt: z.string().optional(),
  provider: providerSchema.optional(),
});

export function createSelectBestAssertion(
  args: unknown,
  testVars: NormalizedTestCase['vars'],
  providerManager: ProviderManager,
  abortSignal: AbortSignal,
): RowAssertionProvider {
  const parsedArgs = argsSchema.safeParse(args);
  if (!parsedArgs.success) {
    throw new Error('Invalid select best arguments');
  }

  const { prompt, provider: providerOptions } = parsedArgs.data;
  const provider =
    typeof providerOptions === 'string'
      ? { id: providerOptions, config: {} }
      : (providerOptions ?? { id: DEFAULT_LLM_ASSERTION_PROVIDER, config: {} });
  const model = providerManager.getProvider(provider.id, provider.config);
  const env = new SimpleEnvironment({
    model,
    prompt: prompt ?? SELECT_BEST_PROMPT,
  });

  return {
    type: 'row',
    run: async function (outputs: TestOutput[]): Promise<AssertionResult[]> {
      const { criteria, ...rest } = testVars as { criteria: unknown };
      const generator = env.run({ outputs, criteria, ...rest }, { abortSignal });
      let next;
      while (!next?.done) {
        // Skip over the streaming responses.
        next = await generator.next();
      }
      const result = next.value;
      const selectBestOutput = extractOutputAsString(result.output);
      if (!selectBestOutput) {
        throw new Error(`Select best did not succeed: ${result.error ?? 'No error message'}`);
      }

      const objs = extractAllJsonObjects(selectBestOutput);
      const chosen = z.array(z.number().int()).parse(objs[0]);

      const results: AssertionResult[] = outputs.map(() => ({
        pass: false,
        message: 'Not chosen',
      }));
      for (const index of chosen) {
        results[index] = {
          pass: true,
          message: 'Chosen',
        };
      }
      return results;
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
