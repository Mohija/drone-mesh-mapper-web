import { test, expect } from '@playwright/test';

test.describe('Drone Detail Page', () => {
  test('loads drone detail page directly', async ({ page }) => {
    await page.goto('/drone/AZTEST001');

    await expect(page.locator('text=Desert Eagle')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=AZTEST001')).toBeVisible();
  });

  test('shows live status section', async ({ page }) => {
    await page.goto('/drone/AZTEST001');

    await expect(page.locator('text=Live-Status')).toBeVisible({ timeout: 10000 });
    // "Batterie" appears in both Live-Status card and StatusHistory table
    await expect(page.locator('text=Batterie').first()).toBeVisible();
  });

  test('shows position section', async ({ page }) => {
    await page.goto('/drone/AZTEST001');

    await expect(page.locator('text=Breitengrad').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Längengrad').first()).toBeVisible();
    await expect(page.locator('text=Flugmuster')).toBeVisible();
  });

  test('shows FAA registration section', async ({ page }) => {
    await page.goto('/drone/AZTEST001');

    await expect(page.locator('text=FAA Registrierung')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Hersteller')).toBeVisible();
    await expect(page.locator('text=Seriennr.')).toBeVisible();
  });

  test('shows status history section', async ({ page }) => {
    await page.goto('/drone/AZTEST001');

    await expect(page.locator('text=Status-Verlauf')).toBeVisible({ timeout: 10000 });
  });

  test('shows drone status badge', async ({ page }) => {
    await page.goto('/drone/AZTEST001');

    // Wait for page to load
    await expect(page.locator('text=Desert Eagle')).toBeVisible({ timeout: 10000 });
    // Status should be one of: ACTIVE, IDLE, ERROR, LOST
    const statusBadge = page.locator('text=/ACTIVE|IDLE|ERROR|LOST/');
    await expect(statusBadge.first()).toBeVisible();
  });

  test('back button navigates to map', async ({ page }) => {
    await page.goto('/drone/AZTEST001');

    await expect(page.locator('text=Desert Eagle')).toBeVisible({ timeout: 10000 });
    await page.locator('text=/← Karte/').click();

    await expect(page.locator('text=Drone Mesh Mapper')).toBeVisible({ timeout: 5000 });
  });

  test('nonexistent drone shows error', async ({ page }) => {
    await page.goto('/drone/NONEXISTENT');

    await expect(page.locator('text=Drohne nicht gefunden')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Zur Karte')).toBeVisible();
  });

  test('error page back button works', async ({ page }) => {
    await page.goto('/drone/NONEXISTENT');

    await expect(page.locator('text=Zur Karte')).toBeVisible({ timeout: 10000 });
    await page.locator('text=Zur Karte').click();

    await expect(page.locator('text=Drone Mesh Mapper')).toBeVisible({ timeout: 5000 });
  });

  test('all configured drones accessible', async ({ page }) => {
    const drones = [
      { id: 'AZTEST001', name: 'Desert Eagle' },
      { id: 'AZTEST002', name: 'Cactus Hawk' },
      { id: 'AZTEST003', name: 'Saguaro Scout' },
      { id: 'AZTEST004', name: 'Mesa Phantom' },
      { id: 'AZTEST005', name: 'Sonoran Surveyor' },
    ];

    for (const drone of drones) {
      await page.goto(`/drone/${drone.id}`);
      await expect(page.locator(`text=${drone.name}`)).toBeVisible({ timeout: 10000 });
    }
  });
});
