import { blobToFileReference } from '$lib/storage/dereferenceFilePaths';
import type { ModelCache, ModelUpdate, TestResult } from '$lib/types';
import { z } from 'zod';
import type { Semaphore } from './semaphore';

const cacheValueSchema = z.object({
  latencyMillis: z.number(),
  response: z.unknown(),
});
type CacheValue = z.infer<typeof cacheValueSchema>;

function isValidCacheValue(value: unknown): value is CacheValue {
  return cacheValueSchema.safeParse(value).success;
}

export async function* maybeUseCache(
  cache: ModelCache | undefined,
  key: unknown,
  runModel: () => AsyncGenerator<string | ModelUpdate, unknown, void>,
  semaphore?: Semaphore,
): AsyncGenerator<
  string | ModelUpdate,
  { latencyMillis: number; response: unknown; fromCache: boolean },
  void
> {
  const cachedValue = await cache?.get(key);
  if (cachedValue && isValidCacheValue(cachedValue)) {
    const response = cachedValue.response;
    const latencyMillis = cachedValue.latencyMillis;
    return {
      latencyMillis,
      response,
      fromCache: true,
    };
  }

  // Wait to acquire the semaphore before running the model
  await semaphore?.acquire();
  const start = Date.now();
  const response = yield* runModel();

  const latencyMillis = Date.now() - start;

  // Release the semaphore after running the model
  semaphore?.release();

  await cache?.set(key, {
    latencyMillis,
    response,
  });

  return {
    latencyMillis,
    response,
    fromCache: false,
  };
}

export async function modelOutputToTestOutput(
  output: string | (string | Blob)[],
): Promise<NonNullable<TestResult['output']>> {
  if (Array.isArray(output)) {
    // Convert blobs to file references
    return await Promise.all(
      output.map(async (val) => {
        if (val instanceof Blob) {
          return blobToFileReference(val);
        }
        return val;
      }),
    );
  }
  return output;
}
