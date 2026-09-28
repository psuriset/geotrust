import type { HistoryMetadata } from './index';
export const historyLimits = { records: 10, bytes: 256_000_000 } as const;
export function historyUsage(records: HistoryMetadata[]) {
  const bytes = records.reduce((sum, record) => sum + record.bytes, 0);
  return {
    records: records.length,
    bytes,
    remainingBytes: Math.max(0, historyLimits.bytes - bytes),
    remainingRecords: Math.max(0, historyLimits.records - records.length),
  };
}
/** Browser-wide origin estimates are separate from GeoTrust's exact recorded bundle sizes. */
export async function browserStorage(
  requestPersistence = false,
  manager: StorageManager | undefined = globalThis.navigator?.storage,
) {
  if (!manager) return 'Browser storage estimates and persistence controls are unavailable.';
  try {
    const granted = requestPersistence ? await manager.persist?.() : await manager.persisted?.();
    const estimate = await manager.estimate?.();
    const size = (n: number | undefined) =>
      n === undefined ? 'unknown' : (n / 1e6).toFixed(1) + ' MB';
    return `Origin storage estimate: ${size(estimate?.usage)} used / ${size(estimate?.quota)} quota. Persistence: ${granted === true ? 'granted' : granted === false ? 'not granted' : 'unknown'}. Export important evidence; persistence is not a backup.`;
  } catch (error) {
    return 'Browser storage status unavailable: ' + String(error);
  }
}
