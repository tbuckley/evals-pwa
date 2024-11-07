import { LLM_RUBRIC_PROMPT } from '$lib/prompts';
import type { ProviderManager } from '$lib/providers/ProviderManager';
import {
  assertionResultSchema,
  providerSchema,
  type AssertionProvider,
  type AssertionResult,
  type NormalizedTestCase,
  type TestOutput,
  type TestResult,
} from '$lib/types';
import { extractAllJsonObjects } from '$lib/utils/extractAllJson';
import { HandlebarsPromptFormatter } from '$lib/utils/HandlebarsPromptFormatter';
import { SimpleEnvironment } from '$lib/utils/SimpleEnvironment';
import { z } from 'zod';

export const DEFAULT_LLM_RUBRIC_PROVIDER = 'gemini:gemini-1.5-pro-latest';

const argsSchema = z.object({
  rubric: z.string(),
  prompt: z.string().optional(),
  provider: providerSchema.optional(),
});

export function createLlmRubricAssertion(
  args: unknown,
  testVars: NormalizedTestCase['vars'],
  providerManager: ProviderManager,
  abortSignal: AbortSignal,
): AssertionProvider {
  const parsedArgs = argsSchema.safeParse(args);
  if (!parsedArgs.success) {
    throw new Error('Invalid LLM Rubric arguments');
  }

  const { rubric, prompt, provider: providerOptions } = parsedArgs.data;
  const provider =
    typeof providerOptions === 'string'
      ? { id: providerOptions, config: {} }
      : (providerOptions ?? { id: DEFAULT_LLM_RUBRIC_PROVIDER, config: {} });
  const model = providerManager.getProvider(provider.id, provider.config);
  const env = new SimpleEnvironment({
    model,
    promptFormatter: new HandlebarsPromptFormatter(prompt ?? LLM_RUBRIC_PROMPT),
  });
  // TODO also populate placeholders in the rubric
  // TODO make rubric optional if prompt is provided

  return {
    run: async function (output: NonNullable<TestResult['output']>): Promise<AssertionResult> {
      if (!Array.isArray(output)) {
        output = [output];
      }
      const generator = env.run({ output, rubric, ...testVars }, { abortSignal });
      let next;
      while (!next?.done) {
        // Skip over the streaming responses.
        next = await generator.next();
      }
      const result = next.value;
      const rubricOutput = extractOutputAsString(result.output);
      if (!rubricOutput) {
        return {
          pass: false,
          message: `Rubric did not succeed: ${result.error ?? 'No error message'}`,
        };
      }

      const objs = extractAllJsonObjects(rubricOutput);
      try {
        const validated = assertionResultSchema.parse(objs[0]);
        return validated;
      } catch {
        return {
          pass: false,
          message: `Invalid rubric output: "${rubricOutput}"`,
        };
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
