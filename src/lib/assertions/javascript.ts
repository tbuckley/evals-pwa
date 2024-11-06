import { CodeReference, toCodeReference, type Executable } from '$lib/storage/CodeReference';
import { blobToFileReference } from '$lib/storage/dereferenceFilePaths';
import {
  assertionResultSchema,
  type AssertionProvider,
  type AssertionResult,
  type NormalizedTestCase,
  type TestResult,
} from '$lib/types';
import { z } from 'zod';

const argsSchema = z.object({
  code: z.union([z.string(), z.custom<CodeReference>((value) => value instanceof CodeReference)]),
});

const jsResultSchema = assertionResultSchema.extend({
  visuals: z.array(z.union([z.string(), z.instanceof(Blob)])).optional(),
  outputs: z.record(z.string(), z.union([z.boolean(), z.number()])).optional(),
});

export function createJavascriptAssertion(
  args: unknown,
  testVars: NormalizedTestCase['vars'],
): AssertionProvider {
  const parsedArgs = argsSchema.safeParse(args);
  if (!parsedArgs.success) {
    throw new Error('Invalid javascript arguments');
  }

  let execute: Executable | undefined;
  return {
    async run(output: NonNullable<TestResult['output']>): Promise<AssertionResult> {
      try {
        if (!execute) {
          const code = await toCodeReference(parsedArgs.data.code);
          execute = await code.bind();
        }
        const res = await execute(output, { vars: testVars });
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
              }),
            )
          : undefined;
        return {
          pass: parsed.pass,
          message: parsed.message,
          outputs: parsed.outputs,
          visuals,
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
          message: formattedMessage,
        };
      }
    },
  };
}
