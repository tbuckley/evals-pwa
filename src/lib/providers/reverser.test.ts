/* eslint-disable @typescript-eslint/unbound-method */
import { describe, test, expect } from 'vitest';
import { ReverserProvider } from './reverser';

describe('ReverserProvider', () => {
  test('reverses its input', async function () {
    const provider = new ReverserProvider('whatever');
    const { runModel } = provider.run([{ role: 'user', content: [{ text: 'hello' }] }]);
    const resp = runModel();

    let next;
    do {
      next = await resp.next();
    } while (!next.done);
    const output = provider.extractOutput(next.value);
    expect(output).toBe('olleh');
  });
  test('supports multi-part', async function () {
    const provider = new ReverserProvider('whatever');
    const { runModel } = provider.run([
      {
        role: 'user',
        content: [{ text: 'hello' }, { file: new File([], 'foo.png') }, { text: 'world' }],
      },
    ]);
    const resp = runModel();

    let next;
    do {
      next = await resp.next();
    } while (!next.done);
    const output = provider.extractOutput(next.value);
    expect(output).toBe('dlrow\nolleh');
  });
});
