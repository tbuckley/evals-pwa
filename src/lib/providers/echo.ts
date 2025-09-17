import {
  metaProviderOutputPartSchema,
  type ConversationPrompt,
  type ExtractedOutputPart,
  type ModelProvider,
  type RunContext,
  type TokenUsage,
} from '$lib/types';
import { conversationToSinglePrompt } from './legacyProvider';
import { z } from 'zod';

const validSchema = z.object({
  prompt: z.array(z.union([z.string(), z.instanceof(Blob), metaProviderOutputPartSchema])),
});

const functionCallSchema = z.object({
  type: z.literal('function-call'),
  name: z.string(),
  args: z.record(z.unknown()),
});

export class EchoProvider implements ModelProvider {
  constructor(private readonly model: string) {}

  get id(): string {
    return `echo:${this.model}`;
  }

  run(conversation: ConversationPrompt, context: RunContext) {
    const oldPrompt = (context.session?.state ?? []) as ExtractedOutputPart[];
    let newPrompt: ExtractedOutputPart[] = conversationToSinglePrompt(conversation).map((part) => {
      if ('text' in part) {
        return part.text;
      }
      if ('file' in part) {
        return part.file;
      }
      if (part.type === 'function-response') {
        return JSON.stringify(part.response ?? {});
      }
      throw new Error('Invalid Echo prompt, must only contain text and files');
    });

    if (newPrompt.length === 1 && typeof newPrompt[0] === 'string') {
      try {
        // Try parsing as function calls
        const functionCalls = z.array(functionCallSchema).parse(JSON.parse(newPrompt[0]));
        newPrompt = functionCalls;
      } catch {
        // Do nothing
      }
    }

    // Join strings together
    const prompt = oldPrompt.filter(
      (p) => typeof p !== 'object' || !('type' in p) || p.type !== 'function-call',
    );
    for (const part of newPrompt) {
      const lastPart = prompt.at(-1);
      if (typeof lastPart === 'string' && typeof part === 'string') {
        prompt[prompt.length - 1] = lastPart + part;
      } else {
        prompt.push(part);
      }
    }

    return {
      request: { input: prompt },
      // eslint-disable-next-line @typescript-eslint/require-await
      runModel: async function* () {
        yield '';
        return { response: { prompt }, session: { state: prompt } };
      },
    };
  }

  extractOutput(response: unknown): (string | Blob | ExtractedOutputPart)[] {
    const validated = validSchema.parse(response);
    return [
      ...validated.prompt,
      {
        type: 'meta',
        title: 'Finish Reason',
        icon: 'other',
        message: 'SUCCESS',
      },
    ];
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
