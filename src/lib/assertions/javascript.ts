import { CodeReference } from '$lib/storage/CodeReference';
import { FileReference } from '$lib/storage/FileReference';
import {
	assertionResultSchema,
	type AssertionProvider,
	type AssertionResult,
	type NormalizedTestCase
} from '$lib/types';
import { CodeSandbox } from '$lib/utils/CodeSandbox';
import { objectDfsMap } from '$lib/utils/objectDFS';
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
									const hash = await hashBlob(v);
									const ext = getFileExtension(v.type);
									const filename = hash + ext;
									const file = new File([v], filename, { type: v.type });
									return new FileReference('file:///runs/' + filename, file);
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

async function hashBlob(blob: Blob): Promise<string> {
	const fileReader = new FileReader();
	fileReader.readAsArrayBuffer(blob);

	return new Promise((resolve, reject) => {
		fileReader.onloadend = async () => {
			try {
				const hashBuffer = await crypto.subtle.digest('SHA-256', fileReader.result as ArrayBuffer);
				const hashArray = Array.from(new Uint8Array(hashBuffer));
				const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
				resolve(hashHex);
			} catch (err) {
				reject(err);
			}
		};
	});
}

function getFileExtension(type: string): string {
	const extensionMap: Record<string, string> = {
		'image/png': '.png',
		'image/jpeg': '.jpg'
	};

	if (type in extensionMap) {
		return extensionMap[type];
	}

	throw new Error(`Unsupported file type: ${type}`);
}
