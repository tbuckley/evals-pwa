import type {
  ConversationPrompt,
  ModelProvider,
  ModelUpdate,
  RunContext,
  TokenUsage,
} from '$lib/types';
import { generator } from '$lib/utils/generator';
import { conversationToSinglePrompt } from './legacyProvider';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface ReadableStream<R = any> {
    [Symbol.asyncIterator](): AsyncIterableIterator<R>;
  }
}

export class ChromeProvider implements ModelProvider {
  readonly id = 'chrome:ai';

  run(conversation: ConversationPrompt, context: RunContext) {
    const prompt = conversationToSinglePrompt(conversation);
    const input = prompt.map((part) => ('text' in part ? part.text : '')).join('\n');

    const request = {
      input,
    };

    return {
      request,
      runModel: async function* () {
        yield '';
        if (!('languageModel' in window)) {
          throw new Error('window.LanguageModel not supported in this browser');
        }

        const availability = await LanguageModel.availability();
        if (availability === 'unavailable') {
          throw new Error('Language model is unavailable on this browser');
        }
        const progress = generator<ProgressEvent, null>();
        const create = LanguageModel.create({
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
        for await (const chunk of session.promptStreaming(input, {
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
