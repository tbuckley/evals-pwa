import { blobToFileReference } from '$lib/storage/dereferenceFilePaths';
import type {
  ModelCache,
  ModelRunner,
  ModelSession,
  ModelUpdate,
  MultiPartPrompt,
  TestResult,
} from '$lib/types';
import { z } from 'zod';
import type { Semaphore } from './semaphore';

const cacheValueSchemaV1 = z.object({
  latencyMillis: z.number(),
  response: z.unknown(),
});
type CacheValueV1 = z.infer<typeof cacheValueSchemaV1>;
function isValidCacheValueV1(value: unknown): value is CacheValueV1 {
  return cacheValueSchemaV1.safeParse(value).success;
}

const cacheValueSchemaV2 = z.object({
  version: z.literal(2),
  latencyMillis: z.number(),
  response: z.unknown(),
  sessionState: z.unknown(),
});
type CacheValueV2 = z.infer<typeof cacheValueSchemaV2>;
function isValidCacheValueV2(value: unknown): value is CacheValueV2 {
  return cacheValueSchemaV2.safeParse(value).success;
}

// Keep this up to date
type LatestCacheValue = CacheValueV2;

export interface CacheOutput {
  latencyMillis: number;
  response: unknown;
  fromCache: boolean;
  session?: ModelSession;
}
interface GetCacheOptions {
  minVersion?: number;
}
function getCacheOutput(cachedValue: unknown, options?: GetCacheOptions): CacheOutput | null {
  const minVersion = options?.minVersion ?? 1;
  if (!cachedValue) {
    return null;
  }
  if (isValidCacheValueV2(cachedValue) && 2 >= minVersion) {
    return {
      latencyMillis: cachedValue.latencyMillis,
      response: cachedValue.response,
      session: cachedValue.sessionState ? { state: cachedValue.sessionState } : undefined,
      fromCache: true,
    };
  }
  if (isValidCacheValueV1(cachedValue) && 1 >= minVersion) {
    return {
      latencyMillis: cachedValue.latencyMillis,
      response: cachedValue.response,
      session: undefined,
      fromCache: true,
    };
  }
  return null;
}

export interface MaybeUseCacheOptions {
  requireSession?: boolean;
}

export async function* maybeUseCache(
  cache: ModelCache | undefined,
  key: unknown,
  runModel: ModelRunner,
  semaphore?: Semaphore,
  options?: MaybeUseCacheOptions,
): AsyncGenerator<string | ModelUpdate, CacheOutput, void> {
  const cachedValue = await cache?.get(key);
  const cacheOutput = getCacheOutput(cachedValue, {
    minVersion: options?.requireSession ? 2 : 1,
  });

  // Return cached value if it exists and meets any session requirements
  if (cacheOutput && (!options?.requireSession || cacheOutput.session)) {
    return cacheOutput;
  }

  // Wait to acquire the semaphore before running the model
  await semaphore?.acquire();
  yield { type: 'begin-stream' }; // Signal that we're starting the request

  let response: unknown;
  let session: ModelSession | undefined;
  let latencyMillis: number;
  try {
    const start = Date.now();
    const res = yield* runModel();
    response = res.response;
    session = res.session;
    latencyMillis = Date.now() - start;
  } finally {
    // Release the semaphore after running the model
    semaphore?.release();
  }

  const canCacheSession = !session?.skipCache;
  await cache?.set(key, {
    version: 2,
    latencyMillis,
    response,
    sessionState: canCacheSession ? session?.state : undefined,
  } satisfies LatestCacheValue);

  return {
    latencyMillis,
    response,
    session,
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

export async function modelOutputToMultiPartPrompt(
  output: string | (string | Blob)[],
): Promise<MultiPartPrompt> {
  const testOutput = await modelOutputToTestOutput(output);
  if (typeof testOutput === 'string') {
    return [{ text: testOutput }];
  }
  return testOutput.map((part) => {
    if (typeof part === 'string') {
      return { text: part };
    }
    return { file: part.file };
  });
}
