import type { ModelProvider, MultiPartPrompt, TokenUsage } from '$lib/types';

interface Assistant {
  create(): Promise<Session>;
}

interface Session {
  prompt(prompt: string): Promise<string>;
  promptStreaming(prompt: string): AsyncGenerator<string>;
}

declare global {
  interface Window {
    ai?: {
      assistant: Assistant;
    };
  }
}

export class ChromeProvider implements ModelProvider {
  async *run(prompt: MultiPartPrompt) {
    yield '';
    if (!window.ai) {
      throw new Error('window.ai not supported in this browser');
    }
    const session = await window.ai.assistant.create();
    const input = prompt.map((part) => ('text' in part ? part.text : '')).join('\n');
    let reply = '';
    for await (const chunk of session.promptStreaming(input)) {
      yield chunk.substring(reply.length);
      reply = chunk;
    }
    return reply;
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
