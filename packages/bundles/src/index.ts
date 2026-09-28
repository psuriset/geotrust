import { zoneRecordSchema, type ZoneRecord } from '../../zones/src/index';
import { z } from 'zod';
import { inventorySchema, type Inventory } from '../../assets/src/schema';
import { snapshotSchema, type FeedSnapshot } from '../../storage/src/index';
import { sha256, canonicalJson } from '../../provenance/src/index';
import { analyzeExposure, prepareExposure, type PreparedExposure } from '../../exposure/src/index';
const bundleSchema = z.strictObject({
  schemaVersion: z.literal('1.0.0'),
  inventory: inventorySchema,
  snapshots: z.array(snapshotSchema).max(2),
  asOf: z.iso.datetime({ offset: true }),
  earthquakeRadiusKm: z.number().min(10).max(300),
  zones: z.array(zoneRecordSchema).max(200),
  result: z.unknown(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export async function createBundle(
  inventory: Inventory,
  snapshots: FeedSnapshot[],
  asOf: string,
  radiusKm = 100,
  zones: ZoneRecord[] = [],
) {
  const validated = inventorySchema.parse(inventory);
  return createPreparedBundle(prepareExposure(validated), snapshots, asOf, radiusKm, zones);
}
/** Worker-owned validated inventory/index avoids copying and indexing inventory every refresh. */
export async function createPreparedBundle(
  prepared: PreparedExposure,
  snapshots: FeedSnapshot[],
  asOf: string,
  radiusKm = 100,
  zones: ZoneRecord[] = [],
) {
  const validated = prepared.inventory;
  const feeds = snapshots.map((s) => snapshotSchema.parse(s));
  const content = {
    schemaVersion: '1.0.0' as const,
    inventory: validated,
    snapshots: feeds,
    asOf,
    earthquakeRadiusKm: radiusKm,
    zones,
    result: analyzeExposure(validated, feeds, asOf, radiusKm, zones, prepared),
  };
  return { ...content, sha256: await sha256(content) };
}
/** Verifies content and raw references then reruns deterministic analysis; checksums are not signatures. */
export async function importBundle(text: string) {
  if (new TextEncoder().encode(text).length > 128_000_000)
    throw new Error('Evidence bundle exceeds 128 MB');
  const bundle = bundleSchema.parse(JSON.parse(text));
  const { sha256: expected, ...content } = bundle;
  if ((await sha256(content)) !== expected) throw new Error('Bundle checksum mismatch');
  if (new Set(bundle.snapshots.map((s) => s.source)).size !== bundle.snapshots.length)
    throw new Error('Duplicate feed snapshots');
  for (const snapshot of bundle.snapshots) {
    for (const [hash, payload] of Object.entries(snapshot.rawPayloads))
      if ((await sha256(payload)) !== hash) throw new Error('Raw payload checksum mismatch');
    for (const event of snapshot.events) {
      const raw = snapshot.rawPayloads[event.rawPayloadReference.sha256] as
        { features?: unknown[] } | undefined;
      const feature = raw?.features?.[event.rawPayloadReference.featureIndex];
      if (!feature || (await sha256(feature)) !== event.contentFingerprint)
        throw new Error('Raw event reference mismatch');
    }
  }
  for (const zone of bundle.zones)
    if ((await sha256(zone.raw)) !== zone.sha256) throw new Error('Zone checksum mismatch');
  const result = analyzeExposure(
    bundle.inventory,
    bundle.snapshots,
    bundle.asOf,
    bundle.earthquakeRadiusKm,
    bundle.zones,
  );
  if (canonicalJson(result) !== canonicalJson(bundle.result))
    throw new Error('Analysis replay mismatch');
  return { ...bundle, result };
}
