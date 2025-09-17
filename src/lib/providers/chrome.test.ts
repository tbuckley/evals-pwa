import { describe, test, expect, vi } from 'vitest';
import { ChromeProvider } from './chrome';
import type { ConversationPrompt, RunContext } from '$lib/types';

describe('ChromeProvider', () => {
  test('passes responseConstraint option to promptStreaming', async () => {
    const schema = { type: 'object', properties: { rating: { type: 'number' } }, required: ['rating'] };
    const provider = new ChromeProvider({ responseConstraint: schema });

    const promptOptions: unknown[] = [];
    const mockModel = {
      promptStreaming: vi.fn(async function* (_messages: unknown, options: unknown) {
        promptOptions.push(options);
        yield 'hi';
      }),
    };

    const createMock = vi.fn(async (options: any) => {
      if (options.monitor) {
        options.monitor({ addEventListener: () => {} });
      }
      return mockModel;
    });
    const availabilityMock = vi.fn(async () => 'available');

    const globalObj = globalThis as any;
    const originalLanguageModel = globalObj.LanguageModel;
    globalObj.LanguageModel = {
      availability: availabilityMock,
      create: createMock,
    };

    try {
      const conversation: ConversationPrompt = [
        { role: 'user', content: [{ text: 'Hello' }] },
      ];
      const context: RunContext = { abortSignal: new AbortController().signal } as RunContext;
      const { runModel } = await provider.run(conversation, context);
      for await (const _ of runModel()) {
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
    const options = promptOptions[0] as Record<string, unknown>;
    expect(options.responseConstraint).toBe(schema);
  });
});
