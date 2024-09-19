import {
  normalizedProviderConfigSchema,
  type ModelProvider,
  type MultiPartPrompt,
  type PromptPart,
  type RunContext,
  type TokenUsage,
} from '$lib/types';
import { iterateStream } from '$lib/utils/iterateStream';
import { fileToBase64 } from '$lib/utils/media';
import { z } from 'zod';

const anthropicMessageSchema = z.object({
  id: z.string(),
  type: z.literal('message'),
  role: z.literal('assistant'),
  content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
  model: z.string(),
  stop_reason: z.unknown(), // FIXME: What is this?
  stop_sequence: z.unknown(), // FIXME: What is this?
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
  }),
});
type AnthropicMessage = z.infer<typeof anthropicMessageSchema>;

const streamedResponseSchema = z.union([
  z.object({
    type: z.literal('message_start'),
    message: anthropicMessageSchema,
  }),
  z.object({
    type: z.literal('content_block_start'),
    index: z.number(),
    content_block: z.object({
      type: z.literal('text'),
      text: z.string(),
    }),
  }),
  z.object({
    type: z.literal('content_block_delta'),
    index: z.number(),
    delta: z.object({
      type: z.literal('text_delta'),
      text: z.string(),
    }),
  }),
  z.object({
    type: z.literal('content_block_stop'),
    index: z.number(),
  }),
  z.object({
    type: z.literal('message_delta'),
    delta: z.object({
      stop_reason: z.string(),
      stop_sequence: z.unknown(),
    }),
    usage: z.object({
      output_tokens: z.number(),
    }),
  }),
  z.object({
    type: z.literal('message_stop'),
  }),
  z.object({
    type: z.literal('ping'),
  }),
]);
type StreamedResponse = z.infer<typeof streamedResponseSchema>;

export class AnthropicProvider implements ModelProvider {
  private request: object;
  constructor(
    public model: string,
    public apiKey: string,
    config = {},
  ) {
    const { mimeTypes, ...request } = normalizedProviderConfigSchema.parse(config);
    if (mimeTypes) {
      this.mimeTypes = mimeTypes;
    }
    this.request = request;
  }

  mimeTypes = [
    // Image
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
  ];

  async *run(prompt: MultiPartPrompt, context: RunContext) {
    yield '';
    const resp = await fetch(`https://api.anthropic.com/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01', // SSE change to align with openai
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        ...this.request,
        stream: true,
        max_tokens: getMaxTokens(this.model), // Anthropic requires max_tokens
        messages: [
          {
            role: 'user',
            content: await Promise.all(prompt.map(multiPartPromptToAnthropic)),
          },
        ],
      }),
      signal: context.abortSignal,
    });
    if (!resp.ok) {
      throw new Error(`Failed to run model: ${resp.statusText}`);
    }
    const stream = resp.body;
    let message: AnthropicMessage | null = null;
    let buffer = '';
    if (!stream) throw new Error(`Failed to run model: no response`);
    for await (const chunk of iterateStream(stream.pipeThrough(new TextDecoderStream()))) {
      // Sometimes the chunks from openai are split/merged.
      // Buffer them so that we can pull them apart correctly.
      buffer += chunk;
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        if (part.startsWith('data: ')) {
          const value = part.substring(6);
          if (value === '[DONE]') break;
          const resp = streamedResponseSchema.parse(JSON.parse(value));
          const text = this.extractDeltaOutput(resp);
          message = this.applyStreamedResponse(message, resp);
          yield text;
        }
      }
    }

    return message;
  }

  private extractDeltaOutput(json: StreamedResponse): string {
    if (json.type === 'message_start') {
      return json.message.content.map((part) => part.text).join('');
    }
    if (json.type === 'content_block_start') {
      return json.content_block.text;
    }
    if (json.type === 'content_block_delta') {
      return json.delta.text;
    }
    return '';
  }

  private applyStreamedResponse(
    message: AnthropicMessage | null,
    response: StreamedResponse,
  ): AnthropicMessage {
    if (message === null) {
      if (response.type === 'message_start') {
        return response.message;
      }
      throw new Error('Invalid message start');
    }

    // Apply deltas
    if (response.type === 'content_block_start') {
      message.content.push(response.content_block);
    }
    if (response.type === 'content_block_delta') {
      message.content[response.index].text += response.delta.text;
    }
    if (response.type === 'message_delta') {
      message.stop_reason = response.delta.stop_reason;
      message.stop_sequence = response.delta.stop_sequence;
      message.usage.output_tokens += response.usage.output_tokens;
    }
    return message;
  }

  extractOutput(response: unknown): string {
    const json = anthropicMessageSchema.parse(response);
    return json.content.map((part) => part.text).join('');
  }

  extractTokenUsage(response: unknown): TokenUsage {
    const json = anthropicMessageSchema.parse(response);
    // Usage in streaming responses is relatively new (May 2024)
    // so it hasn't quite landed in ollama yet: https://github.com/ollama/ollama/issues/5200
    const usage = json.usage;

    const { input_tokens, output_tokens } = usage;
    return {
      inputTokens: input_tokens,
      outputTokens: output_tokens,
      totalTokens: input_tokens + output_tokens,
      costDollars: getCost(this.model, input_tokens, output_tokens),
    };
  }
}

function getCost(model: string, prompt: number, completion: number): number | undefined {
  // As of July 18 2024
  let inputCostPerMillion: number, outputCostPerMillion: number;
  if (model.startsWith('claude-3-5-sonnet')) {
    inputCostPerMillion = 3;
    outputCostPerMillion = 15;
  } else if (model.startsWith('claude-3-opus')) {
    inputCostPerMillion = 15;
    outputCostPerMillion = 75;
  } else if (model.startsWith('claude-3-haiku')) {
    inputCostPerMillion = 0.25;
    outputCostPerMillion = 1.25;
  } else if (model.startsWith('claude-3-sonnet')) {
    inputCostPerMillion = 3;
    outputCostPerMillion = 15;
  } else {
    return undefined;
  }

  return (prompt * inputCostPerMillion + completion * outputCostPerMillion) / 1000000;
}

function getMaxTokens(model: string): number {
  // From https://docs.anthropic.com/en/docs/about-claude/models
  // As of 18 Sept 2024
  if (model.startsWith('claude-3-5-sonnet')) {
    return 8192;
  }
  return 4096;
}

type Part =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

async function multiPartPromptToAnthropic(part: PromptPart): Promise<Part> {
  if ('text' in part) {
    return { type: 'text', text: part.text };
  } else if ('file' in part) {
    const b64 = await fileToBase64(part.file);
    const firstComma = b64.indexOf(',');

    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: part.file.type,
        data: b64.slice(firstComma + 1),
      },
    };
  } else {
    throw new Error('Unsupported part type');
  }
}
