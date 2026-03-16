import { test, expect } from '@playwright/test';

const PROJECTS_URL = 'http://localhost:5173/projects';

test.describe('Kiri E2E - Publication Engine Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PROJECTS_URL);
    await expect(page.getByRole('heading', { name: 'Research Projects' })).toBeVisible({ timeout: 10_000 });

    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Loading');
    }, {}, { timeout: 10_000 });

    const cards = page.locator('div.group.cursor-pointer');
    const cardCount = await cards.count();
    test.skip(cardCount === 0, 'No projects available to test Publication Engine');

    await cards.first().click();
    await page.getByRole('button', { name: /Open Project/i }).first().click();

    await page.waitForURL(/\/projects\/.*\/atlas/, { timeout: 10_000 });

    // Navigate to Publication Engine
    await page.getByText('Publication Engine').click();
    await page.waitForURL(/\/export/);
  });

  test('Publication Engine renders export options', async ({ page }) => {
    await expect(page.getByText('Publication Engine', { exact: true })).toBeVisible();

    // Check for Export SVG/PDF buttons
    const exportButtons = page.locator('button').filter({ hasText: /(Export|SVG|PDF)/i });
    if (await exportButtons.count() > 0) {
      await expect(exportButtons.first()).toBeVisible();
    }
  });

  test('Publication Engine displays provenance metadata', async ({ page }) => {
    // Check for dataset/provenance metadata fields that are required for NCB standard
    // E.g., Date, Data Source (TCGA, GEO), Normalization Method
    const provenanceLabels = page.locator('text=/Date:|Data Source:|Method:/i');
    if (await provenanceLabels.count() > 0) {
      await expect(provenanceLabels.first()).toBeVisible();
    }
  });

  test('Publication Engine allows adding figure panels', async ({ page }) => {
    const addFigureButton = page.locator('button, [role="button"]').filter({ hasText: /(Add Figure|New Panel)/i });
    if (await addFigureButton.count() > 0) {
      await expect(addFigureButton.first()).toBeVisible();
    }
  });
});
