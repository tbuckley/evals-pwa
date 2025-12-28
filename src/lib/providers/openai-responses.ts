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
import { decodeB64Blob, fileToBase64 } from '$lib/utils/media';
import { Semaphore } from '$lib/utils/semaphore';
import { z } from 'zod';
import { CHROME_CONCURRENT_REQUEST_LIMIT_PER_DOMAIN } from './common';
import OpenAI from 'openai';
import type {
  ResponseFunctionWebSearch,
  ResponseInput,
} from 'openai/resources/responses/responses.mjs';
import { getOpenaiCost } from './openai-completions';
import { FileReference } from '$lib/storage/FileReference';
import { blobToFileReference } from '$lib/storage/dereferenceFilePaths';

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
    const newMessages = (await conversationToOpenAI(
      conversation,
    )) satisfies OpenAI.Responses.ResponseInputItem[];
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
              const output = await convertOutputItem(chunk.item);
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
        if (chunk?.type !== 'response.completed') {
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

  async extractOutput(response: unknown) {
    if (!isResponse(response)) {
      throw new Error('Unexpected response format');
    }

    const outputs = await Promise.all(
      response.response.output.map(async (item) => {
        const output = await convertOutputItem(item);
        if (output instanceof FileReference) {
          return output.file;
        }
        return output;
      }),
    );
    return outputs.filter((item) => item !== null);
  }

  extractTokenUsage(response: unknown): TokenUsage {
    if (!isResponse(response)) {
      throw new Error('Unexpected response format');
    }
    const usage = response.response.usage;
    if (!usage) {
      return {};
    }

    const { input_tokens, output_tokens, total_tokens } = usage;
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
    console.error('Unsupported OpenAI Responses part', part);
    throw new Error('Unsupported part type');
  }
}

export type Message = OpenAI.Responses.ResponseInputItem;

const functionCallMetaSchema = z.object({
  call_id: z.string(),
});
type FunctionCallMeta = z.infer<typeof functionCallMetaSchema>;

async function conversationToOpenAI(conversation: ConversationPrompt): Promise<Message[]> {
  const messages = await Promise.all(
    conversation.map(async (part): Promise<Message[]> => {
      // If it's only function responses, return them as individual messages
      // TODO return function calls, and any other parts as a message
      if (part.content.every((p) => 'type' in p && p.type === 'function-response')) {
        return part.content.map((r) => {
          const meta = functionCallMetaSchema.safeParse(r.call.meta);
          if (!meta.success) {
            throw new Error('function call is missing call_id required for OpenAI');
          }
          return {
            type: 'function_call_output',
            call_id: meta.data.call_id,
            output: JSON.stringify(r.response),
          } satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
        });
      }
      // Return it as a single message
      return [
        {
          role: part.role,
          content: await Promise.all(part.content.map(multiPartPromptToOpenAIResponsesAPI)),
        },
      ];
    }),
  );
  return messages.flat();
}

const parsedResponseSchema = z.object({
  type: z.literal('response.completed'),
});
function isResponse(response: unknown): response is OpenAI.Responses.ResponseCompletedEvent {
  return parsedResponseSchema.safeParse(response).success;
}

async function convertOutputItem(
  item: OpenAI.Responses.ResponseOutputItem,
): Promise<ProviderOutputPart | null> {
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
  } else if (item.type === 'function_call') {
    return {
      type: 'function-call',
      name: item.name,
      args: JSON.parse(item.arguments),
      meta: {
        call_id: item.call_id,
      } satisfies FunctionCallMeta,
    };
  } else if (item.type === 'image_generation_call') {
    if (item.result) {
      const byteArray = decodeB64Blob(item.result);
      const blob = new Blob([byteArray], { type: 'image/png' });
      return blobToFileReference(blob);
    }
  } else if (item.type === 'code_interpreter_call') {
    return {
      type: 'meta',
      title: 'Code Interpreter',
      icon: 'code',
      message: (item.code ?? 'No code provided') + '\n\nOutputs not shown.',
      // TODO add item.outputs
    };
  } else if (item.type === 'computer_call') {
    return {
      type: 'meta',
      title: 'Computer Use',
      icon: 'code',
      message: JSON.stringify(
        {
          call_id: item.call_id,
          action: item.action,
          pending_safety_checks: item.pending_safety_checks,
        },
        null,
        2,
      ),
    };
  } else if (item.type === 'local_shell_call') {
    return {
      type: 'meta',
      title: 'Local Shell',
      icon: 'code',
      message: JSON.stringify(
        {
          call_id: item.call_id,
          action: item.action,
        },
        null,
        2,
      ),
    };
  } else if (item.type === 'file_search_call') {
    return {
      type: 'meta',
      title: 'File Search',
      icon: 'search',
      message: JSON.stringify(
        {
          queries: item.queries,
          results: item.results,
        },
        null,
        2,
      ),
    };
  } else if (item.type === 'custom_tool_call') {
    return {
      type: 'meta',
      title: 'Custom Tool',
      icon: 'code',
      message: JSON.stringify(
        {
          call_id: item.call_id,
          name: item.name,
          input: item.input,
        },
        null,
        2,
      ),
    };
  }
  // TODO handle MCP calls
  console.error('Unsupported OpenAI Responses item', item);
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
