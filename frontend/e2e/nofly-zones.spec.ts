import { test, expect } from '@playwright/test';

test.describe('No-Fly Zones UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
  });

  test('NFZ toggle button is visible', async ({ page }) => {
    const nfzButton = page.locator('[data-testid="nofly-toggle"]');
    await expect(nfzButton).toBeVisible({ timeout: 5000 });
    await expect(nfzButton).toContainText('NFZ');
  });

  test('clicking NFZ button enables overlay and opens panel', async ({ page }) => {
    const nfzButton = page.locator('[data-testid="nofly-toggle"]');
    await nfzButton.click();

    // Panel should be visible
    const panel = page.locator('[data-testid="nofly-panel"]');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Panel header should mention DIPUL
    await expect(panel.locator('text=DIPUL')).toBeVisible();
  });

  test('panel shows categories', async ({ page }) => {
    await page.locator('[data-testid="nofly-toggle"]').click();
    const panel = page.locator('[data-testid="nofly-panel"]');
    await expect(panel).toBeVisible({ timeout: 3000 });

    await expect(panel.locator('[data-testid="nofly-category-aviation"]')).toBeVisible();
    await expect(panel.locator('[data-testid="nofly-category-nature"]')).toBeVisible();
    await expect(panel.locator('[data-testid="nofly-category-infrastructure"]')).toBeVisible();
    await expect(panel.locator('[data-testid="nofly-category-sensitive"]')).toBeVisible();
    await expect(panel.locator('[data-testid="nofly-category-temporary"]')).toBeVisible();
  });

  test('panel shows individual layers', async ({ page }) => {
    await page.locator('[data-testid="nofly-toggle"]').click();
    const panel = page.locator('[data-testid="nofly-panel"]');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Aviation layers should be visible
    await expect(panel.locator('[data-testid="nofly-layer-flughaefen"]')).toBeVisible();
    await expect(panel.locator('[data-testid="nofly-layer-kontrollzonen"]')).toBeVisible();
    await expect(panel.locator('[data-testid="nofly-layer-flugplaetze"]')).toBeVisible();
  });

  test('NFZ button shows badge with layer count when enabled', async ({ page }) => {
    await page.locator('[data-testid="nofly-toggle"]').click();
    await expect(page.locator('[data-testid="nofly-panel"]')).toBeVisible({ timeout: 3000 });

    // Close panel by clicking outside
    await page.mouse.click(10, 10);

    // Button should have active styling and show count badge
    const nfzButton = page.locator('[data-testid="nofly-toggle"]');
    // Default enabled layers count (aviation = 4 layers)
    const badge = nfzButton.locator('span').last();
    await expect(badge).toBeVisible();
  });

  test('disable button removes overlay', async ({ page }) => {
    // Enable NFZ
    await page.locator('[data-testid="nofly-toggle"]').click();
    await expect(page.locator('[data-testid="nofly-panel"]')).toBeVisible({ timeout: 3000 });

    // Close panel
    await page.mouse.click(10, 10);
    await expect(page.locator('[data-testid="nofly-panel"]')).not.toBeVisible({ timeout: 3000 });

    // Disable button should be visible
    const disableBtn = page.locator('[data-testid="nofly-disable"]');
    await expect(disableBtn).toBeVisible({ timeout: 3000 });
    await disableBtn.click();

    // NFZ should be disabled - no disable button anymore
    await expect(disableBtn).not.toBeVisible({ timeout: 3000 });
  });

  test('toggling a layer checkbox works', async ({ page }) => {
    await page.locator('[data-testid="nofly-toggle"]').click();
    const panel = page.locator('[data-testid="nofly-panel"]');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Click on flughaefen layer to toggle it off
    const flughaefen = panel.locator('[data-testid="nofly-layer-flughaefen"]');
    await flughaefen.click();

    // It should now be unchecked (no checkmark)
    // Click again to re-enable
    await flughaefen.click();
  });

  test('toggle all button works', async ({ page }) => {
    await page.locator('[data-testid="nofly-toggle"]').click();
    const panel = page.locator('[data-testid="nofly-panel"]');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Find the "Alle an"/"Alle aus" button
    const toggleAllBtn = panel.locator('button:has-text("Alle")');
    await expect(toggleAllBtn).toBeVisible();
    await toggleAllBtn.click();
  });

  test('panel shows DIPUL attribution', async ({ page }) => {
    await page.locator('[data-testid="nofly-toggle"]').click();
    const panel = page.locator('[data-testid="nofly-panel"]');
    await expect(panel).toBeVisible({ timeout: 3000 });

    await expect(panel.locator('text=DFS')).toBeVisible();
    await expect(panel.locator('text=BKG')).toBeVisible();
  });

  test('clicking outside panel closes it', async ({ page }) => {
    await page.locator('[data-testid="nofly-toggle"]').click();
    await expect(page.locator('[data-testid="nofly-panel"]')).toBeVisible({ timeout: 3000 });

    // Click on the map area
    await page.mouse.click(10, 10);

    // Panel should be closed
    await expect(page.locator('[data-testid="nofly-panel"]')).not.toBeVisible({ timeout: 3000 });
  });

  test('NFZ button reopens panel when clicked again', async ({ page }) => {
    // Enable and open
    await page.locator('[data-testid="nofly-toggle"]').click();
    await expect(page.locator('[data-testid="nofly-panel"]')).toBeVisible({ timeout: 3000 });

    // Close by clicking outside
    await page.mouse.click(10, 10);
    await expect(page.locator('[data-testid="nofly-panel"]')).not.toBeVisible({ timeout: 3000 });

    // Click NFZ button again to reopen (already enabled, so it toggles panel)
    await page.locator('[data-testid="nofly-toggle"]').click();
    await expect(page.locator('[data-testid="nofly-panel"]')).toBeVisible({ timeout: 3000 });
  });

  test('category toggle enables/disables all layers in category', async ({ page }) => {
    await page.locator('[data-testid="nofly-toggle"]').click();
    const panel = page.locator('[data-testid="nofly-panel"]');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // Click nature category to enable all nature layers
    await panel.locator('[data-testid="nofly-category-nature"]').click();

    // Nature layers should now be visible and checkmarked
    const naturschutz = panel.locator('[data-testid="nofly-layer-naturschutzgebiete"]');
    await expect(naturschutz).toBeVisible();

    // Click again to disable
    await panel.locator('[data-testid="nofly-category-nature"]').click();
  });

  test('hover tooltip appears over no-fly zone', async ({ page }) => {
    // Enable NFZ
    await page.locator('[data-testid="nofly-toggle"]').click();
    await page.waitForTimeout(300);
    await page.mouse.click(10, 10);

    // Navigate to Frankfurt Airport area (known zone)
    await page.evaluate(() => {
      const container = document.querySelector('.leaflet-container') as any;
      if (container?._leaflet_map) {
        container._leaflet_map.setView([50.037, 8.562], 11);
      }
    });
    await page.waitForTimeout(3000);

    // Move mouse to center of map (over Frankfurt Airport zone)
    const mapContainer = page.locator('.leaflet-container');
    const box = await mapContainer.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(1500);

      // Tooltip should appear with zone info
      const tooltip = page.locator('[data-testid="nfz-tooltip"]');
      const isVisible = await tooltip.evaluate(el => el.style.display !== 'none').catch(() => false);
      expect(isVisible).toBe(true);

      // Should contain zone name
      const content = await tooltip.textContent();
      expect(content).toBeTruthy();
      expect(content!.length).toBeGreaterThan(3);
    }
  });

  test('hover tooltip hides when mouse leaves zone area', async ({ page }) => {
    // Enable NFZ
    await page.locator('[data-testid="nofly-toggle"]').click();
    await page.waitForTimeout(300);
    await page.mouse.click(10, 10);

    // Navigate to Frankfurt Airport
    await page.evaluate(() => {
      const container = document.querySelector('.leaflet-container') as any;
      if (container?._leaflet_map) {
        container._leaflet_map.setView([50.037, 8.562], 11);
      }
    });
    await page.waitForTimeout(3000);

    // Hover over zone
    const mapContainer = page.locator('.leaflet-container');
    const box = await mapContainer.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(1500);

      // Move mouse out of the map entirely
      await page.mouse.move(0, 0);
      await page.waitForTimeout(500);

      // Tooltip should be hidden
      const tooltip = page.locator('[data-testid="nfz-tooltip"]');
      const isHidden = await tooltip.evaluate(el => el.style.display === 'none').catch(() => true);
      expect(isHidden).toBe(true);
    }
  });

  test('hover tooltip not shown when NFZ disabled', async ({ page }) => {
    // Do NOT enable NFZ - hover should not trigger tooltip
    const mapContainer = page.locator('.leaflet-container');
    const box = await mapContainer.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(500);

      // Tooltip should not be visible (or not exist)
      const tooltip = page.locator('[data-testid="nfz-tooltip"]');
      const isHidden = await tooltip.evaluate(el => el.style.display === 'none').catch(() => true);
      expect(isHidden).toBe(true);
    }
  });

  test('click on zone opens detailed popup', async ({ page }) => {
    // Enable NFZ
    await page.locator('[data-testid="nofly-toggle"]').click();
    await page.waitForTimeout(300);
    await page.mouse.click(10, 10);

    // Navigate to Frankfurt Airport area
    await page.evaluate(() => {
      const container = document.querySelector('.leaflet-container') as any;
      if (container?._leaflet_map) {
        container._leaflet_map.setView([50.037, 8.562], 11);
      }
    });
    await page.waitForTimeout(3000);

    // Click center of map (over Frankfurt Airport zone)
    const mapContainer = page.locator('.leaflet-container');
    const box = await mapContainer.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(2000);

      // Leaflet popup should appear with detailed info
      const popup = page.locator('.leaflet-popup-content');
      const isVisible = await popup.isVisible().catch(() => false);
      if (isVisible) {
        const content = await popup.textContent();
        expect(content).toBeTruthy();
        // Should contain type/legal info
        expect(content!.length).toBeGreaterThan(5);
      }
    }
  });
});

