import type {
  ConversationPrompt,
  ModelProvider,
  ModelUpdate,
  MultiPartPrompt,
  RunContext,
  TokenUsage,
} from '$lib/types';
import { cast } from '$lib/utils/asserts';
import { generator } from '$lib/utils/generator';
import { fileToBase64 } from '$lib/utils/media';

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

    const file = part.file;
    if (file.type.startsWith('image/') || file.type.startsWith('audio/')) {
      return { type: 'image', value: file };
    }

    return { type: 'text', value: `[file:${file.name}]` } as LanguageModelMessageContent;
  });
}

function convertConversation(conversation: ConversationPrompt) {
  const systemPart = conversation.find((part) => part.role === 'system');
  const systemMessage: LanguageModelSystemMessage | null = systemPart
    ? {
        role: 'system',
        content: convertContent(systemPart.content),
      }
    : null;
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

async function createKey(
  systemMessage: LanguageModelSystemMessage | null,
  messages: LanguageModelMessage[],
) {
  messages = await Promise.all(
    messages.map(async (message) => ({
      content: await createContentKey(message.content),
      role: message.role,
      prefix: message.prefix,
    })),
  );
  return {
    systemMessage,
    messages,
  };
}

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

  async run(conversation: ConversationPrompt, context: RunContext) {
    const { systemMessage, messages } = convertConversation(conversation);
    const request = await createKey(systemMessage, messages);
    const prompt = cast(messages.pop());

    return {
      request,
      runModel: async function* () {
        yield '';
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
          initialPrompts: systemMessage ? [systemMessage, ...messages] : messages,
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

        const session = await create;

        yield { type: 'replace', output: '' } as ModelUpdate;

        let reply = '';
        for await (const chunk of session.promptStreaming([prompt], {
          signal: context.abortSignal,
        })) {
          yield chunk;
          reply += chunk;
        }
        return { response: reply };
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
