import type { AssertionProvider, AssertionResult } from '$lib/types';
import { z } from 'zod';

const argsSchema = z.object({
	value: z.string(),
	ignoreCase: z.boolean().optional()
});

export function createEqualsAssertion(args: unknown): AssertionProvider {
	const parsedArgs = argsSchema.safeParse(args);
	if (!parsedArgs.success) {
		throw new Error('Invalid regex arguments');
	}

	const { value, ignoreCase } = parsedArgs.data;
	const groundTruth = ignoreCase ? value.toLocaleLowerCase() : value;
	return {
		run: function (output: string): AssertionResult {
			const outputValue = ignoreCase ? output.toLocaleLowerCase() : output;
			const pass = outputValue === groundTruth;
			return {
				pass,
				message: pass ? undefined : `Does not equal: "${value}"`
			};
		}
	};
}
