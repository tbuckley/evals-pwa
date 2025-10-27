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

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const AUDIO_MIME_TYPES = ['audio/wav', 'audio/mp3', 'audio/ogg', 'audio/flac'];

const expectedInputSchema = z
  .object({
    type: z.enum(['text', 'image', 'audio']),
  })
  .passthrough();

function deriveMimeTypesFromExpectedInputs(expectedInputs: LanguageModelExpected[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  const pushUnique = (mime: string) => {
    if (seen.has(mime)) return;
    seen.add(mime);
    result.push(mime);
  };

  for (const input of expectedInputs) {
    if (input.type === 'image') {
      IMAGE_MIME_TYPES.forEach(pushUnique);
    } else if (input.type === 'audio') {
      AUDIO_MIME_TYPES.forEach(pushUnique);
    }
  }

  return result;
}

const DEFAULT_EXPECTED_INPUTS: LanguageModelExpected[] = [{ type: 'text' }];

const configSchema = normalizedProviderConfigSchema
  .extend({
    expectedInputs: z.array(expectedInputSchema).optional(),
    responseConstraint: z.record(z.unknown()).optional(),
    omitResponseConstraintInput: z.boolean().optional(),
  })
  .passthrough();
export type ChromeConfig = NormalizedProviderConfig & {
  responseConstraint?: Record<string, unknown>;
  omitResponseConstraintInput?: boolean;
  expectedInputs?: LanguageModelExpected[];
};

export class ChromeProvider implements ModelProvider {
  readonly id = 'chrome:ai';

  mimeTypes: string[];
  private readonly expectedInputs: LanguageModelExpected[];
  private promptOptions?: LanguageModelPromptOptions;

  constructor(config: ChromeConfig = {}) {
    const { mimeTypes, expectedInputs, responseConstraint, omitResponseConstraintInput } =
      configSchema.parse(config);

    const resolvedExpectedInputs: LanguageModelExpected[] =
      expectedInputs && expectedInputs.length > 0 ? expectedInputs : DEFAULT_EXPECTED_INPUTS;
    this.expectedInputs = resolvedExpectedInputs;
    const derivedMimeTypes = deriveMimeTypesFromExpectedInputs(resolvedExpectedInputs);
    this.mimeTypes = mimeTypes ?? derivedMimeTypes;

    if (responseConstraint !== undefined || omitResponseConstraintInput !== undefined) {
      this.promptOptions = {
        responseConstraint,
        omitResponseConstraintInput,
      };
    }
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
    const request = await createKey(newState.messages);
    const promptOptions = this.promptOptions;
    const expectedInputs = this.expectedInputs;
    (request as Record<string, unknown>).promptOptions = { ...promptOptions };

    return {
      options: this.promptOptions,
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
            expectedInputs,
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
        const options: LanguageModelPromptOptions = {
          ...promptOptions,
          signal: context.abortSignal,
        };
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
