import type { AssertionProvider, AssertionResult } from '$lib/types';
import { z } from 'zod';

const argsSchema = z.object({
	needle: z.string()
});

export function createIContainsAssertion(args: unknown): AssertionProvider {
	const parsedArgs = argsSchema.safeParse(args);
	if (!parsedArgs.success) {
		throw new Error('Invalid icontains arguments');
	}

	const needle = parsedArgs.data.needle.toLocaleLowerCase();
	return {
		run: function (output: string): AssertionResult {
			const pass = output.toLocaleLowerCase().includes(needle);
			return {
				pass,
				message: pass ? undefined : `String not found: "${needle}"`
			};
		}
	};
}
