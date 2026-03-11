import { test, expect } from '@playwright/test';

// Helper: click a drone marker on the canvas-rendered map via Leaflet's internal API
async function clickDroneMarker(page: any) {
  await page.evaluate(() => {
    const container = document.querySelector('.leaflet-container') as any;
    if (!container?._leaflet_map) return;
    const map = container._leaflet_map;
    let clicked = false;
    map.eachLayer((layer: any) => {
      // CircleMarkers have _radius, skip user location marker and highlight rings
      if (!clicked && layer._radius !== undefined && layer._latlng && layer.options?.fillOpacity > 0 && layer.options?.fillColor !== 'transparent') {
        layer.fire('click');
        clicked = true;
      }
    });
  });
}

test.describe('Map Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for drones API to respond
    await page.waitForResponse(resp => resp.url().includes('/api/drones') && resp.status() === 200);
  });

  test('page loads with title bar', async ({ page }) => {
    await expect(page.locator('text=FlightArc')).toBeVisible();
  });

  test('shows drone count', async ({ page }) => {
    await expect(page.locator('text=/\\d+ Drohne/')).toBeVisible({ timeout: 5000 });
  });

  test('map container is rendered', async ({ page }) => {
    await expect(page.locator('.leaflet-container')).toBeVisible();
  });

  test('drone markers are visible on map', async ({ page }) => {
    await page.waitForTimeout(2000);
    const countText = await page.locator('text=/\\d+ Drohne/').textContent();
    const count = parseInt(countText?.match(/(\d+)/)?.[1] || '0');
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('clicking a drone marker opens status panel', async ({ page }) => {
    await page.waitForTimeout(2000);
    await clickDroneMarker(page);
    await expect(page.locator('text=Details anzeigen')).toBeVisible({ timeout: 5000 });
  });

  test('status panel shows drone data after marker click', async ({ page }) => {
    await page.waitForTimeout(2000);
    await clickDroneMarker(page);
    await expect(page.locator('text=Details anzeigen')).toBeVisible({ timeout: 5000 });
    const hasDdBm = await page.locator('text=dBm').first().isVisible().catch(() => false);
    const hasNA = await page.locator('text=N/A').first().isVisible().catch(() => false);
    expect(hasDdBm || hasNA).toBe(true);
  });

  test('status panel close button works', async ({ page }) => {
    await page.waitForTimeout(2000);
    await clickDroneMarker(page);
    const detailsButton = page.locator('button:has-text("Details anzeigen")');
    await expect(detailsButton).toBeVisible({ timeout: 5000 });
    await page.locator('button[aria-label="Panel schließen"]').click();
    await expect(detailsButton).not.toBeVisible({ timeout: 3000 });
  });

  test('details button navigates to drone detail page', async ({ page }) => {
    await page.waitForTimeout(2000);
    await clickDroneMarker(page);
    await expect(page.locator('text=Details anzeigen')).toBeVisible({ timeout: 5000 });
    await page.locator('text=Details anzeigen').click();
    await expect(page.locator('text=/← Karte/')).toBeVisible({ timeout: 5000 });
  });

  test('no error message on successful connection', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Verbindung zum Server fehlgeschlagen')).not.toBeVisible();
  });

  test('radius toggle shows controls', async ({ page }) => {
    // Radius should be enabled by default with "Radius" label visible
    await expect(page.locator('text=Radius')).toBeVisible({ timeout: 5000 });
    // 50 km should be selected by default
    const select = page.locator('select');
    await expect(select).toBeVisible();
    const selectedValue = await select.inputValue();
    expect(selectedValue).toBe('50000');
  });

  test('radius toggle disables filter and shows Alle', async ({ page }) => {
    // Click the toggle button to disable radius
    const toggle = page.locator('button[title*="Radius deaktivieren"]');
    await expect(toggle).toBeVisible({ timeout: 5000 });
    await toggle.click();

    // Should show "Alle" instead of the select dropdown
    await expect(page.locator('text=Alle')).toBeVisible({ timeout: 3000 });
    // Select dropdown should be hidden
    await expect(page.locator('select')).not.toBeVisible();
  });

  test('radius toggle re-enables filter', async ({ page }) => {
    // Disable first
    const toggleOff = page.locator('button[title*="Radius deaktivieren"]');
    await expect(toggleOff).toBeVisible({ timeout: 5000 });
    await toggleOff.click();
    await expect(page.locator('text=Alle')).toBeVisible({ timeout: 3000 });

    // Re-enable
    const toggleOn = page.locator('button[title*="Radius aktivieren"]');
    await expect(toggleOn).toBeVisible({ timeout: 3000 });
    await toggleOn.click();

    // Select dropdown should be back
    await expect(page.locator('select')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Radius')).toBeVisible();
  });

  test('radius toggle sends correct API params', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Disable radius - next API call should have radius=0
    const toggle = page.locator('button[title*="Radius deaktivieren"]');
    await toggle.click();

    // Wait for next API call and check params
    const response = await page.waitForResponse(
      resp => resp.url().includes('/api/drones') && resp.status() === 200,
      { timeout: 6000 }
    );
    const url = response.url();
    expect(url).toContain('radius=0');
  });

  test('radius select changes value', async ({ page }) => {
    // Change radius to 10 km
    const select = page.locator('select');
    await expect(select).toBeVisible({ timeout: 5000 });
    await select.selectOption('10000');

    // Wait for API call with new radius
    const response = await page.waitForResponse(
      resp => resp.url().includes('/api/drones') && resp.url().includes('radius=10000') && resp.status() === 200,
      { timeout: 6000 }
    );
    expect(response.url()).toContain('radius=10000');
  });

  test('settings button navigates to settings page', async ({ page }) => {
    const settingsBtn = page.locator('button[title="Datenquellen"]');
    await expect(settingsBtn).toBeVisible({ timeout: 5000 });
    await settingsBtn.click();
    // Should navigate to settings page (use exact match to avoid multiple elements)
    await expect(page.getByText('Datenquellen', { exact: true })).toBeVisible({ timeout: 5000 });
  });
});
