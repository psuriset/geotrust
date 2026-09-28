import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import legacy from '../../data/fixtures/bundles/v1-phase4.json' with { type: 'json' };
import { createBundle } from '../../packages/bundles/src/index';
import { inventorySchema } from '../../packages/assets/src/schema';
test('offline comparison explains missing evidence, flags age, exports reports and restores verified backups', async ({
  page,
  context,
}, testInfo) => {
  await context.route('**/api/feeds/*', (route) => route.fulfill({ status: 503, body: 'Offline' }));
  await context.route('**/data/nc-inventory.json', (route) =>
    route.fulfill({ status: 404, body: 'No inventory' }),
  );
  const data = inventorySchema.parse(legacy.inventory);
  data.assets.shift();
  data.capturedAt = '2020-01-01T00:00:00Z';
  const later = await createBundle(data, [], '2026-09-26T12:00:00Z');
  await page.goto('/?mode=live');
  const panel = page.locator('.geotrust-panel');
  const status = panel.locator('[role="status"]');
  await expect(status).toContainText('data:prepare');
  const input = page.getByLabel('Replay evidence bundle');
  await input.setInputFiles(resolve('data/fixtures/bundles/v1-phase4.json'));
  await expect(status).toHaveText('Offline replay verified');
  await page.getByRole('button', { name: 'Save snapshot locally' }).click();
  await expect(panel).toContainText('1 saved snapshots');
  await input.setInputFiles({
    name: 'later.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(later)),
  });
  await expect(status).toHaveText('Offline replay verified');
  await expect(panel).toContainText('Inventory review: Review overdue');
  await page.getByRole('button', { name: 'Save snapshot locally' }).click();
  await expect(panel).toContainText('2 saved snapshots');
  await page.getByLabel('Saved snapshot A', { exact: true }).selectOption(legacy.sha256);
  await page.getByLabel('Saved snapshot B', { exact: true }).selectOption(later.sha256);
  await page.getByRole('button', { name: 'Compare saved snapshots A and B' }).click();
  await expect(status).toContainText('COMPARE');
  await expect(panel).toContainText('lacks fresh successful source coverage');
  await expect(panel).toContainText('record-removed');
  const reportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export comparison report' }).click();
  const report = JSON.parse(await readFile((await (await reportDownload).path())!, 'utf8'));
  expect(report.inputHashes).toEqual({ left: legacy.sha256, right: later.sha256 });
  expect(report.removed).toBe(legacy.result.findings.length);
  expect(report.findingChanges[0].reasons).toContain('feed-unavailable');
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export verified saved snapshot A' }).click();
  const backup = await backupDownload;
  const backupPath = (await backup.path())!;
  expect(JSON.parse(await readFile(backupPath, 'utf8')).sha256).toBe(legacy.sha256);
  await page.getByRole('button', { name: 'Delete saved snapshot A', exact: true }).click();
  await expect(panel).toContainText('1 saved snapshots');
  await input.setInputFiles(backupPath);
  await expect(status).toHaveText('Offline replay verified');
  await page.getByRole('button', { name: 'Save snapshot locally' }).click();
  await expect(panel).toContainText('2 saved snapshots');
  await page.getByRole('button', { name: 'Check browser storage' }).click();
  await expect(panel).toContainText('Origin storage estimate');
  const future = { ...legacy, schemaVersion: '2.0.0' };
  await input.setInputFiles({
    name: 'unsupported.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(future)),
  });
  await expect(status).toContainText('Unsupported evidence bundle version');
  await page.screenshot({ path: testInfo.outputPath('phase5-history.png'), fullPage: true });
});
