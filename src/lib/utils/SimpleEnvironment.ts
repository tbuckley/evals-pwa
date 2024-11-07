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
} from '$lib/types';

export interface Config {
  model: ModelProvider;
  prompt: PromptFormatter;
}

export class SimpleEnvironment implements TestEnvironment {
  model: ModelProvider;
  prompt: PromptFormatter;

  constructor(options: Config) {
    this.model = options.model;
    this.prompt = options.prompt;
  }

  async *run(
    vars: VarSet,
    context: RunContext,
  ): AsyncGenerator<string | ModelUpdate, TestOutput, void> {
    let prompt: ConversationPrompt;
    try {
      prompt = await this.prompt.format(vars, this.model.mimeTypes);
    } catch (e) {
      if (e instanceof Error) {
        return {
          error: e.toString(),
        };
      }
      throw e;
    }

    const start = Date.now();
    let resp: unknown;
    try {
      const generator = this.model.run(prompt, context);
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
    const latencyMillis = Date.now() - start;

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
