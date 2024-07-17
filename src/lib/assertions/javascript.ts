import { assertionResultSchema, type AssertionProvider, type AssertionResult } from '$lib/types';
import { CodeSandbox } from '$lib/utils/CodeSandbox';
import { z } from 'zod';

const argsSchema = z.object({
	code: z.string()
});

export function createJavascriptAssertion(args: unknown): AssertionProvider {
	const parsedArgs = argsSchema.safeParse(args);
	if (!parsedArgs.success) {
		throw new Error('Invalid javascript arguments');
	}

	const code = parsedArgs.data.code;
	const sandbox = new CodeSandbox(code);

	return {
		async run(output: string): Promise<AssertionResult> {
			const res = await sandbox.execute(output);
			return assertionResultSchema.parse(res);
		},
		destroy() {
			sandbox.destroy();
		}
	};
}
