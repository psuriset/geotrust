import { zoneGeometry, type ZoneRecord } from '../../zones/src/index';
import { booleanIntersects } from '@turf/boolean-intersects';
import { bbox } from '@turf/bbox';
import { circle } from '@turf/circle';
import { distance } from '@turf/distance';
import { pointToLineDistance } from '@turf/point-to-line-distance';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { freshness, feedFreshness } from '../../geoevent/src/schema';
import type { FeedSnapshot } from '../../storage/src/index';
import type { Asset, Inventory } from '../../assets/src/schema';
export interface Finding {
  eventId: string;
  assetId: string;
  kind: 'alert-intersection' | 'epicenter-proximity';
  geometryBasis: 'source-polygon' | 'nws-zones' | 'epicenter-screen';
  distanceKm: number | null;
}
export interface ExposureRun {
  schemaVersion: '1.0.0';
  method: 'turf-screening-v1';
  asOf: string;
  earthquakeRadiusKm: number;
  complete: boolean;
  limitations: string[];
  findings: Finding[];
}
const overlaps = (a: number[], b: number[]) =>
  a[0]! <= b[2]! && a[2]! >= b[0]! && a[1]! <= b[3]! && a[3]! >= b[1]!;
/** Boolean exposure only: never computes affected population, road length, outage or failure probability. */
export function analyzeExposure(
  inventory: Inventory,
  snapshots: FeedSnapshot[],
  asOf: string,
  radiusKm = 100,
  zones: ZoneRecord[] = [],
): ExposureRun {
  if (
    !Number.isFinite(Date.parse(asOf)) ||
    !Number.isFinite(radiusKm) ||
    radiusKm < 10 ||
    radiusKm > 300
  )
    throw new Error('Invalid analysis parameters');
  const indexed = inventory.assets.map((asset) => ({ asset, bounds: bbox(asset) }));
  const limitations: string[] = [];
  const findings: Finding[] = [];
  for (const source of ['nws', 'usgs'])
    if (!snapshots.some((s) => s.source === source)) limitations.push(source + ': no snapshot');
  for (const snapshot of snapshots) {
    if (
      !['ok', 'empty'].includes(snapshot.status) ||
      feedFreshness(asOf, snapshot.dataAsOf) !== 'fresh'
    ) {
      limitations.push(snapshot.source + ': unavailable or stale evidence');
      continue;
    }
    for (const input of snapshot.events) {
      const event = freshness(input, asOf, snapshot.dataAsOf);
      if (
        event.freshnessState === 'expired' ||
        ['test', 'cancelled', 'unknown'].includes(event.confirmationStatus)
      )
        continue;
      if (event.sourceFacts.effective && Date.parse(event.sourceFacts.effective) > Date.parse(asOf))
        continue;
      const geometry = event.geometry ?? zoneGeometry(event, zones);
      if (!geometry) {
        limitations.push(event.id + ': location unknown');
        continue;
      }
      if (event.eventType === 'weather-alert') {
        const bounds = bbox(geometry);
        for (const { asset, bounds: ab } of indexed)
          if (overlaps(bounds, ab) && booleanIntersects(asset, geometry))
            findings.push({
              eventId: event.id,
              assetId: asset.id,
              kind: 'alert-intersection',
              geometryBasis: event.geometry ? 'source-polygon' : 'nws-zones',
              distanceKm: null,
            });
      } else if (geometry.type === 'Point') {
        // A 256-segment geodesic circle is used only as a community screening footprint.
        const footprint = circle(geometry, radiusKm, { units: 'kilometers', steps: 256 });
        const bounds = bbox(footprint).map((v, i) => v + (i < 2 ? -0.05 : 0.05));
        for (const { asset, bounds: ab } of indexed) {
          if (!overlaps(bounds, ab)) continue;
          let km: number | null = null;
          let matches: boolean;
          if (asset.geometry.type === 'Point') {
            km = distance(geometry, asset.geometry, { units: 'kilometers' });
            matches = km <= radiusKm;
          } else if (asset.geometry.type === 'LineString') {
            km = pointToLineDistance(geometry, asset.geometry, {
              units: 'kilometers',
              method: 'geodesic',
            });
            matches = km <= radiusKm;
          } else if (asset.geometry.type === 'MultiLineString') {
            km = Math.min(
              ...asset.geometry.coordinates.map((coordinates) =>
                pointToLineDistance(
                  geometry as GeoJSON.Point,
                  { type: 'LineString', coordinates },
                  { units: 'kilometers', method: 'geodesic' },
                ),
              ),
            );
            matches = km <= radiusKm;
          } else matches = booleanIntersects(footprint, asset as Feature<Polygon | MultiPolygon>);
          if (matches)
            findings.push({
              eventId: event.id,
              assetId: asset.id,
              kind: 'epicenter-proximity',
              geometryBasis: 'epicenter-screen',
              distanceKm: km === null ? null : Math.round(km * 1e6) / 1e6,
            });
        }
      }
    }
  }
  findings.sort((a, b) => a.eventId.localeCompare(b.eventId) || a.assetId.localeCompare(b.assetId));
  return {
    schemaVersion: '1.0.0',
    method: 'turf-screening-v1',
    asOf,
    earthquakeRadiusKm: radiusKm,
    complete: limitations.length === 0,
    limitations: limitations.sort(),
    findings,
  };
}
export function countAssets(
  findings: Finding[],
  inventory: Inventory,
): Record<Asset['properties']['kind'], number> {
  const ids = new Set(findings.map((f) => f.assetId));
  const counts = { hospital: 0, 'potential-shelter': 0, road: 0, community: 0 };
  for (const asset of inventory.assets) if (ids.has(asset.id)) counts[asset.properties.kind]++;
  return counts;
}
