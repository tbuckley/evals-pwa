import { expect, test } from '@playwright/test';

test.describe('CodeSandbox', () => {
	test('can run code', async ({ page }) => {
		await page.goto('/__playwright');

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
});
