import {
	assertionResultSchema,
	type AssertionProvider,
	type AssertionResult,
	type NormalizedTestCase
} from '$lib/types';
import { CodeSandbox } from '$lib/utils/CodeSandbox';
import { z } from 'zod';

const argsSchema = z.object({
	code: z.string()
});

export function createJavascriptAssertion(
	args: unknown,
	testVars: NormalizedTestCase['vars']
): AssertionProvider {
	const parsedArgs = argsSchema.safeParse(args);
	if (!parsedArgs.success) {
		throw new Error('Invalid javascript arguments');
	}

	const code = parsedArgs.data.code;
	const sandbox = new CodeSandbox(code);

	return {
		async run(output: string): Promise<AssertionResult> {
			try {
				const res = await sandbox.execute(output, { vars: testVars });
				return assertionResultSchema.parse(res);
			} catch (e) {
				const errorMessage = e instanceof Error ? e.message : String(e);
				const lineNumber =
					e instanceof Error && 'lineNumber' in e ? (e as any).lineNumber : undefined;
				const stackTrace = e instanceof Error ? e.stack : undefined;

				let formattedMessage = `Error in javascript assertion: ${errorMessage}`;
				if (lineNumber !== undefined) {
					formattedMessage += `\nLine: ${lineNumber}`;
				}
				if (stackTrace) {
					formattedMessage += `\n\nStack trace:\n${stackTrace}`;
				}

				return {
					pass: false,
					message: formattedMessage
				};
			}
		},
		destroy() {
			sandbox.destroy();
		}
	};
}
