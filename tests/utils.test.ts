import { expect, test } from '@playwright/test';

test.describe('CodeSandbox', () => {
	test('Code', async ({ page }) => {
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
});
