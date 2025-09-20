import {
  normalizedProviderConfigSchema,
  type ConversationPrompt,
  type ModelProvider,
  type ModelUpdate,
  type PromptPart,
  type ProviderOutputPart,
  type RunContext,
  type TokenUsage,
} from '$lib/types';
import { fileToBase64 } from '$lib/utils/media';
import { Semaphore } from '$lib/utils/semaphore';
import { z } from 'zod';
import { CHROME_CONCURRENT_REQUEST_LIMIT_PER_DOMAIN } from './common';
import OpenAI from 'openai';
import type {
  EasyInputMessage,
  ResponseFunctionWebSearch,
  ResponseInput,
} from 'openai/resources/responses/responses.mjs';
import { getOpenaiCost } from './openai-completions';
import { FileReference } from '$lib/storage/FileReference';

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
    const sessionMessages = (context.session?.state ?? []) as ResponseInput;
    const newMessages = (await conversationToOpenAI(conversation)) satisfies EasyInputMessage[];
    const input = [...sessionMessages, ...newMessages] satisfies ResponseInput;

    const request = {
      model: this.model,
      include: ['reasoning.encrypted_content'],
      ...this.request,
      // Override to always stream and pass latest input
      store: false,
      stream: true,
      input,
    } satisfies OpenAI.Responses.ResponseCreateParamsStreaming;

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
          if (chunk.type === 'response.output_item.done') {
            // Ignore type message, since we yield the delta directly
            // TODO handle type=message, part.type=refusal
            if (chunk.item.type !== 'message') {
              const output = convertOutputItem(chunk.item);
              if (output) {
                yield {
                  type: 'append',
                  output,
                } satisfies ModelUpdate;
              }
            }
          }
          if (chunk.type === 'response.output_text.delta') {
            yield chunk.delta;
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
          session: {
            state: [...input, ...chunk.response.output] satisfies ResponseInput,
          },
        };
      },
    };
  }

  extractOutput(response: unknown) {
    if (!isResponse(response)) {
      throw new Error('Unexpected response format');
    }

    return response.response.output
      .map((item) => {
        const output = convertOutputItem(item);
        if (output instanceof FileReference) {
          return output.file;
        }
        return output;
      })
      .filter((item) => item !== null);
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

function convertOutputItem(item: OpenAI.Responses.ResponseOutputItem): ProviderOutputPart | null {
  if (item.type === 'message') {
    return item.content
      .filter((c) => c.type === 'output_text') // TODO handle refusal too
      .flatMap((c) => c.text) // TODO handle annotations too
      .join('');
  } else if (item.type === 'reasoning') {
    return {
      type: 'meta',
      title: 'Reasoning',
      icon: 'thinking',
      message: item.summary.map((s) => s.text).join('\n'),
    };
  } else if (item.type === 'web_search_call') {
    const action = (item as unknown as WebSearchCall).action;
    return {
      type: 'meta',
      title: 'Web Search',
      icon: 'search',
      message: summarizeSearchAction(action),
    };
  }
  return null;
}

interface WebSearchCall {
  action:
    | ResponseFunctionWebSearch.Search
    | ResponseFunctionWebSearch.OpenPage
    | ResponseFunctionWebSearch.Find;
}
function summarizeSearchAction(action: WebSearchCall['action']): string {
  if (action.type === 'search') {
    const sources = action.sources?.map((source) => source.url).join(', ') ?? 'the web';
    return `Searching for "${action.query}" across ${sources}`;
  } else if (action.type === 'open_page') {
    return `Opening page ${action.url}`;
  } else {
    return `Finding "${action.pattern}" on page ${action.url}`;
  }
}
