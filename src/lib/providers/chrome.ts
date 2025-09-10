import type { ConversationPrompt, ModelProvider, ModelUpdate, TokenUsage } from '$lib/types';
import { generator } from '$lib/utils/generator';
import { conversationToSinglePrompt } from './legacyProvider';

declare global {
  interface Window {
    // https://developer.chrome.com/docs/ai/prompt-api
    LanguageModel?: {
      availability?: () =>
        | Promise<'no' | 'readily' | 'after-download'>
        | 'no'
        | 'readily'
        | 'after-download';
      create: (opts?: CreateOptions) => Promise<PromptSession>;
    };
  }
}

interface CreateOptions {
  monitor?: (m: EventTarget) => void;
}

interface PromptSession {
  prompt(prompt: string): Promise<string>;
  promptStreaming(prompt: string): AsyncGenerator<string>;
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
        if (!window.LanguageModel) {
          throw new Error('window.LanguageModel not supported in this browser');
        }

        const availability = await window.LanguageModel.availability?.();
        if (availability === 'no') {
          throw new Error('Language model is unavailable on this browser');
        }
        const progress = generator<ProgressEvent, null>();
        const create = window.LanguageModel.create({
          monitor(m) {
            m.addEventListener('downloadprogress', (e) => {
              progress.yield(e as ProgressEvent);
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
        for await (const chunk of session.promptStreaming(input)) {
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
