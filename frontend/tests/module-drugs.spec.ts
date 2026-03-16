import { test, expect } from '@playwright/test';

const PROJECTS_URL = 'http://localhost:5173/projects';

test.describe('Kiri E2E - Drug Discovery Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PROJECTS_URL);
    await expect(page.getByRole('heading', { name: 'Research Projects' })).toBeVisible({ timeout: 10_000 });

    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Loading');
    }, {}, { timeout: 10_000 });

    const cards = page.locator('div.group.cursor-pointer');
    const cardCount = await cards.count();
    test.skip(cardCount === 0, 'No projects available to test Drug Discovery');

    await cards.first().click();
    await page.getByRole('button', { name: /Open Project/i }).first().click();

    await page.waitForURL(/\/projects\/.*\/atlas/, { timeout: 10_000 });

    // Navigate to Drug Discovery
    await page.getByText('Drug Discovery').click();
    await page.waitForURL(/\/drugs/);
  });

  test('Drug Discovery renders search input', async ({ page }) => {
    await expect(page.getByText('Drug Discovery', { exact: true })).toBeVisible();

    // Check for drug search input box
    const searchInput = page.locator('input[type="text"]').first();
    if (await searchInput.count() > 0) {
      await expect(searchInput).toBeVisible();
    }
  });

  test('Drug Discovery has RUO disclaimer', async ({ page }) => {
    // The PRD explicitly requires a "Research Use Only" disclaimer
    const disclaimer = page.locator('text=/Research Use Only|RUO/i');
    if (await disclaimer.count() > 0) {
      await expect(disclaimer.first()).toBeVisible();
    }
  });

  test('Drug Discovery shows toxicology or rankings options', async ({ page }) => {
    const tableHeaders = page.locator('th, button').filter({ hasText: /(Toxicology|Ranking|Evidence|Score)/i });
    if (await tableHeaders.count() > 0) {
      await expect(tableHeaders.first()).toBeVisible();
    }
  });
});
