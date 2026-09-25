import { Blob } from 'node:buffer';
import { expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedHistoryStore, type HistoryRecord } from '../packages/history/src/index';
const record = (n = 0, bytes = 1): HistoryRecord => ({
  sha256: n.toString(16).padStart(64, '0'),
  asOf: '2026-09-25T12:00:00Z',
  savedAt: '2026-09-25T13:00:00Z',
  findingCount: n,
  bytes,
  blob: new Blob([new Uint8Array(bytes)]) as unknown as globalThis.Blob,
});
it('persists dated snapshots, deduplicates atomically, reloads, deletes and refuses missing/corrupt records', async () => {
  const factory = new IDBFactory();
  const db = new IndexedHistoryStore(factory);
  expect(await db.list()).toEqual([]);
  await Promise.all([db.save(record()), db.save(record())]);
  expect(await db.list()).toHaveLength(1);
  expect((await db.get(record().sha256)).blob.size).toBe(1);
  await db.close();
  const reload = new IndexedHistoryStore(factory);
  expect(await reload.list()).toHaveLength(1);
  await reload.remove(record().sha256);
  await expect(reload.get(record().sha256)).rejects.toThrow('not found');
  await expect(reload.save({ ...record(), bytes: 2 })).rejects.toThrow('size mismatch');
  await expect(reload.save({ ...record(), sha256: 'bad' })).rejects.toThrow();
  await reload.close();
  await new IndexedHistoryStore(factory, 'unused').close();
});
it('enforces count and byte limits without eviction and propagates storage failures', async () => {
  const db = new IndexedHistoryStore(new IDBFactory());
  for (let n = 0; n < 10; n++) await db.save(record(n));
  await expect(db.save(record(11))).rejects.toThrow('limit reached');
  expect(await db.list()).toHaveLength(10);
  await db.close();
  // Blob sizes are checked before writing, and total bytes are enforced atomically.
  const huge = new IndexedHistoryStore(new IDBFactory());
  await huge.save(record(0, 128_000_000));
  await huge.save(record(1, 128_000_000));
  await expect(huge.save(record(2))).rejects.toThrow('limit reached');
  await huge.close();
  const factory = new IDBFactory();
  vi.spyOn(factory, 'open').mockImplementation(() => {
    throw new Error('storage disabled');
  });
  await expect(new IndexedHistoryStore(factory).list()).rejects.toThrow('storage disabled');
});
it('reports blocked/open failures, detects corrupt stored metadata, and releases connections on version changes', async () => {
  for (const mode of ['blocked', 'error'] as const) {
    const factory = new IDBFactory();
    const request = { error: new Error('open failed') } as unknown as IDBOpenDBRequest;
    vi.spyOn(factory, 'open').mockImplementation(() => {
      queueMicrotask(() =>
        mode === 'blocked'
          ? request.onblocked!({} as IDBVersionChangeEvent)
          : request.onerror!({} as Event),
      );
      return request;
    });
    await expect(new IndexedHistoryStore(factory).list()).rejects.toThrow(
      mode === 'blocked' ? 'blocked' : 'open failed',
    );
  }
  const factory = new IDBFactory();
  const history = new IndexedHistoryStore(factory);
  await history.save(record());
  await history.save({ ...record(1), savedAt: '2026-09-26T13:00:00Z' });
  expect((await history.list())[0]!.sha256).toBe(record(1).sha256);
  const request = factory.open('geotrust-history-v1', 1);
  const db = await new Promise<IDBDatabase>((resolve) => {
    request.onsuccess = () => resolve(request.result);
  });
  await new Promise<void>((resolve) => {
    const tx = db.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').put({ ...record(), bytes: 2 });
    tx.oncomplete = () => resolve();
  });
  await expect(history.get(record().sha256)).rejects.toThrow('size mismatch');
  db.close();
  const upgrade = factory.open('geotrust-history-v1', 2);
  const upgraded = await new Promise<IDBDatabase>((resolve) => {
    upgrade.onsuccess = () => resolve(upgrade.result);
  });
  upgraded.close();
});
