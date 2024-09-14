import { CodeReference } from '$lib/storage/CodeReference';
import { blobToFileReference } from '$lib/storage/dereferenceFilePaths';
import {
	assertionResultSchema,
	type AssertionProvider,
	type AssertionResult,
	type NormalizedTestCase
} from '$lib/types';
import { CodeSandbox } from '$lib/utils/CodeSandbox';
import { z } from 'zod';

const argsSchema = z.object({
	code: z.union([z.string(), z.custom<CodeReference>((value) => value instanceof CodeReference)])
});

const jsResultSchema = assertionResultSchema.extend({
	visuals: z.array(z.union([z.string(), z.instanceof(Blob)])).optional()
});

export function createJavascriptAssertion(
	args: unknown,
	testVars: NormalizedTestCase['vars']
): AssertionProvider {
	const parsedArgs = argsSchema.safeParse(args);
	if (!parsedArgs.success) {
		throw new Error('Invalid javascript arguments');
	}

	let sandbox: CodeSandbox | undefined;
	return {
		async run(output: string): Promise<AssertionResult> {
			if (!sandbox) {
				sandbox = new CodeSandbox(parsedArgs.data.code);
			}
			try {
				const res = await sandbox.execute(output, { vars: testVars });
				const parsed = jsResultSchema.parse(res);
				const visuals: AssertionResult['visuals'] = parsed.visuals
					? await Promise.all(
							parsed.visuals.map(async (v) => {
								// Convert Blob to FileReference
								if (v instanceof Blob) {
									if (!['image/png', 'image/jpeg'].includes(v.type)) {
										throw new Error(`Unsupported file type: ${v.type}`);
									}
									return blobToFileReference(v);
								}
								return v;
							})
						)
					: undefined;
				return {
					pass: parsed.pass,
					message: parsed.message,
					visuals
				};
			} catch (e) {
				const errorMessage = e instanceof Error ? e.message : String(e);
				const lineNumber =
					e instanceof Error && 'lineNumber' in e
						? (e as { lineNumber: number }).lineNumber
						: undefined;
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
			sandbox?.destroy();
			sandbox = undefined;
		}
	};
}
