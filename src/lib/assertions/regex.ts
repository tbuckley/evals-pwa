import type { AssertionProvider, AssertionResult } from '$lib/types';
import { z } from 'zod';

const argsSchema = z.object({
	pattern: z.string(),
	flags: z.string().optional()
});

export function createRegexAssertion(args: unknown): AssertionProvider {
	const parsedArgs = argsSchema.safeParse(args);
	if (!parsedArgs.success) {
		throw new Error('Invalid regex arguments');
	}

	const regex = new RegExp(parsedArgs.data.pattern, parsedArgs.data.flags);
	return {
		run: function (output: string): AssertionResult {
			const pass = regex.test(output);
			return {
				pass,
				message: pass ? undefined : `Match not found: "${parsedArgs.data.pattern}"`
			};
		}
	};
}
