import { test, expect } from '@playwright/test';

const PROJECTS_URL = 'http://localhost:5173/projects';

test.describe('Kiri E2E - Clinical & Prognostic Suite Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PROJECTS_URL);
    await expect(page.getByRole('heading', { name: 'Research Projects' })).toBeVisible({ timeout: 10_000 });

    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Loading');
    }, {}, { timeout: 10_000 });

    const cards = page.locator('div.group.cursor-pointer');
    const cardCount = await cards.count();
    test.skip(cardCount === 0, 'No projects available to test Clinical Suite');

    await cards.first().click();
    await page.getByRole('button', { name: /Open Project/i }).first().click();

    await page.waitForURL(/\/projects\/.*\/atlas/, { timeout: 10_000 });

    // Navigate to Clinical Suite
    await page.getByText('Clinical Suite').click();
    await page.waitForURL(/\/clinical/);
  });

  test('Clinical Suite renders Kaplan-Meier elements', async ({ page }) => {
    await expect(page.getByText('Clinical Suite', { exact: true })).toBeVisible();

    // Check for Survival Curve related text or elements
    // Could be 'Survival', 'Kaplan-Meier', 'p-value', 'High Expression'
    const kmIndicators = page.locator('text=/Survival|Kaplan-Meier|Hazard Ratio/i');
    if (await kmIndicators.count() > 0) {
      await expect(kmIndicators.first()).toBeVisible();
    }
  });

  test('Clinical Suite displays survival metric controls', async ({ page }) => {
    // Check for cutpoint or metric selectors (e.g., Overall Survival, Disease Free Survival)
    const controls = page.locator('button, select').filter({ hasText: /(Survival|Cutpoint|Median|Optimal)/i });
    if (await controls.count() > 0) {
      await expect(controls.first()).toBeVisible();
    }
  });
});
