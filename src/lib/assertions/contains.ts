import type { AssertionProvider, AssertionResult } from '$lib/types';
import { z } from 'zod';

const argsSchema = z.object({
	needle: z.string(),
	ignoreCase: z.boolean().optional()
});

export function createContainsAssertion(args: unknown): AssertionProvider {
	const parsedArgs = argsSchema.safeParse(args);
	if (!parsedArgs.success) {
		throw new Error('Invalid icontains arguments');
	}

	const { needle, ignoreCase } = parsedArgs.data;
	const needleValue = ignoreCase ? needle.toLocaleLowerCase() : needle;
	return {
		run: function (output: string): AssertionResult {
			const outputValue = ignoreCase ? output.toLocaleLowerCase() : output;
			const pass = outputValue.includes(needleValue);
			return {
				pass,
				message: pass ? undefined : `Does not contain: "${needle}"`
			};
		}
	};
}
