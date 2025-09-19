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

const OPENAI_SEMAPHORE = new Semaphore(CHROME_CONCURRENT_REQUEST_LIMIT_PER_DOMAIN);

const responseSchema = z.object({
  // Lots of fields
  output: z.array(
    z
      .discriminatedUnion('type', [
        z.object({
          id: z.string(),
          type: z.literal('message'),
          role: z.literal('assistant'),
          content: z.array(
            z
              .discriminatedUnion('type', [
                z.object({
                  type: z.literal('output_text'),
                  text: z.string(),
                }),
                z.object({
                  type: z.literal('unknown'),
                }),
              ])
              .catch({ type: 'unknown' }),
          ),
        }),
        z.object({
          type: z.literal('unknown'),
        }),
      ])
      .catch({ type: 'unknown' }),
  ),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  }),
});

const responseCompletedSchema = z.object({
  type: z.literal('response.completed'),
  sequence_number: z.number(),
  response: responseSchema,
});

const generateContentResponseSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('response.output_item.added'),
      sequence_number: z.number(),

      item: z.object({
        id: z.string(),
        status: z.string(), // TODO enum
        type: z.string(), // TODO enum
      }),
    }),
    z.object({
      type: z.literal('response.content_part.added'),
      sequence_number: z.number(),
      item_id: z.string(),

      output_index: z.number(),
      content_index: z.number(),
      part: z.object({
        type: z.literal('output_text'),
        text: z.string(),
        // also annotations, empty array?
      }),
    }),
    z.object({
      type: z.literal('response.output_text.delta'),
      sequence_number: z.number(),
      item_id: z.string(),

      output_index: z.number(),
      content_index: z.number(),
      delta: z.string(),
    }),
    responseCompletedSchema,
    z.object({
      type: z.literal('unknown'),
    }),
  ])
  .catch({ type: 'unknown' });

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

export class OpenaiResponsesProvider implements ModelProvider {
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
    return `openai-responses:${this.model}`;
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

    // PDF
    'application/pdf',
  ];

  async run(conversation: ConversationPrompt, context: RunContext) {
    const input = await conversationToOpenAI(conversation);

    const request = {
      model: this.model,
      ...this.request,
      stream: true,
      input,
    } as const;

    const { apiBaseUrl, apiKey } = this;
    const extractDeltaOutput = this.extractDeltaOutput.bind(this);
    return {
      request,
      runModel: async function* () {
        yield '';
        const resp = await fetch(`${apiBaseUrl}/v1/responses`, {
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
        const stream = resp.body;
        let lastResponseJson: unknown;
        if (!stream) throw new Error(`Failed to run model: no response`);
        for await (const value of sse(resp)) {
          lastResponseJson = JSON.parse(value);
          const text = extractDeltaOutput(lastResponseJson);
          yield text;
        }

        const parsed = responseCompletedSchema.parse(lastResponseJson);
        return {
          response: parsed.response,
        };
      },
    };
  }

  extractDeltaOutput(response: unknown): string {
    const json = generateContentResponseSchema.safeParse(response);
    if (!json.success || json.data.type === 'unknown') {
      console.info('Unsupported OpenAI Responses API streaming message', response);
      return '';
    }

    // TODO handle more than deltas
    if (json.data.type === 'response.output_text.delta') {
      return json.data.delta;
    }
    return '';
  }

  extractOutput(response: unknown): string {
    const json = responseSchema.parse(response);
    const text = json.output
      .filter((o) => o.type === 'message')
      .flatMap((o) => o.content)
      .filter((c) => c.type === 'output_text')
      .flatMap((c) => c.text)
      .join('');
    return text;
  }

  extractTokenUsage(response: unknown): TokenUsage {
    const json = responseSchema.parse(response);
    // Usage in streaming responses is relatively new (May 2024)
    // so it hasn't quite landed in ollama yet: https://github.com/ollama/ollama/issues/5200

    const { input_tokens, output_tokens, total_tokens } = json.usage;
    return {
      inputTokens: input_tokens,
      outputTokens: output_tokens,
      totalTokens: total_tokens,
      costDollars: this.costFunction(this.model, input_tokens, output_tokens),
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
  | { type: 'input_text'; text: string }
  | { type: 'input_file'; filename: string; file_data: string }
  | { type: 'input_image'; image_url: string; detail?: 'auto' | 'low' | 'high' };

async function multiPartPromptToOpenAIResponsesAPI(part: PromptPart): Promise<Part> {
  if ('text' in part) {
    return { type: 'input_text', text: part.text };
  } else if ('file' in part && part.file.type.startsWith('image/')) {
    const b64 = await fileToBase64(part.file);

    return {
      type: 'input_image',
      image_url: b64,
    };
  } else if ('file' in part) {
    const b64 = await fileToBase64(part.file);
    return {
      type: 'input_file',
      filename: part.file.name,
      file_data: b64,
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
        content: await Promise.all(part.content.map(multiPartPromptToOpenAIResponsesAPI)),
      }),
    ),
  );
}
