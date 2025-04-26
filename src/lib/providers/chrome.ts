import type { ConversationPrompt, ModelProvider, ModelUpdate, TokenUsage } from '$lib/types';
import { generator } from '$lib/utils/generator';
import { conversationToSinglePrompt } from './legacyProvider';

interface LanguageModelOptions {
  monitor?: (m: EventTarget) => void;
}

interface LanguageModel {
  create(createOptions?: LanguageModelOptions): Promise<Session>;
}

interface Session {
  prompt(prompt: string): Promise<string>;
  promptStreaming(prompt: string): AsyncGenerator<string>;
}

declare global {
  interface Window {
    ai?: {
      languageModel: LanguageModel;
    };
  }
}

export class ChromeProvider implements ModelProvider {
  readonly id = 'chrome:ai';

  run(conversation: ConversationPrompt) {
    const prompt = conversationToSinglePrompt(conversation);
    const input = prompt.map((part) => ('text' in part ? part.text : '')).join('\n');

    const request = {
      input,
    };

    return {
      request,
      runModel: async function* () {
        yield '';
        if (!window.ai?.languageModel) {
          throw new Error('window.ai.languageModel not supported in this browser');
        }
        const progress = generator<ProgressEvent, null>();
        const create = window.ai.languageModel
          .create({
            monitor(m) {
              m.addEventListener('downloadprogress', (e) => {
                progress.yield(e as ProgressEvent);
              });
            },
          })
          .then((session) => {
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
        for await (const chunk of session.promptStreaming(input)) {
          yield chunk.substring(reply.length);
          reply = chunk;
        }
        return reply;
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
