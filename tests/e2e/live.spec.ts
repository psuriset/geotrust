import { expect, test } from '@playwright/test';
import nws from '../../data/fixtures/feeds/nws.json' with { type: 'json' };
import usgs from '../../data/fixtures/feeds/usgs.json' with { type: 'json' };
test('live adapter persists evidence and distinguishes outage from empty on reload', async ({
  page,
}) => {
  let failed = false;
  let empty = false;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/feeds/*', (route) => {
    if (failed) return route.fulfill({ status: 503, body: 'Feed unavailable' });
    const quake = structuredClone(usgs);
    quake.metadata.generated = Date.now();
    const payload = empty
      ? { type: 'FeatureCollection', features: [], metadata: { generated: Date.now() } }
      : route.request().url().endsWith('nws')
        ? nws
        : quake;
    return route.fulfill({ json: { payload, retrievedAt: new Date().toISOString() } });
  });
  await page.goto('/?mode=live');
  await expect(page.locator('#panel')).toContainText('nws: ok');
  await expect(page.locator('#panel')).toContainText('usgs: ok');
  await expect(page.getByRole('status')).toHaveText('Live feed mode — local gateway');
  failed = true;
  await page.reload();
  await expect(page.locator('#panel')).toContainText('nws: degraded');
  await expect(page.locator('#panel')).toContainText('Synthetic M 3.2');
  failed = false;
  empty = true;
  await page.reload();
  await expect(page.locator('#panel')).toContainText('nws: empty');
  await expect(page.locator('#panel')).toContainText('usgs: empty');
  await expect(page.locator('#panel')).not.toContainText('Synthetic M 3.2');
  expect(errors).toEqual([]);
});
