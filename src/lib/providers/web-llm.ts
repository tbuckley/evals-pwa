import {
  type InitProgressReport,
  type ChatCompletionMessageParam,
  type CompletionUsage,
  CreateWebWorkerMLCEngine,
  type WebWorkerMLCEngine,
  prebuiltAppConfig,
  type ModelRecord,
} from '@mlc-ai/web-llm';
import type {
  ConversationPrompt,
  ModelProvider,
  ModelUpdate,
  RunContext,
  TokenUsage,
} from '$lib/types';
import { cast } from '$lib/utils/asserts';
import { multiPartPromptToOpenAI } from './openai';
import { generator } from '$lib/utils/generator';
import { conversationToSinglePrompt } from './legacyProvider';

interface Response {
  reply: string;
  usage?: CompletionUsage;
}

const cache = new Map<
  string,
  {
    refCount: number;
    load: Promise<WebWorkerMLCEngine>;
  }
>();

export class WebLlm implements ModelProvider {
  #modelRecord: ModelRecord;
  constructor(public model: string) {
    const record = prebuiltAppConfig.model_list.find((entry) => entry.model_id === model);
    if (!record) {
      throw new Error(`Unknown model: ${model}`);
    }
    this.#modelRecord = record;
  }

  get id(): string {
    return `web-llm:${this.model}`;
  }

  mimeTypes = [
    // Image
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
  ];

  async *run(conversation: ConversationPrompt, context: RunContext) {
    const prompt = conversationToSinglePrompt(conversation);

    const progress = generator<InitProgressReport>();
    let cacheEntry;
    let engine;
    try {
      if (!cache.has(this.model)) {
        const worker = new Worker(new URL('./web-llm.worker.ts', import.meta.url), {
          type: 'module',
        });
        const load = CreateWebWorkerMLCEngine(worker, this.model, {
          initProgressCallback: (report) => {
            progress.yield(report);
          },
        }).then((engine) => {
          progress.return();
          return engine;
        });
        cacheEntry = { refCount: 1, load };
        cache.set(this.model, cacheEntry);
        for await (const report of progress.generator) {
          yield { type: 'replace', output: report.text } as ModelUpdate;
        }
      } else {
        cacheEntry = cast(cache.get(this.model));
        cacheEntry.refCount++;
      }
      engine = await cacheEntry.load;
      const content =
        // eslint-disable-next-line -- ModelType can't be imported...
        this.#modelRecord.model_type === 2 /* VLM */
          ? await Promise.all(prompt.map(multiPartPromptToOpenAI))
          : prompt.map((part) => ('text' in part ? part.text : '')).join('\n');
      const messages: ChatCompletionMessageParam[] = [
        // { role: 'system', content: 'You are a helpful AI assistant.' },
        { role: 'user', content },
      ];

      const chunks = await engine.chat.completions.create({
        messages,
        stream: true,
        stream_options: { include_usage: true },
      });
      yield { type: 'replace', output: '' } as ModelUpdate;
      let reply = '';
      let usage: CompletionUsage | undefined;
      for await (const chunk of chunks) {
        if (context.abortSignal.aborted) {
          return {
            reply,
          };
        }
        const delta = chunk.choices[0]?.delta.content ?? '';
        yield delta;
        reply += delta;
        if (chunk.usage) {
          usage = chunk.usage;
        }
      }
      return {
        reply,
        usage,
      } as Response;
    } finally {
      if (cacheEntry) {
        cacheEntry.refCount--;
        if (cacheEntry.refCount === 0) {
          cache.delete(this.model);
          await engine?.unload();
        }
      }
    }
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
