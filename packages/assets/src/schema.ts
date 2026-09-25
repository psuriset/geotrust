import { z } from 'zod';
import { instant } from '../../geoevent/src/schema';
const xy = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const line = z.array(xy).min(2).max(250_000);
const ring = line
  .min(4)
  .refine((p) => p[0]![0] === p.at(-1)![0] && p[0]![1] === p.at(-1)![1], 'Unclosed ring');
const polygon = z.array(ring).min(1).max(2000);
export const assetGeometry = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('Point'), coordinates: xy }),
  z.strictObject({ type: z.literal('LineString'), coordinates: line }),
  z.strictObject({
    type: z.literal('MultiLineString'),
    coordinates: z.array(line).min(1).max(2000),
  }),
  z.strictObject({ type: z.literal('Polygon'), coordinates: polygon }),
  z.strictObject({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(polygon).min(1).max(2000),
  }),
]);
export const assetSchema = z.strictObject({
  type: z.literal('Feature'),
  id: z.string().min(1),
  geometry: assetGeometry,
  properties: z.strictObject({
    kind: z.enum(['hospital', 'potential-shelter', 'road', 'community']),
    name: z.string().nullable(),
    sourceId: z.string(),
    sourceObjectId: z.string(),
    subtype: z.string().nullable(),
    operationalStatus: z.literal('unknown'),
  }),
});
export const inventorySchema = z.strictObject({
  schemaVersion: z.literal('1.0.0'),
  capturedAt: instant,
  scope: z.literal('North Carolina'),
  synthetic: z.boolean(),
  sources: z
    .array(
      z.strictObject({
        id: z.string(),
        url: z.url({ protocol: /^https$/ }),
        license: z.string(),
        termsUrl: z.url(),
        attribution: z.string(),
        vintage: z.string().nullable(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        sourceCount: z.number().int().nonnegative(),
        includedCount: z.number().int().nonnegative(),
        metadata: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1),
  assets: z.array(assetSchema).max(200_000),
});
export type Asset = z.infer<typeof assetSchema>;
export type Inventory = z.infer<typeof inventorySchema>;
