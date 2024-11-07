import {
  normalizedProviderConfigSchema,
  type ConversationPrompt,
  type ModelProvider,
  type MultiPartPrompt,
  type RunContext,
  type TokenUsage,
} from '$lib/types';
import { z } from 'zod';
import { conversationToSinglePrompt } from './legacyProvider';

const dalleResponseSchema = z.object({
  created: z.number(),
  data: z.array(
    z.object({
      revised_prompt: z.string().optional(),
      b64_json: z.string(),
    }),
  ),
});

const configSchema = normalizedProviderConfigSchema
  .extend({
    size: z.string().optional(),
    quality: z.string().optional(),
  })
  .passthrough();
export type DalleConfig = z.infer<typeof configSchema>;

export class DalleProvider implements ModelProvider {
  private request: Omit<DalleConfig, 'mimeTypes'>;
  constructor(
    public model: string,
    public apiKey: string,
    config = {},
    public costFunction: typeof getCost = getCost,
  ) {
    const { mimeTypes: _mimeTypes, ...request } = configSchema.parse(config);
    this.request = request;
  }

  get id(): string {
    return `dalle:${this.model}`;
  }

  mimeTypes: string[] = [];

  async *run(conversation: ConversationPrompt, context: RunContext) {
    const prompt = conversationToSinglePrompt(conversation);

    yield '';
    const resp = await fetch(`https://api.openai.com/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        ...this.request,
        prompt: multiPartPromptToString(prompt),
        response_format: 'b64_json',
      }),
      signal: context.abortSignal,
    });
    if (!resp.ok) {
      throw new Error(`Failed to run model: ${resp.statusText}`);
    }

    const json: unknown = await resp.json();
    return json;
  }

  extractOutput(response: unknown): (Blob | string)[] {
    const json = dalleResponseSchema.parse(response);
    const firstChoice = json.data[0].b64_json;

    if (typeof firstChoice === 'string') {
      // Convert base64 to blob
      const byteCharacters = atob(firstChoice);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const res: (Blob | string)[] = [new Blob([byteArray], { type: 'image/png' })];
      return res;
    }

    throw new Error('Unexpected output format');
  }

  extractTokenUsage(_response: unknown): TokenUsage {
    return {
      costDollars: this.costFunction(
        this.model,
        (this.request.size as string | undefined) ?? '1024x1024',
        (this.request.quality as string | undefined) ?? 'standard',
      ),
    };
  }
}

function getCost(model: string, size: string, quality = 'standard'): number | undefined {
  if (model === 'dall-e-3' && quality === 'standard') {
    switch (size) {
      case '1024x1024':
        return 0.04;
      case '1792x1024':
        return 0.08;
      case '1024x1792':
        return 0.08;
      default:
        return undefined;
    }
  }

  if (model === 'dall-e-3' && quality === 'hd') {
    switch (size) {
      case '1024x1024':
        return 0.08;
      case '1792x1024':
        return 0.12;
      case '1024x1792':
        return 0.12;
      default:
        return undefined;
    }
  }

  if (model === 'dall-e-2') {
    switch (size) {
      case '1024x1024':
        return 0.02;
      case '512x512':
        return 0.018;
      case '256x256':
        return 0.016;
      default:
        return undefined;
    }
  }
}

function multiPartPromptToString(prompt: MultiPartPrompt): string {
  return prompt
    .filter((p): p is { text: string } => 'text' in p)
    .map((p) => p.text)
    .join(' ');
}
