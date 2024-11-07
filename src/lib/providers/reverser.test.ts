import { describe, test, expect } from 'vitest';
import { ReverserProvider } from './reverser';

describe('ReverserProvider', () => {
  test('reverses its input', async function () {
    const provider = new ReverserProvider();
    const resp = provider.run([{ role: 'user', content: [{ text: 'hello' }] }]);
    let next;
    do {
      next = await resp.next();
    } while (!next.done);
    const output = provider.extractOutput(next.value);
    expect(output).toBe('olleh');
  });
  test('supports multi-part', async function () {
    const provider = new ReverserProvider();
    const resp = provider.run([
      {
        role: 'user',
        content: [{ text: 'hello' }, { file: new File([], 'foo.png') }, { text: 'world' }],
      },
    ]);
    let next;
    do {
      next = await resp.next();
    } while (!next.done);
    const output = provider.extractOutput(next.value);
    expect(output).toBe('dlrow\nolleh');
  });
});
