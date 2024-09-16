import { describe, test, expect } from 'vitest';
import { HandlebarsPromptFormatter } from './HandlebarsPromptFormatter';
import { FileReference } from '$lib/storage/FileReference';

describe('HandlebarsPromptFormatter', () => {
	test('substitutes variables', async function () {
		const formatter = new HandlebarsPromptFormatter('Hello, {{ target }}!');
		const output = await formatter.format({ target: 'world' });
		expect(output).toEqual([{ text: 'Hello, world!' }]);
	});
	test('does not escape apostrophes', async function () {
		const formatter = new HandlebarsPromptFormatter('Hello, {{ target }}!');
		const output = await formatter.format({ target: "all the world's people" });
		expect(output).toEqual([{ text: "Hello, all the world's people!" }]);
	});
	test('replaces images', async function () {
		const formatter = new HandlebarsPromptFormatter('Here is an image: {{ image }} What is this?');
		const image = new FileReference(
			'file:///image.png',
			new File([], 'image.png', { type: 'image/png' })
		);
		const output = await formatter.format({ image }, ['image/png']);
		expect(output).toEqual([
			{ text: 'Here is an image: ' },
			{ file: image.file },
			{ text: ' What is this?' }
		]);
	});
	test('supports nested objects', async function () {
		const formatter = new HandlebarsPromptFormatter(
			'Here is an image: {{#each foo}}{{ this.image }}{{/each}} What is {{ bar.baz }}?'
		);
		const imageA = new FileReference(
			'file:///imageA.png',
			new File([], 'imageA.png', { type: 'image/png' })
		);
		const imageB = new FileReference(
			'file:///imageB.png',
			new File([], 'imageB.png', { type: 'image/png' })
		);
		const output = await formatter.format(
			{
				foo: [{ image: imageA }, { image: imageB }],
				bar: { baz: 'this' }
			},
			['image/png']
		);
		expect(output).toEqual([
			{ text: 'Here is an image: ' },
			{ file: imageA.file },
			{ file: imageB.file },
			{ text: ' What is this?' }
		]);
	});
	test('tries converting unknown mime-types to strings', async function () {
		const formatter = new HandlebarsPromptFormatter('{{ image }} What is this?');
		const image = new FileReference(
			'file:///image.png',
			new File(['Hello there!'], 'image.foo', { type: 'image/foobar' })
		);
		const output = await formatter.format({ image }, ['image/png']);
		expect(output).toEqual([{ text: 'Hello there! What is this?' }]);
	});

	test('throws an error for unsupported file types that are not valid utf-8', async function () {
		const formatter = new HandlebarsPromptFormatter('{{ image }} What is this?');

		const invalidUtf8ArrayBuffer = new Uint8Array([0x80]).buffer;
		const image = new FileReference(
			'file:///image.png',
			new File([invalidUtf8ArrayBuffer], 'image.foo', { type: 'image/foobar' })
		);
		await expect(
			formatter.format({ image }, ['image/png'])
		).rejects.toThrowErrorMatchingInlineSnapshot(
			'[Error: Cannot read file file:///image.png: unsupported file type]'
		);
	});
	// test('supports handlebars syntax', async function () {
	// 	const formatter = new HandlebarsPromptFormatter(
	// 		'People: {{#each names}}{{@index}} {{this}},{{/each}}'
	// 	);
	// 	const output = formatter.format({
	// 		names: ['Tom', 'Jerry']
	// 	});
	// 	expect(output).toEqual([{ text: 'People: 0 Tom,1 Jerry,' }]);
	// });
});
