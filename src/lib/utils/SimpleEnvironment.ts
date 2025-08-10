import type {
  ConversationPrompt,
  ModelCache,
  ModelProvider,
  ModelUpdate,
  NormalizedPrompt,
  PromptFormatter,
  RunContext,
  TestEnvironment,
  TestOutput,
  TokenUsage,
  VarSet,
} from '$lib/types';
import { maybeUseCache, modelOutputToTestOutput } from './environmentHelpers';
import { HandlebarsPromptFormatter } from './HandlebarsPromptFormatter';
import { stringify } from 'yaml';

export interface Config {
  model: ModelProvider;
  prompt: NormalizedPrompt;
  cache?: ModelCache;
}

export class SimpleEnvironment implements TestEnvironment {
  model: ModelProvider;
  prompt: NormalizedPrompt;
  cache?: ModelCache;
  promptFormatter: PromptFormatter;

  constructor(options: Config) {
    this.model = options.model;
    this.prompt = options.prompt;
    this.cache = options.cache;

    const promptText =
      typeof this.prompt === 'string'
        ? this.prompt
        : 'prompt' in this.prompt
          ? this.prompt.prompt
          : ''; // TODO: what should happen with pipeline prompts?
    this.promptFormatter = new HandlebarsPromptFormatter(promptText);
  }

  get provider() {
    return { id: this.model.id };
  }

  async *run(
    vars: VarSet,
    context: RunContext,
  ): AsyncGenerator<string | ModelUpdate, TestOutput, void> {
    let prompt: ConversationPrompt;
    try {
      prompt = await this.promptFormatter.format(vars, this.model.mimeTypes);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return {
        error: error.toString(),
      };
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
      const error = e instanceof Error ? e : new Error(String(e));
      return {
        error: error.toString(),
      };
    }

    let output: NonNullable<TestOutput['output']>;
    let tokenUsage: TokenUsage;
    try {
      const rawOutput = await this.model.extractOutput(response);
      output = await modelOutputToTestOutput(rawOutput);
      tokenUsage = this.model.extractTokenUsage(response);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return {
        rawPrompt: prompt,
        rawOutput: response,
        error: error.toString(),
        latencyMillis,
      };
    }

    const result: TestOutput = {
      rawPrompt: prompt,
      rawOutput: response,
      output,
      latencyMillis,
      tokenUsage,
    };

    if (typeof this.prompt === 'object' && 'export' in this.prompt && this.prompt.export) {
      const exportPath = this.prompt.export;
      const newTestCase = {
        vars: {
          ...vars,
          output,
        },
      };
      result.exportInfo = {
        exportPath,
        content: stringify(newTestCase),
      };
    }

    return result;
  }
}
