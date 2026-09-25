import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import inventory from '../../data/fixtures/inventory.json' with { type: 'json' };
const path = process.env.GEOTRUST_PHASE3_BUNDLE;
test('large Phase 3 replay stays responsive, cancels, and produces identical evidence', async ({
  page,
  context,
}, testInfo) => {
  test.skip(!path, 'Set GEOTRUST_PHASE3_BUNDLE to an existing Phase 3 evidence export');
  const expected = JSON.parse(await readFile(path!, 'utf8'));
  await context.route('**/data/nc-inventory.json', (route) => route.fulfill({ json: inventory }));
  await context.route('**/api/feeds/*', (route) =>
    route.fulfill({ status: 503, body: 'Offline benchmark' }),
  );
  await page.goto('/?mode=live');
  const status = page.locator('.geotrust-panel [role="status"]');
  await expect(status).toHaveText('Analysis complete');
  const input = page.getByLabel('Replay evidence bundle');
  await input.setInputFiles(path!);
  await expect(status).toHaveText('Verifying hashes and replaying analysis');
  const cancelStarted = Date.now();
  await page.getByRole('button', { name: 'Cancel current work' }).click();
  await expect(status).toContainText('Cancelled');
  const cancellationMs = Date.now() - cancelStarted;
  expect(cancellationMs).toBeLessThan(1000);
  await page.evaluate(() => {
    const state = { ticks: 0, maxGapMs: 0, last: performance.now() };
    Object.assign(window, { geotrustTiming: state });
    setInterval(() => {
      const now = performance.now();
      state.maxGapMs = Math.max(state.maxGapMs, now - state.last);
      state.last = now;
      state.ticks++;
    }, 25);
  });
  const started = Date.now();
  await input.setInputFiles(path!);
  await expect(status).toHaveText('Offline replay verified', { timeout: 120000 });
  const replayMs = Date.now() - started;
  const timing = await page.evaluate(
    () =>
      (window as unknown as { geotrustTiming: { ticks: number; maxGapMs: number } }).geotrustTiming,
  );
  expect(timing.ticks).toBeGreaterThan(20);
  expect(timing.maxGapMs).toBeLessThan(500);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export reproducible evidence bundle' }).click();
  const download = await downloadPromise;
  const actual = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(actual.sha256).toBe(expected.sha256);
  expect(actual.result).toEqual(expected.result);
  const report = {
    bundleSha256: actual.sha256,
    bundleBytes: (await readFile(path!)).byteLength,
    findings: actual.result.findings.length,
    cancellationMs,
    replayMs,
    heartbeatTicks: timing.ticks,
    maxHeartbeatGapMs: timing.maxGapMs,
    phase3ResultsIdentical: true,
  };
  await writeFile(testInfo.outputPath('phase4-performance.json'), JSON.stringify(report, null, 2));
  await page.screenshot({ path: testInfo.outputPath('phase4-worker-history.png'), fullPage: true });
  console.info(JSON.stringify(report));
});
