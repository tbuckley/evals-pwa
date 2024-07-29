import { describe, test, expect } from 'vitest';
import { AssertionManager } from './AssertionManager';

describe('AssertionManager', () => {
	test('substitutes variables', async function () {
		const mgr = new AssertionManager();
		const assertion = mgr.getAssertion(
			{ type: 'icontains', vars: { needle: '{{ target }}' } },
			{ target: 'world' }
		);
		const res = await assertion.run('Hello, world!');
		expect(res.pass).toBe(true);

		const res2 = await assertion.run('Hello, there!');
		expect(res2.pass).toBe(false);
	});
	test('does not escape apostrophes', async function () {
		const mgr = new AssertionManager();
		const assertion = mgr.getAssertion(
			{ type: 'icontains', vars: { needle: '{{ target }}' } },
			{ target: "all the world's people" }
		);
		const res = await assertion.run("Hello, all the world's people!");
		expect(res.pass).toBe(true);
	});
	test('supports equals with a string', async function () {
		const mgr = new AssertionManager();
		const assertion = mgr.getAssertion({ type: 'equals', vars: { value: 'Hello, world!' } }, {});
		const res1 = await assertion.run('Hello, world!');
		expect(res1.pass).toBe(true);

		const res2 = await assertion.run('Hello!');
		expect(res2.pass).toBe(false);
	});
	test('supports case-insensitive equals with a string', async function () {
		const mgr = new AssertionManager();
		const assertion = mgr.getAssertion(
			{ type: 'equals', vars: { value: 'Hello, world!', ignoreCase: true } },
			{}
		);
		const res1 = await assertion.run('hello, world!');
		expect(res1.pass).toBe(true);

		const res2 = await assertion.run('hello!');
		expect(res2.pass).toBe(false);
	});
});
