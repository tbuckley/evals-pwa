import { CodeReference, toCodeReference, type Executable } from '$lib/storage/CodeReference';
import { blobToFileReference } from '$lib/storage/dereferenceFilePaths';
import {
  assertionResultSchema,
  type AssertionProvider,
  type RowAssertionProvider,
  type CellAssertionProvider,
  type AssertionResult,
  type NormalizedTestCase,
} from '$lib/types';
import { z } from 'zod';

const argsSchema = z.object({
  code: z.union([z.string(), z.custom<CodeReference>((value) => value instanceof CodeReference)]),
  row: z.boolean().optional(),
});

const jsResultSchema = assertionResultSchema.extend({
  visuals: z.array(z.union([z.string(), z.instanceof(Blob)])).optional(),
  outputs: z.record(z.string(), z.union([z.boolean(), z.number()])).optional(),
});
type JsResult = z.infer<typeof jsResultSchema>;
export type JavascriptAssertionArgs = z.infer<typeof argsSchema>;

export function createJavascriptAssertion(
  args: unknown,
  testVars: NormalizedTestCase['vars'],
): AssertionProvider {
  const parsedArgs = argsSchema.safeParse(args);
  if (!parsedArgs.success) {
    throw new Error('Invalid javascript arguments');
  }

  const row = parsedArgs.data.row ?? false;
  let execute: Executable | undefined;

  if (!row) {
    return {
      async run(output, context): Promise<AssertionResult> {
        try {
          if (!execute) {
            const code = await toCodeReference(parsedArgs.data.code);
            execute = await code.bind();
          }
          const res = await execute(output, { vars: testVars, ...context });
          const parsed = jsResultSchema.parse(res);
          return await sanitizeResult(parsed);
        } catch (e) {
          const formattedMessage = formatErrorMessage(e);

          return {
            pass: false,
            message: formattedMessage,
          };
        }
      },
    } satisfies CellAssertionProvider;
  } else {
    return {
      type: 'row',
      run: async (results, context): Promise<AssertionResult[]> => {
        try {
          if (!execute) {
            const code = await toCodeReference(parsedArgs.data.code);
            execute = await code.bind();
          }
          const res = await execute(results, { vars: testVars, ...context });
          const parsed = z.array(jsResultSchema).parse(res);
          return await Promise.all(parsed.map((res) => sanitizeResult(res)));
        } catch (e) {
          const formattedMessage = formatErrorMessage(e);
          const res = {
            pass: false,
            message: formattedMessage,
          } satisfies AssertionResult;

          // Return an array with the same length as `results`, containing res for each index
          return Array(results.length).fill(res) as AssertionResult[];
        }
      },
    } satisfies RowAssertionProvider;
  }
}

async function sanitizeResult(result: JsResult): Promise<AssertionResult> {
  const visuals: AssertionResult['visuals'] = result.visuals
    ? await Promise.all(
        result.visuals.map(async (v) => {
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
    pass: result.pass,
    message: result.message,
    outputs: result.outputs,
    visuals,
  };
}

function formatErrorMessage(e: unknown): string {
  const errorMessage = e instanceof Error ? e.message : String(e);
  const lineNumber =
    e instanceof Error && 'lineNumber' in e ? (e as { lineNumber: number }).lineNumber : undefined;
  const stackTrace = e instanceof Error ? e.stack : undefined;

  let formattedMessage = `Error in javascript assertion: ${errorMessage}`;
  if (lineNumber !== undefined) {
    formattedMessage += `\nLine: ${lineNumber}`;
  }
  if (stackTrace) {
    formattedMessage += `\n\nStack trace:\n${stackTrace}`;
  }
  return formattedMessage;
}
