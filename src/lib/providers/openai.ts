import {
  normalizedProviderConfigSchema,
  type ConversationPrompt,
  type ModelProvider,
  type PromptPart,
  type RunContext,
  type TokenUsage,
} from '$lib/types';
import { fileToBase64 } from '$lib/utils/media';
import { Semaphore } from '$lib/utils/semaphore';
import { sse } from '$lib/utils/sse';
import { z } from 'zod';
import { CHROME_CONCURRENT_REQUEST_LIMIT_PER_DOMAIN } from './common';
import { exponentialBackoff, shouldRetryHttpError } from '$lib/utils/exponentialBackoff';

const OPENAI_SEMAPHORE = new Semaphore(CHROME_CONCURRENT_REQUEST_LIMIT_PER_DOMAIN);

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

const errorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
  }),
});

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

  get id(): string {
    return `openai:${this.model}`;
  }

  get requestSemaphore(): Semaphore {
    return OPENAI_SEMAPHORE;
  }

  mimeTypes = [
    // Image
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
  ];

  async run(conversation: ConversationPrompt, context: RunContext) {
    const messages = await conversationToOpenAI(conversation);

    const request = {
      model: this.model,
      ...this.request,
      stream: true,
      stream_options: {
        include_usage: true,
      },
      messages,
    } as const;

    const { apiBaseUrl, apiKey } = this;
    const extractDeltaOutput = this.extractDeltaOutput.bind(this);
    return {
      request,
      runModel: async function* () {
        yield '';
        const resp = await exponentialBackoff(async () => {
          const resp = await fetch(`${apiBaseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(request),
            signal: context.abortSignal,
          });
          if (!resp.ok) {
            let error;
            try {
              const json: unknown = await resp.json();
              error = errorSchema.parse(json);
            } catch {
              throw new Error(`Failed to run model: ${resp.statusText} ${resp.status}`);
            }
            throw new Error(`Failed to run model: ${error.error.type}: ${error.error.message}`);
          }
          return resp;
        }, { shouldRetry: shouldRetryHttpError });
        const stream = resp.body;
        let fullText = '';
        let lastResponseJson: unknown;
        if (!stream) throw new Error(`Failed to run model: no response`);
        for await (const value of sse(resp)) {
          lastResponseJson = JSON.parse(value);
          const text = extractDeltaOutput(lastResponseJson);
          fullText += text;
          yield text;
        }

        const parsed = generateContentResponseSchema.parse(lastResponseJson);
        parsed.choices = [{ message: { role: 'assistant', content: fullText } }];
        return parsed;
      },
    };
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
  if (model.startsWith('gpt-4.1-nano')) {
    inputCostPerMillion = 0.1;
    outputCostPerMillion = 0.4;
  } else if (model.startsWith('gpt-4.1-mini')) {
    inputCostPerMillion = 0.4;
    outputCostPerMillion = 1.6;
  } else if (model.startsWith('gpt-4.1')) {
    inputCostPerMillion = 2;
    outputCostPerMillion = 8;
  } else if (model.startsWith('gpt-4.5')) {
    inputCostPerMillion = 75;
    outputCostPerMillion = 150;
  } else if (model.startsWith('o1-mini') || model.startsWith('o3-mini')) {
    inputCostPerMillion = 1.1;
    outputCostPerMillion = 4.4;
  } else if (model.startsWith('o1-pro')) {
    inputCostPerMillion = 150;
    outputCostPerMillion = 600;
  } else if (model.startsWith('o1') || model.startsWith('o1-preview')) {
    inputCostPerMillion = 15;
    outputCostPerMillion = 60;
  } else if (model.startsWith('o3')) {
    inputCostPerMillion = 10;
    outputCostPerMillion = 40;
  } else if (model.startsWith('o4-mini')) {
    inputCostPerMillion = 1.1;
    outputCostPerMillion = 4.4;
  } else if (model.startsWith('gpt-4o-mini')) {
    inputCostPerMillion = 0.15;
    outputCostPerMillion = 0.6;
  } else if (model.startsWith('gpt-4o-2024-08-06')) {
    inputCostPerMillion = 2.5;
    outputCostPerMillion = 10;
  } else if (model.startsWith('gpt-4o')) {
    inputCostPerMillion = 2.5;
    outputCostPerMillion = 10;
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

export async function multiPartPromptToOpenAI(part: PromptPart): Promise<Part> {
  if ('text' in part) {
    return { type: 'text', text: part.text };
  } else if ('file' in part) {
    const b64 = await fileToBase64(part.file);

    return {
      type: 'image_url',
      image_url: {
        url: b64,
      },
    };
  } else {
    throw new Error('Unsupported part type');
  }
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: Part[];
}

async function conversationToOpenAI(conversation: ConversationPrompt): Promise<Message[]> {
  return await Promise.all(
    conversation.map(
      async (part): Promise<Message> => ({
        role: part.role,
        content: await Promise.all(part.content.map(multiPartPromptToOpenAI)),
      }),
    ),
  );
}
