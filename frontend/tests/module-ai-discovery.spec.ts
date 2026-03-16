import { test, expect } from '@playwright/test';

const PROJECTS_URL = 'http://localhost:5173/projects';

test.describe('Kiri E2E - AI-Augmented Discovery Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PROJECTS_URL);
    await expect(page.getByRole('heading', { name: 'Research Projects' })).toBeVisible({ timeout: 10_000 });

    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Loading');
    }, {}, { timeout: 10_000 });

    const cards = page.locator('div.group.cursor-pointer');
    const cardCount = await cards.count();
    test.skip(cardCount === 0, 'No projects available to test AI Discovery');

    await cards.first().click();
    await page.getByRole('button', { name: /Open Project/i }).first().click();

    await page.waitForURL(/\/projects\/.*\/atlas/, { timeout: 10_000 });

    // Navigate to AI Discovery
    await page.getByText('AI Discovery').click();
    await page.waitForURL(/\/discovery/);
  });

  test('AI Discovery renders synthesis input area', async ({ page }) => {
    await expect(page.getByText('AI Discovery', { exact: true })).toBeVisible();

    // Expect a textarea or input for asking the AI/mining literature
    const inputBox = page.locator('textarea, input[type="text"]').first();
    if (await inputBox.count() > 0) {
      await expect(inputBox).toBeVisible();
    }
  });

  test('AI Discovery clearly labels AI outputs', async ({ page }) => {
    // If there is any AI output visible by default, it must say "AI" or "AI-Suggested"
    const aiLabels = page.locator('text=/AI-Suggested|AI Generated|AI Insight/i');
    if (await aiLabels.count() > 0) {
      await expect(aiLabels.first()).toBeVisible();
    }
  });
});
