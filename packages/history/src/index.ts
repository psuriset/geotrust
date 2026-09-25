import { z } from 'zod';
export const historyMetadata = z.strictObject({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  asOf: z.iso.datetime({ offset: true }),
  savedAt: z.iso.datetime({ offset: true }),
  findingCount: z.number().int().nonnegative(),
  bytes: z.number().int().positive().max(128_000_000),
});
export type HistoryMetadata = z.infer<typeof historyMetadata>;
export interface HistoryRecord extends HistoryMetadata {
  blob: Blob;
}
export interface HistoryStore {
  list(): Promise<HistoryMetadata[]>;
  get(id: string): Promise<HistoryRecord>;
  save(record: HistoryRecord): Promise<void>;
  remove(id: string): Promise<void>;
  close(): Promise<void>;
}
/** Explicitly saved snapshots, deduplicated by checksum. Limits reject rather than silently evict. */
export class IndexedHistoryStore implements HistoryStore {
  private database?: Promise<IDBDatabase>;
  constructor(
    private factory: IDBFactory = indexedDB,
    private name = 'geotrust-history-v1',
  ) {}
  private open() {
    if (!this.database)
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = this.factory.open(this.name, 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore('snapshots', { keyPath: 'sha256' });
        request.onsuccess = () => {
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(new Error('History database blocked; close other GeoTrust tabs.'));
      });
    return this.database;
  }
  private async transaction<T>(
    mode: IDBTransactionMode,
    operation: (
      store: IDBObjectStore,
      set: (result: T) => void,
      fail: (error: Error) => void,
    ) => void,
  ): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', mode);
      let value: T;
      let error: Error | undefined;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(error ?? tx.error ?? new Error('History transaction aborted'));
      tx.onerror = () => reject(error ?? tx.error);
      operation(
        tx.objectStore('snapshots'),
        (result) => {
          value = result;
        },
        (reason) => {
          error = reason;
          tx.abort();
        },
      );
    });
  }
  async list() {
    const records = await this.transaction<HistoryRecord[]>('readonly', (store, set) => {
      const request = store.getAll();
      request.onsuccess = () => set(request.result);
    });
    return records
      .map(({ blob, ...record }) => {
        void blob;
        return historyMetadata.parse(record);
      })
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.sha256.localeCompare(b.sha256));
  }
  async get(id: string): Promise<HistoryRecord> {
    const record = await this.transaction<HistoryRecord | undefined>('readonly', (store, set) => {
      const request = store.get(id);
      request.onsuccess = () => set(request.result);
    });
    if (!record) throw new Error('Saved snapshot not found');
    const { blob, ...metadata } = record;
    historyMetadata.parse(metadata);
    if (blob.size !== record.bytes) throw new Error('Saved snapshot size mismatch');
    return record;
  }
  async save(record: HistoryRecord) {
    const { blob, ...metadata } = record;
    historyMetadata.parse(metadata);
    if (blob.size !== record.bytes) throw new Error('Saved snapshot size mismatch');
    await this.transaction<void>('readwrite', (store, _set, fail) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result as HistoryRecord[];
        if (records.some((r) => r.sha256 === record.sha256)) return;
        if (
          records.length >= 10 ||
          records.reduce((n, r) => n + r.bytes, 0) + record.bytes > 256_000_000
        ) {
          fail(
            new Error(
              'Local history limit reached (10 snapshots / 256 MB). Export and delete snapshots before saving more.',
            ),
          );
          return;
        }
        store.add(record);
      };
    });
  }
  async remove(id: string) {
    await this.transaction<void>('readwrite', (store) => {
      store.delete(id);
    });
  }
  async close() {
    if (this.database) (await this.database).close();
  }
}
