import { expect, it } from 'vitest';
import { createFixtureAdapter } from '../packages/ingestion/src/index';
import { normalizeBundle } from '../packages/normalization/src/index';
const fixture = () => createFixtureAdapter(1_000_000).load();
interface RawFeature {
  id: string;
  geometry: unknown;
  properties: Record<string, unknown>;
}
function source(kind: string) {
  const bundle = fixture();
  const src = bundle.sources.find((s) => s.id === kind)!;
  return { bundle, src, features: (src.payload as { features: RawFeature[] }).features };
}
it('normalizes both source shapes, missing geometry and USGS depth without treating depth as elevation', () => {
  const bundle = normalizeBundle(fixture());
  expect(bundle.assets).toHaveLength(3);
  expect(bundle.hazards).toHaveLength(3);
  expect(bundle.issues).toEqual([]);
  const quake = bundle.hazards.find((h) => h.kind === 'earthquake')!;
  expect(quake.geometry?.type === 'Point' && quake.geometry.coordinates).toEqual([-78.5, 35.7]);
  expect(quake.depthKm).toBe(5);
  expect(quake.magnitude).toBe(3.2);
  expect(bundle.hazards.find((h) => h.geometry === null)?.geometryBasis).toBe('missing');
});
it('reports invalid collections, records and unsupported sources instead of hiding them', () => {
  const a = fixture();
  a.sources[0]!.payload = null;
  expect(normalizeBundle(a).issues[0]?.reason).toBe('Invalid FeatureCollection');
  const b = source('fixture-nws');
  b.features.push({ id: '', geometry: null, properties: {} });
  expect(normalizeBundle(b.bundle).issues).toHaveLength(1);
  const c = source('fixture-nws');
  c.src.id = 'unknown';
  expect(normalizeBundle(c.bundle).issues[0]?.reason).toContain('Unsupported');
  const d = source('fixture-nws');
  d.features[0]!.properties.expires = '2026-09-24T00:00:00Z';
  expect(normalizeBundle(d.bundle).issues[0]?.reason).toContain('validity');
});
it('supports non-actual, cancelled, nullable magnitude and deleted fixture events', () => {
  for (const status of ['Test', 'Exercise', 'System', 'Draft']) {
    const a = source('fixture-nws');
    a.features[0]!.properties.status = status;
    expect(normalizeBundle(a.bundle).hazards.find((h) => h.id.endsWith('warning-1'))?.status).toBe(
      'test',
    );
  }
  const b = source('fixture-nws');
  b.features[0]!.properties.messageType = 'Cancel';
  expect(normalizeBundle(b.bundle).hazards.find((h) => h.id.endsWith('warning-1'))?.status).toBe(
    'cancelled',
  );
  const c = source('fixture-usgs');
  c.features[0]!.properties.status = 'deleted';
  c.features[0]!.properties.mag = null;
  const quake = normalizeBundle(c.bundle).hazards.find((h) => h.kind === 'earthquake')!;
  expect(quake.status).toBe('cancelled');
  expect(quake.magnitude).toBeNull();
});
it('deduplicates events, rejects duplicate assets and chooses latest revisions independent of order', () => {
  const a = source('fixture-assets');
  a.features.push(structuredClone(a.features[0]!));
  expect(normalizeBundle(a.bundle).assets).toHaveLength(3);
  expect(normalizeBundle(a.bundle).issues[0]?.reason).toContain('Duplicate asset');
  const b = source('fixture-nws');
  b.features.push(structuredClone(b.features[0]!));
  expect(normalizeBundle(b.bundle).hazards).toHaveLength(3);
  expect(normalizeBundle(b.bundle).issues[0]?.reason).toContain('Duplicate event');
  const updated = structuredClone(b.features[0]!);
  updated.properties.sent = '2026-09-25T11:15:00Z';
  updated.properties.event = 'Updated fixture';
  b.features.push(updated);
  const expected = normalizeBundle(b.bundle).hazards;
  b.features.reverse();
  expect(normalizeBundle(b.bundle).hazards).toEqual(expected);
  expect(expected.find((h) => h.id.endsWith('warning-1'))?.title).toBe('Updated fixture');
});
it('quarantines conflicting equal-time revisions', () => {
  const a = source('fixture-nws');
  const duplicate = structuredClone(a.features[0]!);
  duplicate.properties.event = 'Conflicting title';
  a.features.push(duplicate);
  expect(normalizeBundle(a.bundle).hazards.some((h) => h.id.endsWith('warning-1'))).toBe(false);
  expect(normalizeBundle(a.bundle).issues.some((i) => i.reason.includes('Conflicting'))).toBe(true);
});

it('does not resurrect quarantined conflicts with a third duplicate or older revision', () => {
  const a = source('fixture-nws');
  const first = structuredClone(a.features[0]!);
  const conflict = structuredClone(first);
  conflict.properties.event = 'Conflict';
  const older = structuredClone(first);
  older.properties.sent = '2026-09-25T10:30:00Z';
  a.features.push(conflict, first, older);
  expect(normalizeBundle(a.bundle).hazards.some((h) => h.id.endsWith('warning-1'))).toBe(false);
  const newer = structuredClone(first);
  newer.properties.sent = '2026-09-25T11:45:00Z';
  a.features.push(newer);
  expect(normalizeBundle(a.bundle).hazards.some((h) => h.id.endsWith('warning-1'))).toBe(true);
});
