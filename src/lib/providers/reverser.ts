import type { ConversationPrompt, ModelProvider, TokenUsage } from '$lib/types';
import { conversationToSinglePrompt } from './legacyProvider';

export class ReverserProvider implements ModelProvider {
  async *run(conversation: ConversationPrompt) {
    const prompt = conversationToSinglePrompt(conversation);

    yield await Promise.resolve('');
    const textParts = prompt.filter((part) => 'text' in part) as { text: string }[];
    const text = textParts.map((part) => part.text).join('\n');
    return { reversed: reverseString(text) };
  }

  extractOutput(response: unknown): string {
    if (
      typeof response === 'object' &&
      response !== null &&
      'reversed' in response &&
      typeof response.reversed === 'string'
    ) {
      return response.reversed;
    }
    throw new Error('Unexpected output format');
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

function reverseString(str: string): string {
  return str.split('').reverse().join('');
}
