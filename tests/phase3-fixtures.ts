import type { Inventory, Asset } from '../packages/assets/src/schema';
import { normalizeFeed } from '../packages/geoevent/src/normalize';
import nws from '../data/fixtures/feeds/nws.json';
import usgs from '../data/fixtures/feeds/usgs.json';
import type { FeedSnapshot } from '../packages/storage/src/index';
export const at = '2026-09-25T12:00:00.000Z';
export const area: Extract<Asset['geometry'], { type: 'Polygon' }> = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-79, 35],
      [-78, 35],
      [-78, 36],
      [-79, 36],
      [-79, 35],
    ],
  ],
};
export function asset(
  id: string,
  kind: Asset['properties']['kind'],
  geometry: Asset['geometry'],
): Asset {
  return {
    type: 'Feature',
    id,
    geometry,
    properties: {
      kind,
      name: id,
      sourceId: 'test',
      sourceObjectId: id,
      subtype: null,
      operationalStatus: 'unknown',
    },
  };
}
export function inventory(): Inventory {
  return {
    schemaVersion: '1.0.0',
    capturedAt: at,
    scope: 'North Carolina',
    synthetic: true,
    sources: [
      {
        id: 'test',
        url: 'https://example.org/data',
        license: 'MIT',
        termsUrl: 'https://example.org/license',
        attribution: 'Synthetic',
        vintage: null,
        sha256: '0'.repeat(64),
        sourceCount: 5,
        includedCount: 5,
        metadata: {},
      },
    ],
    assets: [
      asset('hospital', 'hospital', { type: 'Point', coordinates: [-79, 35.5] }),
      asset('shelter', 'potential-shelter', { type: 'Point', coordinates: [-78.5, 35.5] }),
      asset('road', 'road', {
        type: 'LineString',
        coordinates: [
          [-80, 35.5],
          [-77, 35.5],
        ],
      }),
      asset('county', 'community', area),
      asset('outside', 'hospital', { type: 'Point', coordinates: [-90, 40] }),
    ],
  };
}
export async function feeds(): Promise<FeedSnapshot[]> {
  return Promise.all(
    (['nws', 'usgs'] as const).map(async (source) => {
      const payload = structuredClone(source === 'nws' ? nws : usgs);
      const normalized = await normalizeFeed(source, payload, at);
      return {
        schemaVersion: 1 as const,
        source,
        checkedAt: at,
        lastSuccess: at,
        dataAsOf: at,
        freshnessState: 'fresh' as const,
        status: 'ok' as const,
        error: null,
        events: normalized.events,
        issues: [],
        duplicates: 0,
        rawPayloads: { [normalized.payloadSha256]: payload },
      };
    }),
  );
}
