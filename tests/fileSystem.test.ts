import { expect, test } from '@playwright/test';
import { chooseDirectory } from './utils';

test.describe('File System', () => {
	test('loads examples/fake without errors', async ({ page }) => {
		await chooseDirectory(page, '../examples/fake');

		// Ensure no error dialog is visible
		await expect(page.locator('#alert-dialog')).toHaveCount(0);

		// Check the configuration
		await page.getByText('Configuration').click();
		await page.waitForLoadState('networkidle');

		const lines = [
			'Fake test suite',
			'reverser:whatever',
			'Hello, {{word}}!',
			'The word: {{word}}',
			'Contains the reversed word',
			'Matches a regex',
			'Equals a value',
			'javascript',
			'function execute(output)'
		];
		for (const line of lines) {
			await expect(page.locator('pre')).toContainText(line);
		}
	});
});
