import { z } from 'zod';
export const compatibility = {
  bundle: '1.0.0',
  result: '1.0.0',
  method: 'turf-screening-v1',
} as const;
/** Only the audited v1 identity reader exists. Never relabel or silently migrate evidence. */
export function assertCompatible(value: unknown) {
  const header = z
    .object({
      schemaVersion: z.unknown(),
      result: z.object({ schemaVersion: z.unknown(), method: z.unknown() }),
    })
    .parse(value);
  if (header.schemaVersion !== compatibility.bundle)
    throw new Error(
      'Unsupported evidence bundle version: ' +
        String(header.schemaVersion) +
        '. Supported: 1.0.0. Keep the original file; no migration is available.',
    );
  if (
    header.result.schemaVersion !== compatibility.result ||
    header.result.method !== compatibility.method
  )
    throw new Error(
      'Unsupported analysis contract or method. Supported: 1.0.0 / turf-screening-v1. No automatic migration.',
    );
}
