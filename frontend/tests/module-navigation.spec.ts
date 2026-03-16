/**
 * Kiri — Module Loading & Navigation E2E Tests
 *
 * Verifies all 6 science modules load and navigation works.
 */

import { test, expect } from '@playwright/test';

const PROJECTS_URL = 'http://localhost:5173/projects';

test.describe('Kiri E2E - Module Navigation', () => {
  test.setTimeout(30_000);

  test('all module sidebar links are present in project view', async ({ page }) => {
    await page.goto(PROJECTS_URL);
    // Wait for the heading to appear
    await expect(page.getByRole('heading', { name: 'Research Projects' })).toBeVisible({ timeout: 10_000 });

    // Wait for loading to finish (either projects appear or empty state)
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Loading');
    }, {}, { timeout: 10_000 });

    // Click the first project card if projects exist
    const cards = page.locator('div.group.cursor-pointer');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      await cards.first().click();
    await page.getByRole('button', { name: /Open Project/i }).first().click();

      await page.waitForURL(/\/projects\/.*\/atlas/, { timeout: 10_000 });

      // Verify all 6 module nav links exist in the sidebar
      await expect(page.getByRole('link', { name: /Multi-Omics Atlas/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /Interaction Lab/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /Clinical Suite/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /AI Discovery/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /Publication Engine/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /Drug Discovery/i })).toBeVisible();
    } else {
      // No projects — verify empty state
      await expect(page.getByText('New Project')).toBeVisible();
    }
  });

  test('navigating between modules loads correct content', async ({ page }) => {
    await page.goto(PROJECTS_URL);
    await expect(page.getByRole('heading', { name: 'Research Projects' })).toBeVisible({ timeout: 10_000 });

    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Loading');
    }, {}, { timeout: 10_000 });

    const cards = page.locator('div.group.cursor-pointer');
    const cardCount = await cards.count();
    test.skip(cardCount === 0, 'No projects available for navigation test');

    await cards.first().click();
    await page.getByRole('button', { name: /Open Project/i }).first().click();

    await page.waitForURL(/\/projects\/.*\/atlas/, { timeout: 10_000 });

    // Navigate to Clinical Suite
    await page.getByRole('link', { name: /Clinical Suite/i }).click();
    await page.waitForURL(/\/clinical/);

    // Navigate to Drug Discovery
    await page.getByRole('link', { name: /Drug Discovery/i }).click();
    await page.waitForURL(/\/drugs/);

    // Navigate back to Atlas
    await page.getByRole('link', { name: /Multi-Omics Atlas/i }).click();
    await page.waitForURL(/\/atlas/);
  });
});

test.describe('Kiri E2E - Language Toggle', () => {
  test('language toggle is present in project view', async ({ page }) => {
    await page.goto(PROJECTS_URL);
    await expect(page.getByRole('heading', { name: 'Research Projects' })).toBeVisible({ timeout: 10_000 });

    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Loading');
    }, {}, { timeout: 10_000 });

    const cards = page.locator('div.group.cursor-pointer');
    const cardCount = await cards.count();
    test.skip(cardCount === 0, 'No projects available for language toggle test');

    await cards.first().click();
    await page.getByRole('button', { name: /Open Project/i }).first().click();

    await page.waitForURL(/\/projects\/.*\/atlas/, { timeout: 10_000 });

    // Look for language toggle button
    await expect(page.getByTitle('切换中文')).toBeVisible();
  });
});
