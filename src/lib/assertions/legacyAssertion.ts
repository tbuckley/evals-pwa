import type { FileReference } from '$lib/storage/FileReference';
import type { AssertionResult, CellAssertionProvider } from '$lib/types';

export type MaybePromise<T> = T | Promise<T>;
export interface LegacyAssertionProvider {
  run(output: string | FileReference[]): MaybePromise<AssertionResult>;
  destroy?: () => void;
}
export function wrapLegacyAssertion(assertion: LegacyAssertionProvider): CellAssertionProvider {
  return {
    run: (output: string | (string | FileReference)[]) => {
      if (typeof output === 'string') {
        return assertion.run(output);
      }

      // Convert output array into a string, ignoring files
      const stringOutput = output.filter((val): val is string => typeof val === 'string').join(' ');
      return assertion.run(stringOutput);
    },
  };
}
