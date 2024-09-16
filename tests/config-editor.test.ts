import { expect, test } from '@playwright/test';

test.describe('Configuration editor', () => {
  test('does not error while in-progress', async ({ page }) => {
    await page.goto('/configuration');

    await page.locator('textarea').fill('providers');

    // Ensure no error dialog is visible
    await expect(page.locator('#alert-dialog')).toHaveCount(0);
  });

  test('lets you run tests', async ({ page }) => {
    await page.goto('/configuration');

    await page
      .locator('textarea')
      .fill('providers:\n  - reverser:whatever\n\nprompts:\n  - Write a poem about AI evals');

    const useConfigBtn = await page.getByText('Use config');
    await expect(useConfigBtn).not.toBeDisabled();
    await useConfigBtn.click();

    // Ensure no error dialog is visible
    await expect(page.locator('#alert-dialog')).toHaveCount(0);

    // Check that it can be run
    await page.getByText('Dashboard').click();
    await page.waitForLoadState('networkidle');

    const runTestsBtn = await page.getByText('Run tests');
    await expect(runTestsBtn).toHaveCount(1);
  });
});
