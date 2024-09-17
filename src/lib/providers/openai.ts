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

const generateContentResponseSchema = z.object({
  id: z.string(),
  choices: z.array(
    z.object({
      message: z
        .object({
          content: z.string().nullable(),
          role: z.string(),
        })
        .optional(),
      delta: z
        .object({
          content: z.string().optional(),
        })
        .optional(),
    }),
  ),
  usage: z
    .object({
      completion_tokens: z.number().int(),
      prompt_tokens: z.number().int(),
      total_tokens: z.number().int(),
    })
    .nullable()
    .optional(),
});

const configSchema = normalizedProviderConfigSchema
  .extend({
    apiBaseUrl: z.string().optional(),
  })
  .passthrough();

export type OpenaiConfig = z.infer<typeof configSchema>;

export class OpenaiProvider implements ModelProvider {
  private apiBaseUrl: string;
  private request: object;
  constructor(
    public model: string,
    public apiKey: string,
    config = {},
    public costFunction: typeof getCost = getCost,
  ) {
    const { apiBaseUrl, mimeTypes, ...request } = configSchema.parse(config);
    if (mimeTypes) {
      this.mimeTypes = mimeTypes;
    }
    this.apiBaseUrl = apiBaseUrl ?? 'https://api.openai.com';
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
    const resp = await fetch(`${this.apiBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        ...this.request,
        stream: true,
        stream_options: {
          include_usage: true,
        },
        messages: [
          {
            role: 'user',
            content: await Promise.all(prompt.map(multiPartPromptToOpenAI)),
          },
        ],
      }),
      signal: context.abortSignal,
    });
    if (!resp.ok) {
      throw new Error(`Failed to run model: ${resp.statusText}`);
    }
    const stream = resp.body;
    let fullText = '';
    let lastResponseJson: unknown;
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
          lastResponseJson = JSON.parse(value);
          const text = this.extractDeltaOutput(lastResponseJson);
          fullText += text;
          yield text;
        }
      }
    }

    const parsed = generateContentResponseSchema.parse(lastResponseJson);
    parsed.choices = [{ message: { role: 'assistant', content: fullText } }];
    return parsed;
  }

  extractDeltaOutput(response: unknown): string {
    const json = generateContentResponseSchema.parse(response);
    return json.choices[0]?.delta?.content ?? '';
  }

  extractOutput(response: unknown): string {
    const json = generateContentResponseSchema.parse(response);
    const firstChoice = json.choices[0].message?.content;
    if (typeof firstChoice === 'string') {
      return firstChoice;
    }

    throw new Error('Unexpected output format');
  }

  extractTokenUsage(response: unknown): TokenUsage {
    const json = generateContentResponseSchema.parse(response);
    // Usage in streaming responses is relatively new (May 2024)
    // so it hasn't quite landed in ollama yet: https://github.com/ollama/ollama/issues/5200
    const usage = json.usage ?? {
      completion_tokens: 0,
      prompt_tokens: 0,
      total_tokens: 0,
    };

    const { completion_tokens, prompt_tokens, total_tokens } = usage;
    return {
      inputTokens: prompt_tokens,
      outputTokens: completion_tokens,
      totalTokens: total_tokens,
      costDollars: this.costFunction(this.model, prompt_tokens, completion_tokens),
    };
  }
}

function getCost(model: string, prompt: number, completion: number): number | undefined {
  // As of July 18 2024
  let inputCostPerMillion: number, outputCostPerMillion: number;
  if (model.startsWith('gpt-4o-mini')) {
    inputCostPerMillion = 0.15;
    outputCostPerMillion = 0.6;
  } else if (model.startsWith('gpt-4o-2024-08-06')) {
    inputCostPerMillion = 2.5;
    outputCostPerMillion = 10;
  } else if (model.startsWith('gpt-4o')) {
    inputCostPerMillion = 5;
    outputCostPerMillion = 15;
  } else if (model.startsWith('gpt-4-turbo')) {
    inputCostPerMillion = 10;
    outputCostPerMillion = 30;
  } else if (model.startsWith('gpt-3.5-turbo-0125')) {
    inputCostPerMillion = 0.5;
    outputCostPerMillion = 1.5;
  } else {
    return undefined;
  }

  return (prompt * inputCostPerMillion + completion * outputCostPerMillion) / 1000000;
}

type Part =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

async function multiPartPromptToOpenAI(part: PromptPart): Promise<Part> {
  if ('text' in part) {
    return { type: 'text', text: part.text };
  } else if ('file' in part) {
    const b64 = await fileToBase64(part.file);

    return {
      type: 'image_url',
      image_url: {
        url: b64,
        detail: 'auto',
      },
    };
  } else {
    throw new Error('Unsupported part type');
  }
}
