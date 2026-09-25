import { z } from 'zod';
import { assetGeometry } from '../../assets/src/schema';
const areaSchema = z.union([assetGeometry.options[3], assetGeometry.options[4]]);
import { sha256 } from '../../provenance/src/index';
import type { GeoEvent } from '../../geoevent/src/schema';
export const zoneUrl = z
  .string()
  .regex(/^https:\/\/api\.weather\.gov\/zones\/(forecast|county|fire)\/[A-Z]{2}[CZ][0-9]{3}$/);
export const zoneRecordSchema = z.strictObject({
  url: zoneUrl,
  capturedAt: z.iso.datetime({ offset: true }),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  geometry: areaSchema,
  raw: z.unknown(),
});
export type ZoneRecord = z.infer<typeof zoneRecordSchema>;
export async function normalizeZone(
  url: string,
  raw: unknown,
  capturedAt: string,
): Promise<ZoneRecord> {
  zoneUrl.parse(url);
  const feature = z
    .object({
      type: z.literal('Feature'),
      geometry: z.union([
        areaSchema,
        z.object({
          type: z.literal('GeometryCollection'),
          geometries: z.array(areaSchema).min(1).max(2000),
        }),
      ]),
    })
    .parse(raw);
  const geometry =
    feature.geometry.type === 'GeometryCollection'
      ? {
          type: 'MultiPolygon' as const,
          coordinates: feature.geometry.geometries.flatMap((g) =>
            g.type === 'Polygon' ? [g.coordinates] : g.coordinates,
          ),
        }
      : feature.geometry;
  return zoneRecordSchema.parse({
    url,
    capturedAt,
    raw,
    geometry,
    sha256: await sha256(raw),
  });
}
export async function resolveEventZones(
  events: GeoEvent[],
  loader: (url: string) => Promise<unknown> = async (url) => {
    const response = await fetch('/api/zones/' + zoneUrl.parse(url).split('/zones/')[1], {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Zone unavailable');
    return response.json();
  },
  at = new Date().toISOString(),
) {
  const urls = [
    ...new Set(
      events
        .filter((e) => e.eventType === 'weather-alert' && !e.geometry)
        .flatMap((e) => e.sourceFacts.affectedZones),
    ),
  ].slice(0, 200);
  const records: ZoneRecord[] = [];
  const errors: string[] = [];
  for (const url of urls) {
    try {
      records.push(await normalizeZone(url, await loader(zoneUrl.parse(url)), at));
    } catch {
      errors.push(url);
    }
  }
  return { records, errors };
}
/** Uses all source zones or none; never silently narrows an unresolved alert to a partial zone set. */
export function zoneGeometry(event: GeoEvent, zones: ZoneRecord[]) {
  const urls = event.sourceFacts.affectedZones;
  if (!urls.length) return null;
  const selected = urls.map((url) => zones.find((z) => z.url === url));
  if (selected.some((z) => !z)) return null;
  return {
    type: 'MultiPolygon' as const,
    coordinates: selected.flatMap((z) =>
      z!.geometry.type === 'Polygon' ? [z!.geometry.coordinates] : z!.geometry.coordinates,
    ),
  };
}
