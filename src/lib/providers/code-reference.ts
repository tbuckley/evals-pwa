import type {
  ConversationPrompt,
  ExtractedOutputPart,
  ModelProvider,
  RunContext,
  TokenUsage,
} from '$lib/types';
import { metaProviderOutputPartSchema } from '$lib/types';
import { CodeReference, type ModuleExecutable } from '$lib/storage/CodeReference';
import { z } from 'zod';

const outputSchema = z.union([
  z.string(),
  z.array(z.union([z.string(), z.instanceof(Blob), metaProviderOutputPartSchema])),
]);
const envSchema = z.array(z.string());

export class CodeReferenceProvider implements ModelProvider {
  #call?: ModuleExecutable;

  constructor(
    private readonly code: CodeReference,
    private readonly env: Record<string, string>,
    private readonly config: Record<string, unknown> = {},
  ) {}

  get id(): string {
    return `code:${this.code.uri}`;
  }

  get mimeTypes(): string[] | undefined {
    return Array.isArray(this.config.mimeTypes) ? this.config.mimeTypes : undefined;
  }

  async prepare(prompt: ConversationPrompt) {
    const call = await this.getCall();
    return call('prepare', prompt, { env: this.env, config: this.config });
  }

  async runWithKey(key: unknown) {
    const call = await this.getCall();
    return call('run', key, { env: this.env, config: this.config });
  }

  async run(conversation: ConversationPrompt, _context: RunContext) {
    const key = await this.prepare(conversation);
    return {
      request: {
        type: 'code-reference',
        uri: this.code.uri,
        key,
      },
      runModel: async function* (this: CodeReferenceProvider) {
        yield '';
        const response = await this.runWithKey(key);
        return { response };
      }.bind(this),
    };
  }

  extractOutput(response: unknown): string | ExtractedOutputPart[] {
    return outputSchema.parse(response);
  }

  extractTokenUsage(): TokenUsage {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costDollars: 0,
    };
  }

  private async getCall(): Promise<ModuleExecutable> {
    this.#call ??= await this.code.bindModule();
    return this.#call;
  }
}

export async function getCodeProviderEnv(code: CodeReference): Promise<string[]> {
  try {
    const call = await code.bindModule();
    const envValue = await call('env');
    const parsed = envSchema.safeParse(envValue);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
