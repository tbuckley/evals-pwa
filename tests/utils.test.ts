import { expect, test } from '@playwright/test';

test.describe('CodeSandbox', () => {
	test('can run code', async ({ page }) => {
		await page.goto('/__playwright');
		await page.waitForLoadState('networkidle');

		await expect(page.locator('iframe')).toHaveCount(0);
		const sandboxHandle = await page.evaluateHandle(() => {
			const sandbox = new window.__dev.CodeSandbox('function execute(a, b) { return a + b; }');
			return sandbox;
		});
		await expect(page.locator('iframe')).toHaveCount(1);

		const res = await page.evaluate(async (sandbox) => await sandbox.execute(1, 2), sandboxHandle);
		expect(res).toBe(3);

		await page.evaluate((sandbox) => sandbox.destroy(), sandboxHandle);
		await expect(page.locator('iframe')).toHaveCount(0);
	});

	test('supports module imports', async ({ page }) => {
		await page.goto('/__playwright');
		await page.waitForLoadState('networkidle');

		const sandboxHandle = await page.evaluateHandle(() => {
			const sandbox = new window.__dev.CodeSandbox(`
				import _ from 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/+esm';

				function execute(arr) { return _.uniq(arr); }
			`);
			return sandbox;
		});

		const res = await page.evaluate(
			async (sandbox) => await sandbox.execute([1, 2, 1, 3, 2, 4]),
			sandboxHandle
		);
		expect(res).toEqual([1, 2, 3, 4]);

		await page.evaluate((sandbox) => sandbox.destroy(), sandboxHandle);
	});

	test('forwards any errors from the sandbox', async ({ page }) => {
		await page.goto('/__playwright');
		await page.waitForLoadState('networkidle');

		const sandboxHandle = await page.evaluateHandle(() => {
			const sandbox = new window.__dev.CodeSandbox(`
				function execute(arr) { throw new Error('This is a test error'); }
			`);
			return sandbox;
		});

		try {
			await page.evaluate(async (sandbox) => await sandbox.execute('test'), sandboxHandle);
			throw new Error('The expected error was not thrown');
		} catch (e) {
			expect(e).toBeInstanceOf(Error);
			expect((e as Error).message).toContain('This is a test error');
		}

		await page.evaluate((sandbox) => sandbox.destroy(), sandboxHandle);
	});
});
