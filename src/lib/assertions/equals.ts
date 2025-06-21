import type { CellAssertionProvider, AssertionResult } from '$lib/types';
import { z } from 'zod';
import { wrapLegacyAssertion } from './legacyAssertion';

const argsSchema = z.object({
  value: z.string(),
  ignoreCase: z.boolean().optional(),
  trim: z.boolean().optional(),
});

export function createEqualsAssertion(args: unknown): CellAssertionProvider {
  const parsedArgs = argsSchema.safeParse(args);
  if (!parsedArgs.success) {
    throw new Error('Invalid regex arguments');
  }

  const { value, ignoreCase, trim } = parsedArgs.data;
  const groundTruth = ignoreCase ? value.toLocaleLowerCase() : value;
  return wrapLegacyAssertion({
    run: function (output: string): AssertionResult {
      const outputValue = ignoreCase ? output.toLocaleLowerCase() : output;
      const pass = trim ? outputValue.trim() === groundTruth.trim() : outputValue === groundTruth;
      return {
        pass,
        message: pass ? undefined : `Does not equal: "${value}"`,
      };
    },
  });
}
