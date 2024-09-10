import { describe, expect, test } from 'vitest';
import { runGenerators } from './runGenerators';

describe('runGenerators', () => {
	test('returns a normal object untouched', async () => {
		const input = { a: 1, b: [2, 3], c: { d: 4 } };
		const ouput = await runGenerators(input);
		expect(ouput).toEqual(input);
	});
	test('runs generators on properties', async () => {
		const input = {
			property: {
				'=gen': `function execute() { return 'yes' }`
			}
		};
		const ouput = await runGenerators(input);
		expect(ouput).toMatchInlineSnapshot(`
			{
			  "property": "yes",
			}
		`);
	});
	test('runs generators in arrays', async () => {
		const input = [
			1,
			{
				'=gen': `function execute() { return 2 }`
			},
			3
		];
		const ouput = await runGenerators(input);
		expect(ouput).toMatchInlineSnapshot(`
			[
			  1,
			  2,
			  3,
			]
		`);
	});
	test('generators receive args', async () => {
		const input = {
			property: {
				'=gen': `function execute(...args) { return args }`,
				args: [1, 2, 3]
			}
		};
		const ouput = await runGenerators(input);
		expect(ouput).toMatchInlineSnapshot(`
			{
			  "property": [
			    1,
			    2,
			    3,
			  ],
			}
		`);
	});
	test('generators can splice into arrays', async () => {
		const input = [
			1,
			{
				'=gen': `function execute() { return [2, 3] }`
			},
			4
		];
		const ouput = await runGenerators(input);
		expect(ouput).toMatchInlineSnapshot(`
			[
			  1,
			  2,
			  3,
			  4,
			]
		`);
	});
	test('generators can spread into objects', async () => {
		const input = {
			'...': {
				'=gen': `function execute() { return {a: 1} }`
			}
		};
		const ouput = await runGenerators(input);
		expect(ouput).toMatchInlineSnapshot(`
			{
			  "a": 1,
			}
		`);
	});
	test('multiple generators can spread into the same object', async () => {
		const input = {
			'...': [
				{
					'=gen': `function execute() { return {a: 1} }`
				},
				{
					'=gen': `function execute() { return {b: 1} }`
				}
			]
		};
		const ouput = await runGenerators(input);
		expect(ouput).toMatchInlineSnapshot(`
			{
			  "a": 1,
			  "b": 1,
			}
		`);
	});
});
