import { z } from 'zod';
import { geoEventSchema, instant, sourceId } from '../../geoevent/src/schema';
export const snapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: sourceId,
  checkedAt: instant,
  lastSuccess: instant.nullable(),
  dataAsOf: instant.nullable(),
  freshnessState: z.enum(['fresh', 'stale', 'unavailable']),
  status: z.enum(['ok', 'empty', 'degraded', 'failed']),
  error: z.string().nullable(),
  events: z.array(geoEventSchema),
  issues: z.array(z.string()),
  duplicates: z.number().int().nonnegative(),
  rawPayloads: z.record(z.string(), z.unknown()),
});
export type FeedSnapshot = z.infer<typeof snapshotSchema>;
export interface EvidenceStore {
  get(source: string): Promise<FeedSnapshot | undefined>;
  put(snapshot: FeedSnapshot): Promise<void>;
  clear(): Promise<void>;
}
/** Atomic last snapshot + raw payload replacement, bounded to two feeds. No silent memory fallback. */
export class IndexedEvidenceStore implements EvidenceStore {
  private db: Promise<IDBDatabase>;
  constructor(factory: IDBFactory = indexedDB, name = 'geotrust-evidence-v1') {
    this.db = new Promise((resolve, reject) => {
      const request = factory.open(name, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('feeds', { keyPath: 'source' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Evidence database upgrade blocked'));
    });
  }
  private async transaction<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('feeds', mode);
      const request = operation(tx.objectStore('feeds'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error('Evidence transaction aborted'));
      tx.onerror = () => reject(tx.error);
    });
  }
  async get(source: string): Promise<FeedSnapshot | undefined> {
    const value: unknown = await this.transaction('readonly', (s) => s.get(source));
    return value === undefined ? undefined : snapshotSchema.parse(value);
  }
  async put(snapshot: FeedSnapshot): Promise<void> {
    await this.transaction('readwrite', (s) => s.put(snapshotSchema.parse(snapshot)));
  }
  async clear(): Promise<void> {
    await this.transaction('readwrite', (s) => s.clear());
  }
  async close(): Promise<void> {
    (await this.db).close();
  }
}
