import { describe, test, expect } from 'vitest';
import { HandlebarsPromptFormatter } from './HandlebarsPromptFormatter';

describe('HandlebarsPromptFormatter', () => {
	test('substitutes variables', async function () {
		const formatter = new HandlebarsPromptFormatter('Hello, {{ target }}!');
		const output = formatter.format({ target: 'world' });
		expect(output).toEqual([{ text: 'Hello, world!' }]);
	});
	test('returns JSON if valid', async function () {
		const formatter = new HandlebarsPromptFormatter(`[
            { "image": "{{ image }}" },
            { "text": "Do this: {{ request }}" }
        ]`);
		const output = formatter.format({ image: 'foo.png', request: 'transcribe' });
		expect(output).toEqual([{ image: 'foo.png' }, { text: 'Do this: transcribe' }]);
	});
	test('does not escape apostrophes', async function () {
		const formatter = new HandlebarsPromptFormatter('Hello, {{ target }}!');
		const output = formatter.format({ target: "all the world's people" });
		expect(output).toEqual([{ text: "Hello, all the world's people!" }]);
	});
});
