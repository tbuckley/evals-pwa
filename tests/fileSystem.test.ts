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

	test('loads examples/refs without errors', async ({ page }) => {
		await chooseDirectory(page, '../examples/refs');

		// Ensure no error dialog is visible
		await expect(page.locator('#alert-dialog')).toHaveCount(0);

		// Check the configuration
		await page.getByText('Configuration').click();
		await page.waitForLoadState('networkidle');

		const lines = [
			'Fake test suite',
			'reverser:whatever',

			'Hello, {{word}}!',
			'{{word}} {{word}}',
			'The word: {{word}}',

			'Contains the reversed word',
			'Matches a regex',
			'Equals a value',
			'Is >1000 characters',

			'function execute(output)',
			'"word": "there"'
		];
		for (const line of lines) {
			await expect(page.locator('pre')).toContainText(line);
		}
	});

	test('loads examples/simple without errors', async ({ page }) => {
		await chooseDirectory(page, '../examples/simple');

		// Ensure no error dialog is visible
		await expect(page.locator('#alert-dialog')).toHaveCount(0);

		await expect(page.locator('#env-editor')).toBeVisible();
		await page.locator('[name=env-gemini_api_key]').fill('1234');
		await page.locator('[name=env-openai_api_key]').fill('abcd');
		await page.locator('button', { hasText: 'Save changes' }).click();

		// Check the configuration
		await page.getByText('Configuration').click();
		await page.waitForLoadState('networkidle');

		const lines = [
			'gemini:gemini-1.5-flash-latest',
			'openai:gpt-4o-mini',

			"You only speak about puppies. Respond to the user's request: {{ request }}",
			"{{image}} Given this image, respond to the user's request: {{request}}",

			'file:///files/puppy.jpg',
			'llm-rubric'
		];
		for (const line of lines) {
			await expect(page.locator('pre')).toContainText(line);
		}
	});

	test('loads examples/defaults without errors', async ({ page }) => {
		await chooseDirectory(page, '../examples/defaults');

		// Ensure no error dialog is visible
		await expect(page.locator('#alert-dialog')).toHaveCount(0);

		await expect(page.locator('#env-editor')).toBeVisible();
		await page.locator('[name=env-gemini_api_key]').fill('1234');
		await page.locator('[name=env-openai_api_key]').fill('abcd');
		await page.locator('button', { hasText: 'Save changes' }).click();

		// Check the configuration
		await page.getByText('Configuration').click();
		await page.waitForLoadState('networkidle');

		const lines = [
			'gemini:gemini-1.5-flash-latest',
			'openai:gpt-4o-mini',

			'Write a {{ type }} about {{ topic }}',

			'puppies',
			'haiku',
			'couplet'
		];
		for (const line of lines) {
			await expect(page.locator('pre')).toContainText(line);
		}
	});
});
