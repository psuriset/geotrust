/** Bounded WGS84 schemas for the small fixture contract, not a GIS repair engine. */
import { z } from 'zod';
const coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const ring = z
  .array(coordinate)
  .min(4)
  .max(10_000)
  .refine((points) => {
    const first = points[0];
    const last = points.at(-1);
    return first?.[0] === last?.[0] && first?.[1] === last?.[1];
  }, 'Polygon ring must be closed');
export const pointSchema = z.object({ type: z.literal('Point'), coordinates: coordinate });
export const lineSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(coordinate).min(2).max(10_000),
});
export const areaSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1).max(100) }),
  z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(ring).min(1).max(100)).min(1).max(100),
  }),
]);
