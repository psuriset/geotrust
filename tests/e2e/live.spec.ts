import { expect, test } from '@playwright/test';
import inventory from '../../data/fixtures/inventory.json' with { type: 'json' };
import nws from '../../data/fixtures/feeds/nws.json' with { type: 'json' };
import usgs from '../../data/fixtures/feeds/usgs.json' with { type: 'json' };
test('live adapter persists evidence and distinguishes outage from empty on reload', async ({
  page,
  context,
}) => {
  let failed = false;
  let empty = false;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/data/nc-inventory.json', (route) =>
    failed
      ? route.fulfill({ status: 404, body: 'Inventory offline' })
      : route.fulfill({ json: inventory }),
  );
  await context.route('**/api/feeds/*', (route) => {
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
  await expect(page.locator('#status')).toHaveText('Live feed mode — local gateway');
  await expect(page.locator('#panel')).toContainText('North Carolina exposure screening');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export reproducible evidence bundle' }).click();
  const download = await downloadPromise;
  await page.getByLabel('Replay evidence bundle').setInputFiles((await download.path())!);
  await expect(page.locator('#panel')).toContainText('verified reproducible findings');
  await page.getByRole('button', { name: 'Save snapshot locally' }).click();
  await expect(page.locator('#panel')).toContainText('1 saved snapshots');
  failed = true;
  await page.reload();
  await expect(page.locator('#panel')).toContainText('nws: degraded');
  await expect(page.locator('#panel')).toContainText('Synthetic M 3.2');
  await expect(page.locator('#panel')).toContainText('1 saved snapshots');
  await expect(page.locator('.geotrust-panel [role="status"]')).toContainText('data:prepare');
  await page.getByRole('button', { name: 'Replay saved snapshot A', exact: true }).click();
  await expect(page.locator('#panel')).toContainText('Offline replay verified');
  await page.getByRole('button', { name: 'Compare saved snapshots A and B' }).click();
  await expect(page.locator('#panel')).toContainText('COMPARE');
  failed = false;
  empty = true;
  await page.reload();
  await expect(page.locator('#panel')).toContainText('nws: empty');
  await expect(page.locator('#panel')).toContainText('usgs: empty');
  await expect(page.locator('#panel')).not.toContainText('Synthetic M 3.2');
  expect(errors).toEqual([]);
});
