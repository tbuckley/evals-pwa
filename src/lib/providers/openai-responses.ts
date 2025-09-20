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
import { z } from 'zod';
import { CHROME_CONCURRENT_REQUEST_LIMIT_PER_DOMAIN } from './common';
import OpenAI from 'openai';
import type { EasyInputMessage } from 'openai/resources/responses/responses.mjs';
import { getOpenaiCost } from './openai-completions';

const OPENAI_SEMAPHORE = new Semaphore(CHROME_CONCURRENT_REQUEST_LIMIT_PER_DOMAIN);

const configSchema = normalizedProviderConfigSchema
  .extend({
    apiBaseUrl: z.string().optional(),
  })
  .passthrough();

export type OpenaiConfig = z.infer<typeof configSchema>;

export class OpenaiResponsesProvider implements ModelProvider {
  private apiBaseUrl: string;
  private request: object;
  constructor(
    public model: string,
    public apiKey: string,
    config = {},
    public costFunction: typeof getOpenaiCost = getOpenaiCost,
  ) {
    const { apiBaseUrl, mimeTypes, ...request } = configSchema.parse(config);
    if (mimeTypes) {
      this.mimeTypes = mimeTypes;
    }
    this.apiBaseUrl = apiBaseUrl ?? 'https://api.openai.com/v1';
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
      input: input satisfies EasyInputMessage[],
    } as const;

    const { apiBaseUrl, apiKey } = this;
    return {
      request,
      runModel: async function* () {
        const client = new OpenAI({
          apiKey,
          baseURL: apiBaseUrl,
          dangerouslyAllowBrowser: true,
        });
        const stream = await client.responses.create(request, { signal: context.abortSignal });
        let chunk: OpenAI.Responses.ResponseStreamEvent | undefined;
        for await (chunk of stream) {
          if (chunk.type === 'response.output_text.delta') {
            yield chunk.delta;
          } else {
            console.log(chunk.type); // FIXME: don't log
          }
        }
        // if (!resp.ok) {
        //   let error;
        //   try {
        //     const json: unknown = await resp.json();
        //     error = errorSchema.parse(json);
        //   } catch {
        //     throw new Error(`Failed to run model: ${resp.statusText} ${resp.status}`);
        //   }
        //   throw new Error(`Failed to run model: ${error.error.type}: ${error.error.message}`);
        // }

        // FIXME: Catch errors thrown here if stream ended prematurely
        if (!chunk || chunk.type !== 'response.completed') {
          throw new Error('Failed to run model: no response');
        }
        return {
          response: chunk,
        };
      },
    };
  }

  extractOutput(response: unknown): string {
    if (!isResponse(response)) {
      throw new Error('Unexpected response format');
    }

    return response.response.output
      .filter((o) => o.type === 'message')
      .flatMap((o) => o.content)
      .filter((c) => c.type === 'output_text')
      .flatMap((c) => c.text)
      .join('');
  }

  extractTokenUsage(response: unknown): TokenUsage {
    if (!isResponse(response)) {
      throw new Error('Unexpected response format');
    }
    if (!response.response.usage) {
      return {};
    }

    const { input_tokens, output_tokens, total_tokens } = response.response.usage;
    return {
      inputTokens: input_tokens,
      outputTokens: output_tokens,
      totalTokens: total_tokens,
      costDollars: this.costFunction(this.model, input_tokens, output_tokens),
    };
  }
}

type Part =
  | { type: 'input_text'; text: string }
  | { type: 'input_file'; filename: string; file_data: string }
  | { type: 'input_image'; image_url: string; detail: 'auto' | 'low' | 'high' };

async function multiPartPromptToOpenAIResponsesAPI(part: PromptPart): Promise<Part> {
  if ('text' in part) {
    return { type: 'input_text', text: part.text };
  } else if ('file' in part && part.file.type.startsWith('image/')) {
    const b64 = await fileToBase64(part.file);

    return {
      type: 'input_image',
      image_url: b64,
      detail: 'auto',
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

const parsedResponseSchema = z.object({
  type: z.literal('response.completed'),
});
function isResponse(response: unknown): response is OpenAI.Responses.ResponseCompletedEvent {
  return parsedResponseSchema.safeParse(response).success;
}
