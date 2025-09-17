import type {
  ConversationPrompt,
  ModelProvider,
  ModelUpdate,
  MultiPartPrompt,
  NormalizedProviderConfig,
  RunContext,
  TokenUsage,
} from '$lib/types';
import { normalizedProviderConfigSchema } from '$lib/types';
import { generator } from '$lib/utils/generator';
import { fileToBase64 } from '$lib/utils/media';
import { z } from 'zod';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface ReadableStream<R = any> {
    [Symbol.asyncIterator](): AsyncIterableIterator<R>;
  }
}

function convertContent(content: MultiPartPrompt): LanguageModelMessageContent[] {
  return content.map((part) => {
    if ('text' in part) {
      return { type: 'text', value: part.text };
    }
    if ('type' in part) {
      throw new Error('Function calls and responses are not supported');
    }

    const file = part.file;
    if (file.type.startsWith('image/') || file.type.startsWith('audio/')) {
      return { type: 'image', value: file };
    }

    return { type: 'text', value: `[file:${file.name}]` } as LanguageModelMessageContent;
  });
}

function convertConversation(conversation: ConversationPrompt) {
  const systemPart = conversation.find((part) => part.role === 'system');
  const systemMessage: LanguageModelSystemMessage | undefined = systemPart
    ? {
        role: 'system',
        content: convertContent(systemPart.content),
      }
    : undefined;
  const messages = conversation
    .map((part) => {
      if (part.role === 'system') return null;
      const contents = convertContent(part.content);

      return {
        role: part.role === 'assistant' ? 'assistant' : 'user',
        content: contents,
      } satisfies LanguageModelMessage;
    })
    .filter((m) => m !== null);
  return { systemMessage, messages };
}

async function createContentKey(content: string | LanguageModelMessageContent[]) {
  if (Array.isArray(content)) {
    return Promise.all(
      content.map(async (part) => {
        let value = part.value;
        if (value instanceof File) {
          value = await fileToBase64(value);
        }
        return {
          type: part.type,
          value,
        };
      }),
    );
  }
  return content;
}

async function createKey(messages: (LanguageModelSystemMessage | LanguageModelMessage)[]) {
  messages = await Promise.all(
    messages.map(async (message) => ({
      ...message,
      content: await createContentKey(message.content),
    })),
  );
  return {
    messages,
  };
}

interface SessionState {
  messages: (LanguageModelSystemMessage | LanguageModelMessage)[];
  model: LanguageModel;
}

const configSchema = normalizedProviderConfigSchema
  .extend({
    responseConstraint: z.unknown().optional(),
  })
  .passthrough();
export type ChromeConfig = NormalizedProviderConfig & {
  responseConstraint?: unknown;
};

export class ChromeProvider implements ModelProvider {
  readonly id = 'chrome:ai';

  mimeTypes = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',

    'audio/wav',
    'audio/mp3',
    'audio/ogg',
    'audio/flac',
  ];

  private responseConstraint?: unknown;

  constructor(config: ChromeConfig = {}) {
    const { mimeTypes, responseConstraint } = configSchema.parse(config);
    if (mimeTypes) {
      this.mimeTypes = mimeTypes;
    }
    this.responseConstraint = responseConstraint;
  }

  async run(conversation: ConversationPrompt, context: RunContext) {
    const state = context.session?.state as SessionState | undefined;
    let model = state?.model;

    const { systemMessage, messages } = convertConversation(conversation);
    if (state && systemMessage) {
      // TODO: support this, I think w would need to start a new `model` and
      // populate initial messages.
      throw new Error('Changing system message not implemented.');
    }
    const newState = {
      model,
      messages: [
        ...(state?.messages ?? []),
        ...(systemMessage ? [systemMessage] : []),
        ...messages,
      ],
    };
    const responseConstraint = this.responseConstraint;
    const request = await createKey(newState.messages);
    if (responseConstraint !== undefined) {
      (request as Record<string, unknown>).responseConstraint = responseConstraint;
    }

    return {
      request,
      runModel: async function* () {
        yield '';
        if (!model) {
          if (!('LanguageModel' in window)) {
            throw new Error('window.LanguageModel not supported in this browser');
          }

          const availability = await LanguageModel.availability();
          if (availability === 'unavailable') {
            throw new Error('Language model is unavailable on this browser');
          }
          const progress = generator<ProgressEvent, null>();
          const create = LanguageModel.create({
            expectedInputs: [{ type: 'text' }, { type: 'audio' }, { type: 'image' }],
            initialPrompts: systemMessage ? [systemMessage] : [],
            monitor(m) {
              m.addEventListener('downloadprogress', (e) => {
                progress.yield(e);
              });
            },
          }).then((session) => {
            progress.return(null);
            return session;
          });

          for await (const e of progress.generator) {
            yield {
              type: 'replace',
              output: `Downloaded ${e.loaded} of ${e.total} bytes.`,
            } as ModelUpdate;
          }

          model = await create;
        }

        yield { type: 'replace', output: '' } as ModelUpdate;

        let reply = '';
        const options: { signal: AbortSignal; responseConstraint?: unknown } = {
          signal: context.abortSignal,
        };
        if (responseConstraint !== undefined) {
          options.responseConstraint = responseConstraint;
        }
        for await (const chunk of model.promptStreaming(messages, options)) {
          yield chunk;
          reply += chunk;
        }
        return {
          response: reply,
          session: {
            state: {
              ...newState,
              model,
            } satisfies SessionState,
          },
        };
      },
    };
  }

  extractOutput(response: unknown): string {
    if (typeof response === 'string') {
      return response;
    }
    throw new Error('Unexpected output format');
  }

  extractTokenUsage(): TokenUsage {
    return {
      costDollars: 0,
    };
  }
}
