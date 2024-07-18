import { describe, test, expect } from 'vitest';
import { ReverserProvider } from './reverser';

describe('ReverserProvider', () => {
	test('reverses its input', async function () {
		const provider = new ReverserProvider();
		const resp = await provider.run([{ text: 'hello' }]);
		const output = provider.extractOutput(resp);
		expect(output).toBe('olleh');
	});
	test('supports multi-part', async function () {
		const provider = new ReverserProvider();
		const resp = await provider.run([
			{ text: 'hello' },
			{ image: new File([], 'foo.png') },
			{ text: 'world' }
		]);
		const output = provider.extractOutput(resp);
		expect(output).toBe('dlrow\nolleh');
	});
});
