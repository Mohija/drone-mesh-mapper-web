import { test, expect } from '@playwright/test';

test.describe('Map Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for drones API to respond
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
  });

  test('page loads with title bar', async ({ page }) => {
    await expect(page.locator('text=Drone Mesh Mapper')).toBeVisible();
  });

  test('shows drone count', async ({ page }) => {
    await expect(page.locator('text=5 Drohnen')).toBeVisible({ timeout: 5000 });
  });

  test('map container is rendered', async ({ page }) => {
    await expect(page.locator('.leaflet-container')).toBeVisible();
  });

  test('drone markers are visible on map', async ({ page }) => {
    await page.waitForTimeout(2000);
    const markers = page.locator('.leaflet-marker-icon');
    const count = await markers.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('clicking a drone marker opens status panel', async ({ page }) => {
    await page.waitForTimeout(2000);
    const markers = page.locator('.leaflet-marker-icon');
    await markers.first().click({ force: true });

    // Status panel should show sections
    await expect(page.locator('text=Details anzeigen')).toBeVisible({ timeout: 5000 });
  });

  test('status panel shows drone data after marker click', async ({ page }) => {
    await page.waitForTimeout(2000);
    const markers = page.locator('.leaflet-marker-icon');
    await markers.first().click({ force: true });

    await expect(page.locator('text=Details anzeigen')).toBeVisible({ timeout: 5000 });
    // Check for dBm value somewhere on page
    await expect(page.locator('text=dBm').first()).toBeVisible();
  });

  test('status panel close button works', async ({ page }) => {
    await page.waitForTimeout(2000);
    const markers = page.locator('.leaflet-marker-icon');
    await markers.first().click({ force: true });

    // Wait for panel button
    const detailsButton = page.locator('button:has-text("Details anzeigen")');
    await expect(detailsButton).toBeVisible({ timeout: 5000 });

    // Close panel via StatusPanel's close button
    await page.locator('button[aria-label="Panel schließen"]').click();

    // Panel button should disappear
    await expect(detailsButton).not.toBeVisible({ timeout: 3000 });
  });

  test('details button navigates to drone detail page', async ({ page }) => {
    await page.waitForTimeout(2000);
    const markers = page.locator('.leaflet-marker-icon');
    await markers.first().click({ force: true });

    await expect(page.locator('text=Details anzeigen')).toBeVisible({ timeout: 5000 });
    await page.locator('text=Details anzeigen').click();

    // Should navigate to detail page
    await expect(page.locator('text=/← Karte/')).toBeVisible({ timeout: 5000 });
  });

  test('no error message on successful connection', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Verbindung zum Server fehlgeschlagen')).not.toBeVisible();
  });
});
