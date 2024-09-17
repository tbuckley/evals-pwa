import {
  CreateMLCEngine,
  type ChatCompletionMessageParam,
  type CompletionUsage,
} from '@mlc-ai/web-llm';
import type { ModelProvider, MultiPartPrompt, TokenUsage } from '$lib/types';

interface Response {
  reply: string;
  usage?: CompletionUsage;
}

export class WebLlm implements ModelProvider {
  constructor(public model: string) {}

  async *run(prompt: MultiPartPrompt) {
    yield '';
    const engine = await CreateMLCEngine(
      this.model,
      // TODO: allow providers to yield status in addition to deltas
      // { initProgressCallback: initProgressCallback },
    );
    const input = prompt.map((part) => ('text' in part ? part.text : '')).join('\n');
    const messages: ChatCompletionMessageParam[] = [
      // { role: 'system', content: 'You are a helpful AI assistant.' },
      { role: 'user', content: input },
    ];

    const chunks = await engine.chat.completions.create({
      messages,
      stream: true,
      stream_options: { include_usage: true },
    });
    let reply = '';
    let usage: CompletionUsage | undefined;
    for await (const chunk of chunks) {
      const delta = chunk.choices[0]?.delta.content ?? '';
      yield delta;
      reply += delta;
      if (chunk.usage) {
        usage = chunk.usage;
      }
    }
    // TODO: Can we cache/reuse the engine across prompts somehow?
    await engine.unload();
    return {
      reply,
      usage,
    } as Response;
  }

  extractOutput(response: unknown): string {
    return (response as Response).reply;
  }

  extractTokenUsage(response: unknown): TokenUsage {
    const usage = (response as Response).usage;
    return {
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
      costDollars: 0,
    };
  }
}
