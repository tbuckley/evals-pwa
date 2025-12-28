import { expect, test } from '@playwright/test';
import dedent from 'dedent';

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

    const useConfigBtn = page.getByText('Use config');
    await expect(useConfigBtn).not.toBeDisabled();
    await useConfigBtn.click();

    // Ensure no error dialog is visible
    await expect(page.locator('#alert-dialog')).toHaveCount(0);

    // Check that it can be run
    await page.getByText('Dashboard').click();
    await page.waitForLoadState('networkidle');

    const runTestsBtn = page.getByText('Run tests');
    await expect(runTestsBtn).toHaveCount(1);
  });

  test('lets you share', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/configuration');

    const config = dedent`
      providers:
        - reverser:whatever
      
      prompts:
        - Write a poem about AI evals`;
    await page.locator('textarea').fill(config);

    // await expect(page.locator('[data-sonner-toaster]')).toHaveCount(0);
    await page.getByText('Share via link').click();
    await expect(page.locator('[data-sonner-toaster]')).toHaveCount(1);

    // Read clipboard data
    const clipboardText = await page.evaluate(async () => {
      return await navigator.clipboard.readText();
    });

    await page.goto(clipboardText);
    await expect(page.locator('textarea')).toHaveValue(config);
  });
});
