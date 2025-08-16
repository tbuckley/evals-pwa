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
import { maybeUseCache, modelOutputToTestOutput } from './environmentHelpers';

export interface Config {
  model: ModelProvider;
  promptFormatter: PromptFormatter;
  cache?: ModelCache;
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
        console.error('Error formatting prompt:', e);
        return {
          error: e.toString(),
        };
      }
      throw e;
    }

    let response: unknown;
    let latencyMillis: number;
    try {
      const { request, runModel } = await this.model.run(prompt, context);

      const cacheKey = {
        provider: this.provider.id,
        request,
        ...(context.cacheKey ?? {}),
      };

      const { response: cachedResponse, latencyMillis: cachedLatencyMillis } = yield* maybeUseCache(
        this.cache,
        cacheKey,
        runModel,
        this.model.requestSemaphore,
      );
      response = cachedResponse;
      latencyMillis = cachedLatencyMillis;
    } catch (e) {
      if (e instanceof Error) {
        console.error('Error running model:', e);
        return {
          error: e.toString(),
        };
      }
      throw e;
    }

    let output: NonNullable<TestOutput['output']>;
    let tokenUsage: TokenUsage;
    try {
      const rawOutput = await this.model.extractOutput(response);
      output = await modelOutputToTestOutput(rawOutput);
      tokenUsage = this.model.extractTokenUsage(response);
    } catch (e) {
      if (e instanceof Error) {
        return {
          rawPrompt: prompt,
          rawOutput: response,
          error: e.toString(),
          latencyMillis,
        };
      }
      throw e;
    }

    return {
      rawPrompt: prompt,
      rawOutput: response,
      output,
      latencyMillis,
      tokenUsage,
    };
  }
}
