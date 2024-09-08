import { describe, test, expect } from 'vitest';
import { HandlebarsPromptFormatter } from './HandlebarsPromptFormatter';
import { FileReference } from '$lib/storage/FileReference';

describe('HandlebarsPromptFormatter', () => {
	test('substitutes variables', async function () {
		const formatter = new HandlebarsPromptFormatter('Hello, {{ target }}!');
		const output = formatter.format({ target: 'world' });
		expect(output).toEqual([{ text: 'Hello, world!' }]);
	});
	test('does not escape apostrophes', async function () {
		const formatter = new HandlebarsPromptFormatter('Hello, {{ target }}!');
		const output = formatter.format({ target: "all the world's people" });
		expect(output).toEqual([{ text: "Hello, all the world's people!" }]);
	});
	test('replaces images', async function () {
		const formatter = new HandlebarsPromptFormatter('Here is an image: {{ image }} What is this?');
		const image = new FileReference('file:///image.png', new File([], 'image.png'));
		const output = formatter.format({ image });
		expect(output).toEqual([
			{ text: 'Here is an image: ' },
			{ image: image.file },
			{ text: ' What is this?' }
		]);
	});
	test('supports nested objects', async function () {
		const formatter = new HandlebarsPromptFormatter(
			'Here is an image: {{#each foo}}{{ this.image }}{{/each}} What is {{ bar.baz }}?'
		);
		const imageA = new FileReference('file:///imageA.png', new File([], 'imageA.png'));
		const imageB = new FileReference('file:///imageB.png', new File([], 'imageB.png'));
		const output = formatter.format({
			foo: [{ image: imageA }, { image: imageB }],
			bar: { baz: 'this' }
		});
		expect(output).toEqual([
			{ text: 'Here is an image: ' },
			{ image: imageA.file },
			{ image: imageB.file },
			{ text: ' What is this?' }
		]);
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
