import { afterEach, expect, it, vi } from 'vitest';
import { browserStorage, historyUsage } from '../packages/history/src/capacity';
import type { HistoryMetadata } from '../packages/history/src/index';
afterEach(() => vi.unstubAllGlobals());
it('separates exact snapshot budget from estimated origin quota and handles limits', () => {
  expect(historyUsage([])).toEqual({
    records: 0,
    bytes: 0,
    remainingBytes: 256_000_000,
    remainingRecords: 10,
  });
  const records = Array.from({ length: 11 }, () => ({ bytes: 30_000_000 }) as HistoryMetadata);
  expect(historyUsage(records)).toMatchObject({
    remainingBytes: 0,
    remainingRecords: 0,
    bytes: 330_000_000,
  });
});
it('reports granted/denied/unknown persistence and quota, unsupported APIs and errors', async () => {
  vi.stubGlobal('navigator', {});
  expect(await browserStorage()).toContain('unavailable');
  const manager = {
    persist: vi.fn(async () => true),
    persisted: vi.fn(async () => false),
    estimate: vi.fn(async () => ({ usage: 1_000_000, quota: 4_000_000 })),
  } as unknown as StorageManager;
  expect(await browserStorage(false, manager)).toContain('not granted');
  expect(await browserStorage(true, manager)).toContain(
    '1.0 MB used / 4.0 MB quota. Persistence: granted',
  );
  expect(await browserStorage(true, {} as StorageManager)).toContain('unknown');
  expect(await browserStorage(false, {} as StorageManager)).toContain('unknown');
  vi.mocked(manager.estimate).mockRejectedValue(new Error('Denied'));
  expect(await browserStorage(false, manager)).toContain('Denied');
});
