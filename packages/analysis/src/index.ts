/** Deterministic point screening for small synthetic fixtures. No claims of asset failure. */
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { distance } from '@turf/distance';
import type { AnalysisResult, Finding, NormalizedBundle } from '../../domain/src/types';
export function analyze(bundle: NormalizedBundle, asOf: string, radiusKm: number): AnalysisResult {
  const time = Date.parse(asOf);
  if (!Number.isFinite(time) || !Number.isFinite(radiusKm) || radiusKm < 10 || radiusKm > 300) {
    throw new Error('Invalid analysis time or radius');
  }
  const findings: Finding[] = [];
  for (const hazard of bundle.hazards) {
    if (
      hazard.status !== 'actual' ||
      Date.parse(hazard.startsAt) > time ||
      (hazard.expiresAt !== null && Date.parse(hazard.expiresAt) <= time)
    )
      continue;
    for (const asset of bundle.assets) {
      let kind: Finding['kind'] = 'unknown';
      let metricKm: number | null = null;
      let reason = 'Geometry unavailable; exposure is unknown.';
      if (asset.geometry.type !== 'Point') {
        reason = 'Road intersection analysis is deferred; exposure is unknown.';
      } else if (hazard.geometry?.type === 'Point') {
        metricKm =
          Math.round(distance(asset.geometry, hazard.geometry, { units: 'kilometers' }) * 1000) /
          1000;
        if (metricKm > radiusKm) continue;
        kind = 'proximity';
        reason = 'Within screening radius; proximity is not shaking intensity or damage.';
      } else if (hazard.geometry) {
        if (!booleanPointInPolygon(asset.geometry, hazard.geometry, { ignoreBoundary: false }))
          continue;
        kind = 'exposure';
        reason = 'Location intersects synthetic alert coverage; operational status is unknown.';
      }
      findings.push({
        id: hazard.id + '/' + asset.id + '/' + kind,
        hazardId: hazard.id,
        assetId: asset.id,
        sourceIds: [hazard.sourceId, asset.sourceId],
        kind,
        metricKm,
        reason,
      });
    }
  }
  findings.sort((a, b) => a.id.localeCompare(b.id));
  return {
    method: 'fixture-screen-v1',
    asOf: new Date(time).toISOString(),
    radiusKm,
    findings,
    limitations: [
      'Synthetic fixture screening only.',
      'Road lengths, communities and failure propagation are not implemented.',
      'Turf screening is a fixture reference; DuckDB-WASM feasibility is deferred.',
    ],
  };
}
