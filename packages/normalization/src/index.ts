/** Normalize bounded fixture source shapes into domain records; report every rejected record. */
import { z } from 'zod';
import { areaSchema, lineSchema, pointSchema } from '../../domain/src/geometry';
import type { Asset, Hazard, IngestedBundle, NormalizedBundle } from '../../domain/src/types';
const timestamp = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const collection = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.unknown()).max(10_000),
});
const feature = z.object({
  type: z.literal('Feature'),
  id: z.string().min(1),
  geometry: z.unknown(),
  properties: z.unknown(),
});
const weather = z.object({
  event: z.string().min(1),
  sent: timestamp,
  effective: timestamp,
  onset: timestamp.nullable(),
  expires: timestamp,
  status: z.enum(['Actual', 'Test', 'Exercise', 'System', 'Draft']),
  messageType: z.enum(['Alert', 'Update', 'Cancel']),
  severity: z.string(),
});
const earthquake = z.object({
  title: z.string().min(1),
  mag: z.number().finite().nullable(),
  time: z.number().int().min(0).max(8_640_000_000_000_000),
  updated: z.number().int().min(0).max(8_640_000_000_000_000),
  status: z.enum(['automatic', 'reviewed', 'deleted']),
});
const quakeGeometry = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
    z.number().finite(),
  ]),
});
const assetProperties = z.object({
  name: z.string().min(1),
  kind: z.enum(['hospital', 'potential-shelter', 'major-road']),
  operationalStatus: z.literal('unknown'),
});
export function normalizeBundle(input: IngestedBundle): NormalizedBundle {
  const result: NormalizedBundle = { hazards: [], assets: [], issues: [] };
  const hazards = new Map<string, Hazard>();
  const conflicts = new Map<string, string>();
  const assets = new Map<string, Asset>();
  for (const source of input.sources) {
    const parsed = collection.safeParse(source.payload);
    if (!parsed.success) {
      result.issues.push({
        sourceId: source.id,
        recordId: 'collection',
        reason: 'Invalid FeatureCollection',
      });
      continue;
    }
    for (const [index, raw] of parsed.data.features.entries()) {
      let recordId = String(index);
      try {
        const item = feature.parse(raw);
        recordId = item.id;
        if (source.id === 'fixture-assets') {
          const props = assetProperties.parse(item.properties);
          const geometry =
            props.kind === 'major-road'
              ? lineSchema.parse(item.geometry)
              : pointSchema.parse(item.geometry);
          const id = source.id + ':' + item.id;
          if (assets.has(id)) throw new Error('Duplicate asset ID');
          assets.set(id, { id, sourceId: source.id, ...props, geometry });
          continue;
        }
        let hazard: Hazard;
        if (source.id === 'fixture-nws') {
          const props = weather.parse(item.properties);
          const startsAt = props.onset ?? props.effective;
          if (Date.parse(props.expires) <= Date.parse(startsAt))
            throw new Error('Invalid validity interval');
          hazard = {
            id: source.id + ':' + item.id,
            sourceId: source.id,
            title: props.event,
            kind: 'weather',
            geometry: item.geometry === null ? null : areaSchema.parse(item.geometry),
            geometryBasis: item.geometry === null ? 'missing' : 'source',
            observedAt: props.sent,
            updatedAt: props.sent,
            startsAt,
            expiresAt: props.expires,
            status:
              props.messageType === 'Cancel'
                ? 'cancelled'
                : props.status === 'Actual'
                  ? 'actual'
                  : 'test',
            severity: props.severity,
            magnitude: null,
            depthKm: null,
          };
        } else if (source.id === 'fixture-usgs') {
          const props = earthquake.parse(item.properties);
          const geometry = quakeGeometry.parse(item.geometry);
          hazard = {
            id: source.id + ':' + item.id,
            sourceId: source.id,
            title: props.title,
            kind: 'earthquake',
            geometry: { type: 'Point', coordinates: geometry.coordinates.slice(0, 2) },
            geometryBasis: 'source',
            observedAt: new Date(props.time).toISOString(),
            updatedAt: new Date(props.updated).toISOString(),
            startsAt: new Date(props.time).toISOString(),
            expiresAt: null,
            status: props.status === 'deleted' ? 'cancelled' : 'actual',
            severity: null,
            magnitude: props.mag,
            depthKm: geometry.coordinates[2],
          };
        } else {
          throw new Error('Unsupported fixture source');
        }
        const conflict = conflicts.get(hazard.id);
        if (conflict && hazard.updatedAt <= conflict) {
          result.issues.push({
            sourceId: source.id,
            recordId,
            reason: 'Conflicting revision quarantined',
          });
          continue;
        }
        const previous = hazards.get(hazard.id);
        if (previous) {
          result.issues.push({
            sourceId: source.id,
            recordId,
            reason: 'Duplicate event ID; latest revision retained',
          });
          if (hazard.updatedAt < previous.updatedAt) continue;
          if (hazard.updatedAt === previous.updatedAt) {
            // Ambiguous equal-time revisions cannot be resolved by source order.
            if (JSON.stringify(hazard) !== JSON.stringify(previous)) {
              conflicts.set(hazard.id, hazard.updatedAt);
              throw new Error('Conflicting equal-time revisions');
            }
            continue;
          }
        }
        hazards.set(hazard.id, hazard);
      } catch (error) {
        result.issues.push({
          sourceId: source.id,
          recordId,
          reason: error instanceof z.ZodError ? 'Invalid record schema or geometry' : String(error),
        });
        // Conflicting revisions are not a trustworthy event.
        if (String(error).includes('Conflicting equal-time revisions'))
          hazards.delete(source.id + ':' + recordId);
      }
    }
  }
  result.hazards = [...hazards.values()].sort((a, b) => a.id.localeCompare(b.id));
  result.assets = [...assets.values()].sort((a, b) => a.id.localeCompare(b.id));
  return result;
}
