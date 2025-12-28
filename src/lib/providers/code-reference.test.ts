import { afterEach, describe, expect, test } from 'vitest';
import { CodeReference } from '$lib/storage/CodeReference';
import type { ConversationPrompt } from '$lib/types';
import * as CodeSandbox from '$lib/utils/CodeSandbox';
import { CodeReferenceProvider, getCodeProviderEnv } from './code-reference';

describe('CodeReferenceProvider', () => {
  afterEach(async () => {
    await CodeSandbox.clear();
  });

  test('runs prepare and run exports', async () => {
    const code = `
      export async function prepare(prompt, { env, config }) {
        return { prompt, token: env.TOKEN, suffix: config.suffix };
      }

      export async function run(key) {
        const text = key.prompt[0].content[0].text;
        return \`prepared:\${text}:\${key.token}:\${key.suffix}\`;
      }
    `;
    const file = new File([code], 'provider.js', { type: 'application/javascript' });
    const ref = new CodeReference('file:///provider.js', file);
    const provider = new CodeReferenceProvider(ref, { TOKEN: 'secret' }, { suffix: 'done' });
    const conversation: ConversationPrompt = [{ role: 'user', content: [{ text: 'hi' }] }];

    const { runModel } = await provider.run(conversation, {
      abortSignal: new AbortController().signal,
    });
    const resp = runModel();

    let next;
    do {
      next = await resp.next();
    } while (!next.done);

    const output = provider.extractOutput(next.value.response);
    expect(output).toBe('prepared:hi:secret:done');
  });

  test('reads exported env variables', async () => {
    const code = `
      export const env = ['FOO', 'BAR'];
    `;
    const file = new File([code], 'provider.js', { type: 'application/javascript' });
    const ref = new CodeReference('file:///provider.js', file);

    const env = await getCodeProviderEnv(ref);
    expect(env).toEqual(['FOO', 'BAR']);
  });
});
