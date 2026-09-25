import { expect, test } from '@playwright/test';
import nws from '../../data/fixtures/feeds/nws.json' with { type: 'json' };
import usgs from '../../data/fixtures/feeds/usgs.json' with { type: 'json' };
import inventory from '../../data/fixtures/inventory.json' with { type: 'json' };
test('actual GeoLibre live plugin displays NC exposure and exports replayable evidence', async ({
  page,
}, testInfo) => {
  test.skip(process.env.GEOTRUST_HOST_MODE !== 'live', 'Live package test');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('geolibre.lastBasemap', '');
    localStorage.setItem(
      'geolibre.desktopSettings',
      JSON.stringify({ uiProfile: { onboarded: true } }),
    );
  });
  const external: string[] = [];
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(testInfo.project.use.baseURL as string)) return route.continue();
    external.push(url);
    return route.abort();
  });
  await page.route('**/data/nc-inventory.json', (route) => route.fulfill({ json: inventory }));
  await page.route('**/api/feeds/*', (route) => {
    const q = structuredClone(usgs);
    q.metadata.generated = Date.now();
    const weather = structuredClone(nws);
    weather.features.forEach((f) => {
      f.properties.expires = '2050-01-01T00:00:00Z';
    });
    return route.fulfill({
      json: {
        payload: route.request().url().endsWith('nws') ? weather : q,
        retrievedAt: new Date().toISOString(),
      },
    });
  });
  await page.goto('/?welcome=0');
  const layer = page.locator('[data-testid="layer-row"][data-layer-name="GeoTrust live events"]');
  await expect(layer).toBeVisible({ timeout: 30000 });
  await page.getByText('GeoTrust live feeds', { exact: true }).first().click();
  await expect(
    page.getByRole('heading', { name: 'North Carolina exposure screening' }),
  ).toBeVisible();
  await expect(page.locator('.geotrust-panel')).toContainText('alert-intersection');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export reproducible evidence bundle' }).click();
  const file = await downloaded;
  await page.getByLabel('Replay evidence bundle').setInputFiles((await file.path())!);
  await expect(page.getByText(/verified reproducible findings/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('geolibre-live-exposure.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Plugins', exact: true }).click();
  await page.getByRole('menuitem', { name: /^GeoTrust/ }).click();
  await expect(layer).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
