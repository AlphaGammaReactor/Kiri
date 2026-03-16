import { test, expect } from '@playwright/test';

test.describe('Kiri E2E - Project Delete Modal', () => {
  test('shows in-app confirmation modal instead of browser confirm', async ({ page }) => {
    // 1. Navigate to projects dashboard
    await page.goto('http://localhost:5173/projects');
    await page.waitForSelector('h1');

    // 2. Check there's at least one project
    const projectCards = page.locator('[class*="cursor-pointer"][class*="rounded-xl"]');
    const count = await projectCards.count();
    
    if (count === 0) {
      test.skip(true, 'No projects exist to test delete modal');
      return;
    }

    // 3. Hover over the first project card to reveal the delete button
    await projectCards.first().hover();

    // 4. Click the delete button (visible on hover)
    const deleteBtn = projectCards.first().locator('button', { hasText: /delete/i });
    await deleteBtn.click();

    // 5. Verify the in-app modal appears (NOT a browser confirm)
    const modal = page.locator('.fixed.inset-0');
    await expect(modal).toBeVisible();

    // 6. Verify modal content
    await expect(page.getByText(/Delete Project/i)).toBeVisible();
    await expect(page.getByText(/cannot be undone/i)).toBeVisible();
    
    // 7. Verify Cancel and Delete buttons exist
    const cancelBtn = page.getByRole('button', { name: /Cancel/i });
    const confirmDeleteBtn = page.getByRole('button', { name: /Delete/i }).last();
    await expect(cancelBtn).toBeVisible();
    await expect(confirmDeleteBtn).toBeVisible();

    // 8. Click Cancel to dismiss without deleting
    await cancelBtn.click();
    await expect(modal).not.toBeVisible();

    // 9. Project card should still be present
    await expect(projectCards.first()).toBeVisible();
  });

  test('module pages load without crash', async ({ page }) => {
    // Navigate to projects
    await page.goto('http://localhost:5173/projects');
    
    const projectCards = page.locator('[class*="cursor-pointer"][class*="rounded-xl"]');
    const count = await projectCards.count();
    
    if (count === 0) {
      test.skip(true, 'No projects exist to test module pages');
      return;
    }

    // Click first project to enter it
    await projectCards.first().click();
    await page.waitForURL(/\/projects\/[a-zA-Z0-9-]+\//);

    // Atlas page should load (not a placeholder)
    await expect(page.getByText(/Multi-Omics Atlas/i)).toBeVisible({ timeout: 10000 });

    // Navigate to each module tab — none should crash
    const modules = [
      { nav: /Interaction Lab/i, heading: /Interaction/i },
      { nav: /Clinical Suite/i, heading: /Clinical|Survival/i },
      { nav: /AI Discovery/i, heading: /Discovery/i },
      { nav: /Drug Discovery/i, heading: /Drug/i },
      { nav: /Publication Engine/i, heading: /Publication|Export/i },
    ];

    for (const mod of modules) {
      await page.getByText(mod.nav).click();
      // Wait a bit for lazy loading
      await page.waitForTimeout(1000);
      // Should NOT show a Vite error overlay
      const errorOverlay = page.locator('vite-error-overlay');
      const hasError = await errorOverlay.count();
      expect(hasError).toBe(0);
    }
  });
});
