import { describe, test, expect } from 'vitest';
import { HandlebarsPromptFormatter } from './HandlebarsPromptFormatter';
import { FileReference } from '$lib/storage/FileReference';
import type { ConversationPrompt, MultiPartPrompt } from '$lib/types';
import dedent from 'dedent';

describe('HandlebarsPromptFormatter', () => {
  test('substitutes variables', async function () {
    const formatter = new HandlebarsPromptFormatter('Hello, {{ target }}!');
    const output = await formatter.format({ target: 'world' });
    expect(output).toEqual(singleUserConversation([{ text: 'Hello, world!' }]));
  });
  test('does not escape apostrophes', async function () {
    const formatter = new HandlebarsPromptFormatter('Hello, {{ target }}!');
    const output = await formatter.format({ target: "all the world's people" });
    expect(output).toEqual(singleUserConversation([{ text: "Hello, all the world's people!" }]));
  });
  test('replaces images', async function () {
    const formatter = new HandlebarsPromptFormatter('Here is an image: {{ image }} What is this?');
    const image = new FileReference(
      'file:///image.png',
      new File([], 'image.png', { type: 'image/png' }),
    );
    const output = await formatter.format({ image }, ['image/png']);
    expect(output).toEqual(
      singleUserConversation([
        { text: 'Here is an image: ' },
        { file: image.file },
        { text: ' What is this?' },
      ]),
    );
  });
  test('supports nested objects', async function () {
    const formatter = new HandlebarsPromptFormatter(
      'Here is an image: {{#each foo}}{{ this.image }}{{/each}} What is {{ bar.baz }}?',
    );
    const imageA = new FileReference(
      'file:///imageA.png',
      new File([], 'imageA.png', { type: 'image/png' }),
    );
    const imageB = new FileReference(
      'file:///imageB.png',
      new File([], 'imageB.png', { type: 'image/png' }),
    );
    const output = await formatter.format(
      {
        foo: [{ image: imageA }, { image: imageB }],
        bar: { baz: 'this' },
      },
      ['image/png'],
    );
    expect(output).toEqual(
      singleUserConversation([
        { text: 'Here is an image: ' },
        { file: imageA.file },
        { file: imageB.file },
        { text: ' What is this?' },
      ]),
    );
  });
  test('tries converting unknown mime-types to strings', async function () {
    const formatter = new HandlebarsPromptFormatter('{{ image }} What is this?');
    const image = new FileReference(
      'file:///image.png',
      new File(['Hello there!'], 'image.foo', { type: 'image/foobar' }),
    );
    const output = await formatter.format({ image }, ['image/png']);
    expect(output).toEqual(singleUserConversation([{ text: 'Hello there! What is this?' }]));
  });

  // Conversations
  test('substitutes conversations with variables', async function () {
    const formatter = new HandlebarsPromptFormatter(dedent`
      - system: You are a penguin.
      - user: Hello, {{ target }}!
    `);
    const output = await formatter.format({ target: 'world' });
    expect(output).toEqual([
      { role: 'system', content: [{ text: 'You are a penguin.' }] },
      { role: 'user', content: [{ text: 'Hello, world!' }] },
    ]);
  });
  test('supports dynamic conversation lengths', async function () {
    const formatter = new HandlebarsPromptFormatter(dedent`
      - system: You are a penguin.
      {{#each messages}}
      - user: {{ this.prompt }}
      - assistant: {{ this.output }}
      {{/each}}
    `);
    const output = await formatter.format({
      messages: [
        { prompt: 'Hello, what are you?', output: 'A penguin' },
        { prompt: 'What are you doing today?', output: 'Waddling!' },
      ],
    });
    expect(output).toEqual([
      { role: 'system', content: [{ text: 'You are a penguin.' }] },
      { role: 'user', content: [{ text: 'Hello, what are you?' }] },
      { role: 'assistant', content: [{ text: 'A penguin' }] },
      { role: 'user', content: [{ text: 'What are you doing today?' }] },
      { role: 'assistant', content: [{ text: 'Waddling!' }] },
    ]);
  });

  // Errors
  test('throws an error for unsupported file types that are not valid utf-8', async function () {
    const formatter = new HandlebarsPromptFormatter('{{ image }} What is this?');

    const invalidUtf8ArrayBuffer = new Uint8Array([0x80]).buffer;
    const image = new FileReference(
      'file:///image.png',
      new File([invalidUtf8ArrayBuffer], 'image.foo', { type: 'image/foobar' }),
    );
    await expect(
      formatter.format({ image }, ['image/png']),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '[Error: Cannot read file file:///image.png: unsupported file type]',
    );
  });
  // test('supports handlebars syntax', async function () {
  //   const formatter = new HandlebarsPromptFormatter(
  //     'People: {{#each names}}{{@index}} {{this}},{{/each}}',
  //   );
  //   const output = formatter.format({
  //     names: ['Tom', 'Jerry'],
  //   });
  //   expect(output).toEqual([{ text: 'People: 0 Tom,1 Jerry,' }]);
  // });
});

function singleUserConversation(prompt: MultiPartPrompt): ConversationPrompt {
  return [{ role: 'user', content: prompt }];
}
