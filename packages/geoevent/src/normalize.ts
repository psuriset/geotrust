import { z } from 'zod';
import { areaSchema } from '../../domain/src/geometry';
import { sha256 } from '../../provenance/src/index';
import { geoEventSchema, instant, freshness, type GeoEvent, type SourceId } from './schema';
export const endpoints = {
  nws: 'https://api.weather.gov/alerts?active=true&area=NC',
  usgs: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson',
} as const;
const text = z.string().nullable().default(null);
const date = instant.nullable().default(null);
const nws = z.object({
  type: z.literal('Feature'),
  geometry: areaSchema.nullable(),
  properties: z.object({
    id: z.string().min(1),
    event: z.string().min(1),
    headline: text,
    description: text,
    sent: instant,
    expires: instant,
    effective: date,
    onset: date,
    ends: date,
    status: z.string(),
    messageType: z.string(),
    severity: text,
    certainty: text,
    urgency: text,
    affectedZones: z.array(z.string()).default([]),
    references: z.array(z.object({ identifier: z.string() })).default([]),
  }),
});
const epoch = z.number().int().min(0).max(8_640_000_000_000_000);
const usgs = z.object({
  type: z.literal('Feature'),
  id: z.string().min(1),
  geometry: z.object({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number()]),
  }),
  properties: z.object({
    title: z.string().min(1),
    place: text,
    url: z.url({ protocol: /^https$/ }),
    time: epoch,
    updated: epoch,
    mag: z.number().nullable(),
    status: text,
  }),
});
const collection = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.unknown()).max(50_000),
  pagination: z.object({ next: z.string().optional() }).optional(),
});
export async function normalizeFeed(source: SourceId, payload: unknown, ingestedAt: string) {
  instant.parse(ingestedAt);
  const feed = collection.parse(payload);
  if (feed.pagination?.next)
    throw new Error('Incomplete paginated feed; refusing partial snapshot');
  const sourceGeneratedTime =
    source === 'usgs'
      ? new Date(
          z.object({ metadata: z.object({ generated: epoch }) }).parse(payload).metadata.generated,
        ).toISOString()
      : null;
  if (sourceGeneratedTime && Date.parse(sourceGeneratedTime) > Date.parse(ingestedAt) + 60_000)
    throw new Error('Future feed generation time');
  const payloadSha256 = await sha256(payload);
  const events = new Map<string, GeoEvent>();
  const conflicts = new Map<string, string>();
  const issues: string[] = [];
  let duplicates = 0;
  for (const [index, raw] of feed.features.entries()) {
    try {
      let values;
      if (source === 'nws') {
        const { properties: p, geometry } = nws.parse(raw);
        values = {
          sourceEventId: p.id,
          eventType: 'weather-alert',
          title: p.headline ?? p.event,
          description: p.description,
          geometry,
          observationTime: p.sent,
          sourceUpdatedTime: p.sent,
          expirationTime: p.expires,
          confirmationStatus:
            p.messageType === 'Cancel'
              ? 'cancelled'
              : p.status !== 'Actual'
                ? 'test'
                : 'source-issued',
          locationUncertainty: {
            basis: geometry ? 'source-polygon' : 'unknown',
            horizontalKm: null,
          },
          sourceFacts: {
            severity: p.severity,
            certainty: p.certainty,
            urgency: p.urgency,
            messageType: p.messageType,
            status: p.status,
            effective: p.effective,
            onset: p.onset,
            ends: p.ends,
            references: p.references.map((r) => r.identifier),
            affectedZones: p.affectedZones,
            magnitude: null,
            depthKm: null,
          },
        };
      } else {
        const { properties: p, geometry: g, id } = usgs.parse(raw);
        values = {
          sourceEventId: id,
          eventType: 'earthquake',
          title: p.title,
          description: p.place,
          geometry: { type: 'Point', coordinates: g.coordinates.slice(0, 2) },
          observationTime: new Date(p.time).toISOString(),
          sourceUpdatedTime: new Date(p.updated).toISOString(),
          expirationTime: null,
          confirmationStatus:
            p.status === 'reviewed' || p.status === 'automatic' ? p.status : 'unknown',
          locationUncertainty: { basis: 'epicenter', horizontalKm: null },
          sourceFacts: {
            severity: null,
            certainty: null,
            urgency: null,
            messageType: null,
            status: p.status,
            effective: null,
            onset: null,
            ends: null,
            references: [],
            affectedZones: [],
            magnitude: p.mag,
            depthKm: g.coordinates[2],
          },
        };
      }
      const event = geoEventSchema.parse({
        ...values,
        schemaVersion: '1.0.0',
        id: source + ':' + values.sourceEventId,
        ingestionTime: ingestedAt,
        source: {
          id: source,
          name: source === 'nws' ? 'NOAA/National Weather Service' : 'USGS',
          url: endpoints[source],
        },
        sourceReliability: 'authoritative-publisher',
        freshnessState: 'fresh',
        confidenceBand: 'unknown',
        contentFingerprint: await sha256(raw),
        rawPayloadReference: { sha256: payloadSha256, featureIndex: index },
        provenance: [
          {
            action: 'normalized',
            at: ingestedAt,
            sourceUrl: endpoints[source],
            payloadSha256,
            normalizerVersion: '1.0.0',
          },
        ],
      });
      if (Date.parse(event.sourceUpdatedTime) > Date.parse(ingestedAt) + 60_000)
        throw new Error('Future source timestamp');
      const conflict = conflicts.get(event.id);
      if (conflict && Date.parse(event.sourceUpdatedTime) <= Date.parse(conflict)) continue;
      const previous = events.get(event.id);
      if (previous?.contentFingerprint === event.contentFingerprint) {
        duplicates++;
        continue;
      }
      if (
        previous &&
        Date.parse(previous.sourceUpdatedTime) === Date.parse(event.sourceUpdatedTime)
      ) {
        events.delete(event.id);
        conflicts.set(event.id, event.sourceUpdatedTime);
        issues.push('Conflicting revision: ' + event.id);
        continue;
      }
      if (!previous || Date.parse(event.sourceUpdatedTime) > Date.parse(previous.sourceUpdatedTime))
        events.set(event.id, freshness(event, ingestedAt, ingestedAt));
    } catch {
      issues.push('Invalid feature at index ' + index);
    }
  }
  return {
    events: [...events.values()].sort((a, b) => a.id.localeCompare(b.id)),
    issues,
    duplicates,
    payloadSha256,
    sourceGeneratedTime,
  };
}
