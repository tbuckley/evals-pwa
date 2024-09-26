import { expect, test } from '@playwright/test';
import { chooseDirectory } from './utils';

test.describe('UI', () => {
  test('can switch between runs', async ({ page }) => {
    await chooseDirectory(page, '../examples/fake');

    // Ensure no error dialog is visible
    await expect(page.locator('#alert-dialog')).toHaveCount(0);

    // Check the dashboard
    await page.getByText('Dashboard').click();
    await page.waitForLoadState('networkidle');

    // Check header
    await expect(page.locator('h2')).toContainText('Another fake test suite');

    // Switch pagepage
    const btn = page.locator('button', { hasText: /Another fake test suite/ });
    await expect(btn).toHaveCount(1);
    await btn.click();

    const other = page.getByText(/First fake test suite/);
    await expect(other).toHaveCount(1);
    await other.click();

    // Check header has changed
    await expect(page.locator('h2')).toContainText('First fake test suite');
  });
});
