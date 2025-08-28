import type { ConversationPrompt, ModelProvider, TokenUsage } from '$lib/types';
import { conversationToSinglePrompt } from './legacyProvider';
import { z } from 'zod';

const validSchema = z.object({
  prompt: z.array(z.union([z.string(), z.instanceof(Blob)])),
});

export class EchoProvider implements ModelProvider {
  constructor(private readonly model: string) {}

  get id(): string {
    return `echo:${this.model}`;
  }

  run(conversation: ConversationPrompt) {
    const prompt = conversationToSinglePrompt(conversation).map((part) => {
      if ('text' in part) {
        return part.text;
      }
      if ('file' in part) {
        return part.file;
      }
      throw new Error('Invalid Echo prompt, must only contain text and files');
    });

    return {
      request: { input: prompt },
      // eslint-disable-next-line @typescript-eslint/require-await
      runModel: async function* () {
        yield '';
        return { response: { prompt } };
      },
    };
  }

  extractOutput(response: unknown): (string | Blob)[] {
    const validated = validSchema.parse(response);
    return validated.prompt;
  }

  extractTokenUsage(): TokenUsage {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costDollars: 0,
    };
  }
}
