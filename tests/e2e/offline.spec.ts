import { expect, test } from '@playwright/test';
test('built fixture app works with all external requests blocked and exports reproducible evidence', async ({
  page,
}, testInfo) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') {
      external.push(url.href);
      await route.abort();
    } else await route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'How reliable is the evidence?' })).toBeVisible();
  await expect(page.getByText('Development harness', { exact: false })).toBeVisible();
  await expect(page.getByText('OFFLINE · SYNTHETIC FIXTURES', { exact: false })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  expect(errors).toEqual([]);
  await expect(page.getByRole('status')).toHaveText('Offline fixtures — no live data');
  await expect
    .poll(async () => Number(await page.getByRole('status').getAttribute('data-rendered-features')))
    .toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('offline-preview.png'), fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export evidence JSON' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Missing evidence download');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const evidence = JSON.parse(Buffer.concat(chunks).toString()) as {
    id: string;
    synthetic: boolean;
    inputs: unknown[];
  };
  expect(evidence.synthetic).toBe(true);
  expect(evidence.id).toHaveLength(64);
  expect(evidence.inputs).toHaveLength(3);
  await page.getByRole('button', { name: 'Deactivate plugin' }).click();
  await expect(page.locator('#panel')).toBeEmpty();
  await page.getByRole('button', { name: 'Activate plugin' }).click();
  await expect(page.getByRole('heading', { name: 'How reliable is the evidence?' })).toBeVisible();
  await page.getByRole('button', { name: 'Export evidence JSON' }).focus();
  await expect(page.getByRole('button', { name: 'Export evidence JSON' })).toBeFocused();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