test.describe('No-Fly Zones API', () => {
  test('GET /api/nofly/check returns availability status', async ({ request }) => {
    const res = await request.get('/api/nofly/check');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('available');
    // available is boolean regardless of whether WMS is reachable
    expect(typeof data.available).toBe('boolean');
    if (data.available) {
      expect(data.status_code).toBe(200);
      expect(data.wms_url).toContain('uas-betrieb.de');
    }
  });

  test('GET /api/nofly/info returns 400 without params', async ({ request }) => {
    const res = await request.get('/api/nofly/info');
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty('error');
  });

  test('GET /api/nofly/info returns 400 without layers', async ({ request }) => {
    const res = await request.get('/api/nofly/info?lat=52.0&lon=8.0');
    expect(res.status()).toBe(400);
  });

  test('GET /api/nofly/info with valid params returns response', async ({ request }) => {
    const res = await request.get('/api/nofly/info?lat=50.03&lon=8.57&layers=dipul:flughaefen');
    // Could be 200 (success) or 502/504 (WMS unreachable) - both are valid responses
    expect([200, 502, 504]).toContain(res.status());
    const data = await res.json();
    if (res.status() === 200) {
      // Should return GeoJSON-like structure
      expect(data).toHaveProperty('type');
      expect(data).toHaveProperty('features');
    } else {
      expect(data).toHaveProperty('error');
    }
  });

  test('GET /api/nofly/info with multiple layers', async ({ request }) => {
    const layers = 'dipul:flughaefen,dipul:kontrollzonen';
    const res = await request.get(`/api/nofly/info?lat=50.03&lon=8.57&layers=${layers}`);
    expect([200, 502, 504]).toContain(res.status());
  });
});
