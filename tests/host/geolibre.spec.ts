import { expect, test } from '@playwright/test';
test('pinned actual GeoLibre loads GeoTrust, renders evidence and cleans up through the public UI', async ({
  page,
}, testInfo) => {
  test.skip(process.env.GEOTRUST_HOST_MODE === 'live', 'Fixture package test');
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'http:' && url.hostname === '127.0.0.1') await route.continue();
    else {
      external.push(url.href);
      await route.abort();
    }
  });
  // Seed the host's inspected preference format; application integration uses public APIs only.
  await page.addInitScript(() => {
    localStorage.setItem('geolibre.lastBasemap', '');
    localStorage.setItem(
      'geolibre.desktopSettings',
      JSON.stringify({ uiProfile: { onboarded: true } }),
    );
  });
  await page.goto('/?welcome=0');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 30000 });
  const layer = page.locator(
    '[data-testid="layer-row"][data-layer-name="GeoTrust synthetic fixtures"]',
  );
  await expect(layer).toBeVisible();
  await page.getByText('GeoTrust · offline fixtures', { exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'How reliable is the evidence?' })).toBeVisible();
  await layer.getByRole('button', { name: 'Hide layer', exact: true }).click();
  await expect(layer.getByRole('button', { name: 'Show layer', exact: true })).toBeVisible();
  await layer.getByRole('button', { name: 'Show layer', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('geolibre-geotrust.png'), fullPage: true });
  await page.getByRole('button', { name: 'Plugins', exact: true }).click();
  await page.getByRole('menuitem', { name: /^GeoTrust/ }).click();
  await expect(layer).toHaveCount(0);
  await page.getByRole('button', { name: 'Plugins', exact: true }).click();
  await page.getByRole('menuitem', { name: /^GeoTrust/ }).click();
  await expect(layer).toBeVisible();
  await page.reload();
  await expect(layer).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
