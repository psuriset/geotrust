import { z } from 'zod';
import { pointSchema, areaSchema } from '../../domain/src/geometry';
export const instant = z.iso.datetime({ offset: true });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const sourceId = z.enum(['nws', 'usgs']);
export const geoEventSchema = z.strictObject({
  schemaVersion: z.literal('1.0.0'),
  id: z.string().min(1),
  eventType: z.enum(['weather-alert', 'earthquake']),
  title: z.string().min(1),
  description: z.string().nullable(),
  geometry: z
    .union([pointSchema.strict(), areaSchema.options[0].strict(), areaSchema.options[1].strict()])
    .nullable(),
  observationTime: instant,
  ingestionTime: instant,
  sourceUpdatedTime: instant,
  source: z.strictObject({ id: sourceId, name: z.string(), url: z.url({ protocol: /^https$/ }) }),
  sourceEventId: z.string().min(1),
  sourceReliability: z.literal('authoritative-publisher'),
  freshnessState: z.enum(['fresh', 'stale', 'unavailable', 'expired']),
  locationUncertainty: z.strictObject({
    basis: z.enum(['source-polygon', 'epicenter', 'unknown']),
    horizontalKm: z.number().nonnegative().nullable(),
  }),
  confidenceBand: z.literal('unknown'),
  confirmationStatus: z.enum([
    'source-issued',
    'reviewed',
    'automatic',
    'test',
    'cancelled',
    'unknown',
  ]),
  expirationTime: instant.nullable(),
  provenance: z
    .array(
      z.strictObject({
        action: z.literal('normalized'),
        at: instant,
        sourceUrl: z.url({ protocol: /^https$/ }),
        payloadSha256: hash,
        normalizerVersion: z.literal('1.0.0'),
      }),
    )
    .min(1),
  rawPayloadReference: z.strictObject({
    sha256: hash,
    featureIndex: z.number().int().nonnegative(),
  }),
  contentFingerprint: hash,
  sourceFacts: z.strictObject({
    severity: z.string().nullable(),
    certainty: z.string().nullable(),
    urgency: z.string().nullable(),
    messageType: z.string().nullable(),
    status: z.string().nullable(),
    effective: instant.nullable(),
    onset: instant.nullable(),
    ends: instant.nullable(),
    references: z.array(z.string()),
    affectedZones: z.array(z.string()),
    magnitude: z.number().nullable(),
    depthKm: z.number().nullable(),
  }),
});
export type GeoEvent = z.infer<typeof geoEventSchema>;
export type SourceId = z.infer<typeof sourceId>;
export function feedFreshness(
  now: string,
  lastSuccess: string | null,
): 'fresh' | 'stale' | 'unavailable' {
  const age = lastSuccess === null ? Infinity : Date.parse(now) - Date.parse(lastSuccess);
  return age >= 1_800_000 ? 'unavailable' : age >= 300_000 ? 'stale' : 'fresh';
}
export function freshness(event: GeoEvent, now: string, lastSuccess: string | null): GeoEvent {
  const expired =
    event.expirationTime !== null && Date.parse(event.expirationTime) <= Date.parse(now);
  return {
    ...event,
    freshnessState: expired ? 'expired' : feedFreshness(now, lastSuccess),
  };
}
