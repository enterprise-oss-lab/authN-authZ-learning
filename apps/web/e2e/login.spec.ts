import { expect, test } from '@playwright/test';

test('shows the Zitadel login entry point', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'AuthN / AuthZ Learning' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zitadel でログイン' })).toBeVisible();
});
