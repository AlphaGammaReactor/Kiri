import { test, expect } from '@playwright/test';

test.describe('Kiri E2E - Project Management', () => {
  test('create, save, and verify project in db', async ({ page }, testInfo) => {
    // Use a predictable project name for verification, robust across workers
    const testProjectName = `E2E Test Project ${Date.now()}-${testInfo.workerIndex}`;

    // 1. Navigate to projects dashboard
    await page.goto('http://localhost:5173/projects');
    await expect(page).toHaveTitle(/frontend|Kiri|Vite/i);

    // 2. Click "New Project"
    await page.getByRole('button', { name: /New Project/i }).click({ force: true });

    // Mock the external gene validation API to avoid flakiness/rate-limiting
    await page.route('**/api/v1/validation/gene/*', async route => {
      const url = route.request().url();
      const symbol = url.split('/').pop()?.toUpperCase() || 'TEST';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          data: { valid: true, symbol: symbol, name: 'Mocked Gene', hgnc: '1234' },
          provenance: null,
          warnings: [],
          errors: []
        })
      });
    });

    // -- Step 1: Basics
    await expect(page.getByText(/Project Name/i)).toBeVisible();
    await page.getByPlaceholder(/PARL-MAVS CRC Study/i).fill(testProjectName);
    await page.getByPlaceholder(/Brief description/i).fill('Automated E2E testing project');
    const cancerTypeSelect = page.locator('select').first();
    await cancerTypeSelect.selectOption('COAD');
    await page.getByRole('button', { name: /Next/i }).click();

    // -- Step 2: Target Proteins
    await expect(page.getByText(/Add Protein Targets/i)).toBeVisible();
    
    // Add custom protein TP53
    await page.locator('button', { hasText: /Add Custom Protein/i }).click();
    await page.getByPlaceholder(/Search gene symbol…/i).fill('TP53');
    await expect(page.getByText(/HGNC ✓/i)).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /^Add$/i }).last().click();
    await expect(page.locator('.font-mono', { hasText: /^TP53$/ }).first()).toBeVisible({ timeout: 10000 });

    // Add custom protein EGFR
    await page.getByPlaceholder(/Search gene symbol…/i).fill('EGFR');
    await expect(page.getByText(/HGNC ✓/i)).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /^Add$/i }).last().click();

    await page.getByRole('button', { name: /Next/i }).click();

    // -- Step 3: Data Sources
    await expect(page.getByText(/Select Data Sources/i)).toBeVisible();
    
    // Just click Next (sources are optional and we don't have to upload for the test)
    await page.getByRole('button', { name: /Next/i }).click();

    // -- Step 4: Review and Save
    await expect(page.getByRole('button', { name: /Open Project/i })).toBeVisible();
    await expect(page.getByText(testProjectName).first()).toBeVisible();
    await expect(page.getByText('TP53', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('EGFR', { exact: true }).first()).toBeVisible();
    
    await page.getByRole('button', { name: /Open Project/i }).click();

    // 3. Verify Redirection to Atlas (which signifies project loaded)
    await page.waitForURL(/\/projects\/[a-zA-Z0-9-]+\/atlas/);
    
    // Check that the project name is visible in the sidebar navigation
    await expect(page.getByRole('heading', { name: testProjectName }).first()).toBeVisible();
    
    // Also check the genes exist in sidebar
    const sidebar = page.locator('aside');
    await expect(sidebar.getByText('TP53', { exact: true }).first()).toBeVisible();
    await expect(sidebar.getByText('EGFR', { exact: true }).first()).toBeVisible();

    // 4. Verification in Dashboard
    await page.goto('http://localhost:5173/projects');
    await expect(page.getByText(testProjectName).first()).toBeVisible();
  });
});
