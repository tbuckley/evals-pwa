import { describe, test, expect, vi } from 'vitest';
import { ChromeProvider } from './chrome';
import type { ConversationPrompt, RunContext } from '$lib/types';

interface MockLanguageModel {
  promptStreaming: (
    messages: unknown,
    options?: LanguageModelPromptOptions,
  ) => ReadableStream<string>;
}

interface MockLanguageModelConstructor {
  availability: (options?: LanguageModelCreateCoreOptions) => Promise<Availability>;
  create: (options?: LanguageModelCreateOptions) => Promise<MockLanguageModel>;
}

describe('ChromeProvider', () => {
  test('passes responseConstraint option to promptStreaming', async () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: { rating: { type: 'number' } },
      required: ['rating'],
    };
    const provider = new ChromeProvider({ responseConstraint: schema });

    const promptOptions: (LanguageModelPromptOptions | undefined)[] = [];
    const promptStreaming = vi.fn<MockLanguageModel['promptStreaming']>((_messages, options) => {
      promptOptions.push(options);
      return new ReadableStream<string>({
        start(controller) {
          controller.enqueue('hi');
          controller.close();
        },
      });
    });
    const mockModel: MockLanguageModel = {
      promptStreaming,
    };

    const createMockImplementation: MockLanguageModelConstructor['create'] = (options) => {
      if (options?.monitor) {
        const monitor = new EventTarget() as CreateMonitor;
        monitor.ondownloadprogress = null;
        options.monitor(monitor);
      }
      return Promise.resolve(mockModel);
    };
    const createMock = vi.fn(createMockImplementation);

    const availabilityMockImplementation: MockLanguageModelConstructor['availability'] = () =>
      Promise.resolve('available');
    const availabilityMock = vi.fn(availabilityMockImplementation);

    const globalObj = globalThis as typeof globalThis & {
      LanguageModel?: MockLanguageModelConstructor;
    };
    const originalLanguageModel = globalObj.LanguageModel;
    globalObj.LanguageModel = {
      availability: availabilityMock,
      create: createMock,
    };

    try {
      const conversation: ConversationPrompt = [{ role: 'user', content: [{ text: 'Hello' }] }];
      const context: RunContext = { abortSignal: new AbortController().signal };
      const result = await provider.run(conversation, context);
      const generator = result.runModel();
      for await (const _chunk of generator) {
        // consume generator
      }
    } finally {
      if (originalLanguageModel === undefined) {
        delete globalObj.LanguageModel;
      } else {
        globalObj.LanguageModel = originalLanguageModel;
      }
    }

    expect(availabilityMock).toHaveBeenCalled();
    expect(createMock).toHaveBeenCalled();
    expect(mockModel.promptStreaming).toHaveBeenCalled();
    expect(promptOptions).toHaveLength(1);
    const [options] = promptOptions;
    expect(options?.responseConstraint).toStrictEqual(schema);
  });
});
