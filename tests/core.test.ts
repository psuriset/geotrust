import { describe, expect, it, vi } from 'vitest';
import { loadConfig, validateConfig } from '../packages/config/src/index';
import { createFixtureAdapter } from '../packages/ingestion/src/index';
import { normalizeBundle } from '../packages/normalization/src/index';
import { analyze } from '../packages/analysis/src/index';
import {
  canonicalJson,
  createEvidence,
  evidenceLabel,
  sha256,
} from '../packages/provenance/src/index';
import { dependencyStatus, validateDependency } from '../packages/dependencies/src/index';
import { areaSchema, lineSchema, pointSchema } from '../packages/domain/src/geometry';
const input = () => createFixtureAdapter(1_000_000).load();
const normalized = () => normalizeBundle(input());
const asOf = '2026-09-25T12:00:00Z';
describe('configuration and acquisition boundary', () => {
  it('has three strict offline profiles and no secret/live fields', () => {
    for (const profile of ['development', 'test', 'production'])
      expect(loadConfig(profile).mode).toBe('fixture');
    expect(() => loadConfig('staging')).toThrow('Unknown');
    expect(() => validateConfig({ ...loadConfig('test'), mode: 'live' })).toThrow();
    expect(() => validateConfig({ ...loadConfig('test'), apiKey: 'not-a-secret' })).toThrow();
    expect(() => validateConfig({ ...loadConfig('test'), asOf: 'yesterday' })).toThrow();
    expect(() => validateConfig({ ...loadConfig('test'), earthquakeRadiusKm: 0 })).toThrow();
  });
  it('returns isolated synthetic fixtures without networking and applies byte limits', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network disabled'));
    const a = input();
    a.sources.length = 0;
    expect(input().sources).toHaveLength(3);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
    expect(() => createFixtureAdapter(0)).toThrow('Invalid input limit');
    expect(() => createFixtureAdapter(1).load()).toThrow('byte limit');
  });
});
describe('geometry validation', () => {
  it('rejects invalid coordinates, short lines and open polygon rings', () => {
    expect(pointSchema.safeParse({ type: 'Point', coordinates: [200, 35] }).success).toBe(false);
    expect(lineSchema.safeParse({ type: 'LineString', coordinates: [[-78, 35]] }).success).toBe(
      false,
    );
    expect(
      areaSchema.safeParse({
        type: 'Polygon',
        coordinates: [
          [
            [-79, 35],
            [-78, 35],
            [-78, 36],
            [-79, 36],
          ],
        ],
      }).success,
    ).toBe(false);
    expect(
      areaSchema.safeParse({
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-79, 35],
              [-78, 35],
              [-78, 36],
              [-79, 35],
            ],
          ],
        ],
      }).success,
    ).toBe(true);
  });
});
describe('deterministic point analysis', () => {
  it('separates exposure, proximity and unknown road/missing geometry outcomes', () => {
    const result = analyze(normalized(), asOf, 100);
    expect(
      result.findings.some((f) => f.kind === 'exposure' && f.assetId.endsWith('hospital-1')),
    ).toBe(true);
    expect(
      result.findings.some((f) => f.kind === 'proximity' && f.assetId.endsWith('hospital-1')),
    ).toBe(true);
    expect(
      result.findings
        .filter((f) => f.assetId.endsWith('road-1'))
        .every((f) => f.kind === 'unknown'),
    ).toBe(true);
    expect(result.findings.filter((f) => f.hazardId.endsWith('no-geometry'))).toHaveLength(3);
    expect(
      result.findings.some((f) => f.kind === 'exposure' && f.assetId.endsWith('shelter-1')),
    ).toBe(false);
    expect(() => analyze(normalized(), 'invalid', 100)).toThrow();
    expect(() => analyze(normalized(), asOf, 301)).toThrow();
    expect(() => analyze(normalized(), asOf, NaN)).toThrow();
    expect(() => analyze(normalized(), asOf, 1)).toThrow();
  });
  it('honors boundaries, holes and absence of events', () => {
    const bundle = normalized();
    bundle.hazards = [bundle.hazards.find((h) => h.geometry?.type === 'Polygon')!];
    bundle.assets = [bundle.assets.find((a) => a.kind === 'hospital')!];
    bundle.assets[0]!.geometry = { type: 'Point', coordinates: [-79, 35.5] };
    expect(analyze(bundle, asOf, 100).findings[0]?.kind).toBe('exposure');
    const geometry = bundle.hazards[0]!.geometry;
    if (geometry?.type !== 'Polygon') throw new Error('fixture');
    geometry.coordinates.push([
      [-78.8, 35.6],
      [-78.5, 35.6],
      [-78.5, 35.9],
      [-78.8, 35.9],
      [-78.8, 35.6],
    ]);
    bundle.assets[0]!.geometry = { type: 'Point', coordinates: [-78.65, 35.78] };
    expect(analyze(bundle, asOf, 100).findings).toEqual([]);
    expect(analyze({ hazards: [], assets: [], issues: [] }, asOf, 100).findings).toEqual([]);
  });
  it('excludes future, expired, cancelled and non-actual events', () => {
    const bundle = normalized();
    for (const hazard of bundle.hazards) hazard.status = 'test';
    expect(analyze(bundle, asOf, 100).findings).toEqual([]);
    for (const hazard of bundle.hazards) {
      hazard.status = 'actual';
      hazard.startsAt = '2026-09-26T00:00:00Z';
    }
    expect(analyze(bundle, asOf, 100).findings).toEqual([]);
    for (const hazard of bundle.hazards) {
      hazard.startsAt = '2026-09-24T00:00:00Z';
      hazard.expiresAt = asOf;
    }
    expect(analyze(bundle, asOf, 100).findings).toEqual([]);
  });
  it('uses geodesic distances with a known one-degree equator reference', () => {
    const bundle = normalized();
    bundle.hazards = [bundle.hazards.find((h) => h.kind === 'earthquake')!];
    bundle.hazards[0]!.geometry = { type: 'Point', coordinates: [0, 0] };
    bundle.hazards[0]!.startsAt = '2026-09-24T00:00:00Z';
    bundle.assets = [bundle.assets[0]!];
    bundle.assets[0]!.geometry = { type: 'Point', coordinates: [1, 0] };
    expect(analyze(bundle, asOf, 200).findings[0]?.metricKm).toBeCloseTo(111.195, 2);
    expect(analyze(bundle, asOf, 100).findings).toEqual([]);
  });
});
describe('provenance', () => {
  it('canonicalizes object keys, preserves array order, rejects non-JSON values', async () => {
    expect(canonicalJson({ b: true, a: [null, 3, 'x'] })).toBe('{"a":[null,3,"x"],"b":true}');
    expect(await sha256({ a: 1, b: 2 })).toBe(await sha256({ b: 2, a: 1 }));
    for (const value of [undefined, NaN, Infinity, () => 1, new Date()])
      expect(() => canonicalJson(value)).toThrow();
  });
  it('reproduces runs, changes on input/parameter changes and reports validation gaps', async () => {
    const sources = input();
    const bundle = normalizeBundle(sources);
    const result = analyze(bundle, asOf, 100);
    const a = await createEvidence(sources, result, []);
    expect(a.id).toHaveLength(64);
    expect(a.id).toBe((await createEvidence(sources, result, [])).id);
    expect(a.id).not.toBe((await createEvidence(sources, { ...result, radiusKm: 50 }, [])).id);
    sources.sources[0]!.payload = { changed: true };
    expect(a.id).not.toBe((await createEvidence(sources, result, [])).id);
    const issues = [
      { sourceId: 'b', recordId: '2', reason: 'invalid' },
      { sourceId: 'a', recordId: '1', reason: 'missing' },
    ];
    const run = await createEvidence(input(), result, issues);
    expect(run.id).toBe((await createEvidence(input(), result, [...issues].reverse())).id);
    expect(evidenceLabel(run)).toContain('2 validation issues');
  });
});
describe('dependency boundary', () => {
  it('requires evidence and never turns edges into predictions', () => {
    const edge = {
      from: 'a',
      to: 'b',
      kind: 'access',
      evidenceId: 'source-1',
      asOf,
      status: 'assumed',
    };
    expect(validateDependency(edge)).toEqual(edge);
    expect(() => validateDependency({ ...edge, from: 'b' })).toThrow();
    expect(() => validateDependency({ ...edge, evidenceId: '' })).toThrow();
    expect(dependencyStatus([]).reason).toContain('Unknown');
    expect(dependencyStatus([validateDependency(edge)]).reason).toContain('deferred');
  });
});
