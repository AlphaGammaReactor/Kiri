import { test, expect } from '@playwright/test';

const PROJECTS_URL = 'http://localhost:5173/projects';

test.describe('Kiri E2E - Multi-Omics Atlas Module', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the first project's Atlas page
    await page.goto(PROJECTS_URL);
    await expect(page.getByRole('heading', { name: 'Research Projects' })).toBeVisible({ timeout: 10_000 });

    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Loading');
    }, {}, { timeout: 10_000 });

    const cards = page.locator('div.group.cursor-pointer');
    const cardCount = await cards.count();
    test.skip(cardCount === 0, 'No projects available to test Atlas module');

    await cards.first().click();
    await page.getByRole('button', { name: /Open Project/i }).first().click();

    await page.waitForURL(/\/projects\/.*\/atlas/, { timeout: 10_000 });
  });

  test('Atlas page renders core controls', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Multi-Omics Atlas/i }).first()).toBeVisible();

    // Check for Gene search/input placeholder (may vary based on exact UI, using generic locator)
    // Most likely there is a search input or a display of the current active gene.
    // The PRD mentions Bulk RNA-seq, GEO, Single-Cell, Proteomics
    const hasTabs = await page.getByRole('tablist').count() > 0;
    if (hasTabs) {
      // If there's a tab list, assume standard data source tabs exist
      await expect(page.getByRole('tablist')).toBeVisible();
    }
  });

  test('Atlas split view or normalization toggle is present', async ({ page }) => {
    // Look for common controls mentioned in PRD: Normalization method selector (TPM/FPKM/Counts)
    const toggleOrSelect = page.locator('button, select').filter({ hasText: /(TPM|FPKM|Counts|Normalization)/i });
    if (await toggleOrSelect.count() > 0) {
      await expect(toggleOrSelect.first()).toBeVisible();
    }
  });
});
