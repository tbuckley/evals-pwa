import { LLM_RUBRIC_PROMPT } from '$lib/prompts';
import type { ProviderManager } from '$lib/providers/ProviderManager';
import {
	assertionResultSchema,
	providerSchema,
	type AssertionProvider,
	type AssertionResult
} from '$lib/types';
import { extractAllJsonObjects } from '$lib/utils/extractAllJson';
import { HandlebarsPromptFormatter } from '$lib/utils/HandlebarsPromptFormatter';
import { SimpleEnvironment } from '$lib/utils/SimpleEnvironment';
import { z } from 'zod';

export const DEFAULT_LLM_RUBRIC_PROVIDER = 'gemini:gemini-1.5-pro-latest';

const argsSchema = z.object({
	rubric: z.string(),
	prompt: z.string().optional(),
	provider: providerSchema
});

export function createLlmRubricAssertion(
	args: unknown,
	providerManager: ProviderManager
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
		prompt: new HandlebarsPromptFormatter(prompt ?? LLM_RUBRIC_PROMPT)
	});

	return {
		run: async function (output: string): Promise<AssertionResult> {
			const result = await env.run({ output, rubric });
			const rubricOutput = result.output;
			if (!rubricOutput) {
				return {
					pass: false,
					message: `Rubric did not succeed: ${result.error ?? 'No error message'}`
				};
			}

			const objs = extractAllJsonObjects(rubricOutput);
			try {
				const validated = assertionResultSchema.parse(objs[0]);
				return validated;
			} catch {
				return {
					pass: false,
					message: `Invalid rubric output: "${rubricOutput}"`
				};
			}
		}
	};
}
