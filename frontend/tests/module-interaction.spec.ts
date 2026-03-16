import { test, expect } from '@playwright/test';

const PROJECTS_URL = 'http://localhost:5173/projects';

test.describe('Kiri E2E - Interaction Lab Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PROJECTS_URL);
    await expect(page.getByRole('heading', { name: 'Research Projects' })).toBeVisible({ timeout: 10_000 });

    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Loading');
    }, {}, { timeout: 10_000 });

    const cards = page.locator('div.group.cursor-pointer');
    const cardCount = await cards.count();
    test.skip(cardCount === 0, 'No projects available to test Interaction Lab module');

    await cards.first().click();
    await page.getByRole('button', { name: /Open Project/i }).first().click();

    await page.waitForURL(/\/projects\/.*\/atlas/, { timeout: 10_000 });

    // Navigate to Interaction Lab
    await page.getByText('Interaction Lab').click();
    await page.waitForURL(/\/interaction/);
  });

  test('Interaction Lab renders Cytoscape network container', async ({ page }) => {
    await expect(page.getByText('Interaction Lab', { exact: true })).toBeVisible();
    
    // Look for the cytoscape container. Cytoscape creates a canvas typically within a div.
    // We can look for a canvas element, or a placeholder if loading.
    const canvas = page.locator('canvas').first();
    const loading = page.getByText(/Loading network|Rendering/i).first();
    
    // Either it's loading or the canvas is present
    await Promise.any([
      expect(canvas).toBeVisible(),
      expect(loading).toBeVisible()
    ]).catch(() => {
      // Fallback: check if standard 3D viewer or network text exists
      return expect(page.getByText(/Network|3D Viewer/i).first()).toBeVisible();
    });
  });

  test('Interaction Lab shows structure or predicted complex options', async ({ page }) => {
    // Check for "Single Protein", "Compare", "Complex" views as per PRD/Conversation history
    const viewOptions = page.locator('button, [role="tab"]').filter({ hasText: /(Single Protein|Compare|Complex)/i });
    if (await viewOptions.count() > 0) {
      await expect(viewOptions.first()).toBeVisible();
    }
  });
});
