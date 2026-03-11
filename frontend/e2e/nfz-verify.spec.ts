import { test, expect } from '@playwright/test';

test.describe('NFZ Enable/Disable Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
  });

  test('enabling NFZ loads WMS tiles', async ({ page }) => {
    // Enable NFZ
    await page.locator('[data-testid="nofly-toggle"]').click();
    await expect(page.locator('[data-testid="nofly-panel"]')).toBeVisible({ timeout: 3000 });

    // Close panel
    await page.mouse.click(10, 10);
    await page.waitForTimeout(2000);

    // Check that WMS tile images are loaded
    const wmsTiles = await page.evaluate(() => {
      const imgs = document.querySelectorAll('.nfz-wms-tiles img');
      return imgs.length;
    });
    expect(wmsTiles).toBeGreaterThan(0);
  });

  test('disabling NFZ removes WMS tiles', async ({ page }) => {
    // Enable NFZ
    await page.locator('[data-testid="nofly-toggle"]').click();
    await expect(page.locator('[data-testid="nofly-panel"]')).toBeVisible({ timeout: 3000 });
    await page.mouse.click(10, 10);
    await page.waitForTimeout(2000);

    // Verify WMS tiles exist
    const tilesBefore = await page.evaluate(() => {
      return document.querySelectorAll('.nfz-wms-tiles img').length;
    });
    expect(tilesBefore).toBeGreaterThan(0);

    // Disable NFZ via X button
    const disableBtn = page.locator('[data-testid="nofly-disable"]');
    await expect(disableBtn).toBeVisible({ timeout: 3000 });
    await disableBtn.click();
    await page.waitForTimeout(1000);

    // WMS tiles should be removed
    const tilesAfter = await page.evaluate(() => {
      return document.querySelectorAll('.nfz-wms-tiles img').length;
    });
    expect(tilesAfter).toBe(0);

    // Tooltip should be hidden
    const tooltip = page.locator('[data-testid="nfz-tooltip"]');
    const isHidden = await tooltip.evaluate(el => el.style.display === 'none').catch(() => true);
    expect(isHidden).toBe(true);

    // Disable button should be gone
    await expect(disableBtn).not.toBeVisible({ timeout: 3000 });
  });

  test('re-enabling NFZ after disable works', async ({ page }) => {
    // Enable
    await page.locator('[data-testid="nofly-toggle"]').click();
    await page.waitForTimeout(500);
    await page.mouse.click(10, 10);
    await page.waitForTimeout(1500);

    // Disable
    await page.locator('[data-testid="nofly-disable"]').click();
    await page.waitForTimeout(1000);

    // Re-enable
    await page.locator('[data-testid="nofly-toggle"]').click();
    await expect(page.locator('[data-testid="nofly-panel"]')).toBeVisible({ timeout: 3000 });
    await page.mouse.click(10, 10);
    await page.waitForTimeout(2000);

    // Tiles should be back
    const tiles = await page.evaluate(() => {
      return document.querySelectorAll('.nfz-wms-tiles img').length;
    });
    expect(tiles).toBeGreaterThan(0);
  });

  test('disabling all layers in panel removes tiles', async ({ page }) => {
    // Enable NFZ
    await page.locator('[data-testid="nofly-toggle"]').click();
    const panel = page.locator('[data-testid="nofly-panel"]');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Click "Alle aus" to disable all
    const toggleAllBtn = panel.locator('button:has-text("Alle")');
    // First click might be "Alle an" or "Alle aus" depending on current state
    // Click twice to ensure all are off
    await toggleAllBtn.click();
    await page.waitForTimeout(300);
    await toggleAllBtn.click();
    await page.waitForTimeout(1000);

    // When all layers disabled, WMS should be removed
    const tiles = await page.evaluate(() => {
      return document.querySelectorAll('.nfz-wms-tiles img').length;
    });
    expect(tiles).toBe(0);
  });
});

test.describe('NFZ Radius Control', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
  });

  test('NFZ radius control appears when NFZ is enabled', async ({ page }) => {
    // Not visible before enabling
    await expect(page.locator('[data-testid="nfz-radius-control"]')).not.toBeVisible();

    // Enable NFZ
    await page.locator('[data-testid="nofly-toggle"]').click();
    await page.waitForTimeout(500);

    // Radius control should appear
    await expect(page.locator('[data-testid="nfz-radius-control"]')).toBeVisible({ timeout: 3000 });
  });

  test('NFZ radius control disappears when NFZ is disabled', async ({ page }) => {
    // Enable NFZ
    await page.locator('[data-testid="nofly-toggle"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="nfz-radius-control"]')).toBeVisible();

    // Disable NFZ
    await page.mouse.click(10, 10);
    await page.waitForTimeout(500);
    await page.locator('[data-testid="nofly-disable"]').click();
    await page.waitForTimeout(500);

    // Radius control should disappear
    await expect(page.locator('[data-testid="nfz-radius-control"]')).not.toBeVisible();
  });

  test('NFZ radius toggle works', async ({ page }) => {
    // Enable NFZ
    await page.locator('[data-testid="nofly-toggle"]').click();
    await page.waitForTimeout(500);

    // Enable radius
    await page.mouse.click(10, 10);
    await page.waitForTimeout(300);
    const toggle = page.locator('[data-testid="nfz-radius-toggle"]');
    await toggle.click();
    await page.waitForTimeout(500);

    // Select should be visible
    await expect(page.locator('[data-testid="nfz-radius-select"]')).toBeVisible();

    // Disable radius
    await toggle.click();
    await page.waitForTimeout(500);

    // Select should be gone
    await expect(page.locator('[data-testid="nfz-radius-select"]')).not.toBeVisible();
  });

  test('NFZ radius select changes value', async ({ page }) => {
    // Enable NFZ
    await page.locator('[data-testid="nofly-toggle"]').click();
    await page.waitForTimeout(500);
    await page.mouse.click(10, 10);
    await page.waitForTimeout(300);

    // Enable radius
    await page.locator('[data-testid="nfz-radius-toggle"]').click();
    await page.waitForTimeout(500);

    // Change radius to 100km
    const select = page.locator('[data-testid="nfz-radius-select"]');
    await select.selectOption('100000');

    const value = await select.inputValue();
    expect(value).toBe('100000');
  });
});

test.describe('NFZ Layer Visual Rendering', () => {
  test('all layer categories render WMS tiles', async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);

    // Enable NFZ with all layers
    await page.locator('[data-testid="nofly-toggle"]').click();
    const panel = page.locator('[data-testid="nofly-panel"]');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Enable all layers
    const toggleAllBtn = panel.locator('button:has-text("Alle")');
    await toggleAllBtn.click();
    await page.waitForTimeout(500);

    // Close panel and wait for tiles
    await page.mouse.click(10, 10);
    await page.waitForTimeout(3000);

    // Check WMS tiles loaded
    const tileCount = await page.evaluate(() => {
      return document.querySelectorAll('.nfz-wms-tiles img').length;
    });
    expect(tileCount).toBeGreaterThan(0);

    // Check that CSS filter is applied
    const hasFilter = await page.evaluate(() => {
      const img = document.querySelector('.nfz-wms-tiles img') as HTMLImageElement;
      if (!img) return false;
      const style = window.getComputedStyle(img);
      return style.filter.includes('invert');
    });
    expect(hasFilter).toBe(true);
  });
});
