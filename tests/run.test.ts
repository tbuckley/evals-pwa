import { expect, test } from '@playwright/test';
import { chooseDirectory } from './utils';

test.describe('running a configuration', () => {
  test('can limit how many tests run', async ({ page }) => {
    await chooseDirectory(page, '../examples/testonly');

    // Ensure no error dialog is visible
    await expect(page.locator('#alert-dialog')).toHaveCount(0);

    // Check the dashboard
    await page.getByText('Dashboard').click();
    await page.waitForLoadState('networkidle');

    // Run the tests
    await page.locator('button', { hasText: 'Run tests' }).click();

    // Expect only the two tests marked `only`
    await expect(page.locator('tbody tr')).toHaveCount(2 + 1);
  });
});
