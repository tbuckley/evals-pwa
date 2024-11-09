import { blobToFileReference } from '$lib/storage/dereferenceFilePaths';
import type {
  TestEnvironment,
  ModelProvider,
  TestOutput,
  PromptFormatter,
  TokenUsage,
  VarSet,
  RunContext,
  ModelUpdate,
  ConversationPrompt,
  ModelCache,
} from '$lib/types';
import { z } from 'zod';

export interface Config {
  model: ModelProvider;
  promptFormatter: PromptFormatter;
  cache?: ModelCache;
}

const cacheValueSchema = z.object({
  latencyMillis: z.number(),
  response: z.unknown(),
});
type CacheValue = z.infer<typeof cacheValueSchema>;

function isValidCacheValue(value: unknown): value is CacheValue {
  return cacheValueSchema.safeParse(value).success;
}

export class SimpleEnvironment implements TestEnvironment {
  model: ModelProvider;
  promptFormatter: PromptFormatter;
  cache?: ModelCache;

  constructor(options: Config) {
    this.model = options.model;
    this.promptFormatter = options.promptFormatter;
    this.cache = options.cache;
  }

  get provider() {
    return { id: this.model.id };
  }
  get prompt() {
    return this.promptFormatter.prompt;
  }

  async *run(
    vars: VarSet,
    context: RunContext,
  ): AsyncGenerator<string | ModelUpdate, TestOutput, void> {
    let prompt: ConversationPrompt;
    try {
      prompt = await this.promptFormatter.format(vars, this.model.mimeTypes);
    } catch (e) {
      if (e instanceof Error) {
        return {
          error: e.toString(),
        };
      }
      throw e;
    }

    const start = Date.now();
    const { request, run } = await this.model.run(prompt, context);

    const cacheKey = {
      provider: this.provider.id,
      request,
    };

    const cachedValue = await this.cache?.get(cacheKey);
    let validCacheValue: CacheValue | undefined;
    if (isValidCacheValue(cachedValue)) {
      validCacheValue = cachedValue;
    }

    let resp: unknown;
    let latencyMillis: number;

    if (validCacheValue) {
      resp = validCacheValue.response;
      latencyMillis = validCacheValue.latencyMillis;
    } else {
      try {
        const generator = run();

        let next;
        while (!next?.done) {
          next = await generator.next();
          if (!next.done) {
            yield next.value;
          }
        }
        resp = next.value;
      } catch (e) {
        if (e instanceof Error) {
          return {
            rawPrompt: prompt,
            error: e.toString(),
          };
        }
        throw e;
      }
      latencyMillis = Date.now() - start;

      await this.cache?.set(cacheKey, {
        latencyMillis,
        response: resp,
      });
    }

    let output: TestOutput['output'];
    let tokenUsage: TokenUsage;
    try {
      const directOutput = await this.model.extractOutput(resp);
      if (Array.isArray(directOutput)) {
        // Convert blobs to file references
        output = await Promise.all(
          directOutput.map(async (val) => {
            if (val instanceof Blob) {
              return blobToFileReference(val);
            }
            return val;
          }),
        );
      } else {
        output = directOutput;
      }

      tokenUsage = this.model.extractTokenUsage(resp);
    } catch (e) {
      if (e instanceof Error) {
        return {
          rawPrompt: prompt,
          rawOutput: resp,
          error: e.toString(),
          latencyMillis,
        };
      }
      throw e;
    }

    return {
      rawPrompt: prompt,
      rawOutput: resp,
      output,
      latencyMillis,
      tokenUsage,
    };
  }
}
