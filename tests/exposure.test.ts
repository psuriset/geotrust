import { expect, it, vi, afterEach } from 'vitest';
import { analyzeExposure, countAssets } from '../packages/exposure/src/index';
import { createBundle, importBundle } from '../packages/bundles/src/index';
import { normalizeZone, zoneGeometry, resolveEventZones } from '../packages/zones/src/index';
import { sha256 } from '../packages/provenance/src/index';
import { inventory, feeds, at, area, asset } from './phase3-fixtures';
afterEach(() => vi.unstubAllGlobals());
it('screens points, boundary points, crossing roads and communities without asserting damage', async () => {
  const data = inventory();
  data.assets.push(
    asset('multi', 'road', {
      type: 'MultiLineString',
      coordinates: [
        [
          [-79, 35.5],
          [-78, 35.5],
        ],
      ],
    }),
  );
  const snapshots = await feeds();
  const result = analyzeExposure(data, snapshots, at);
  expect(result.complete).toBe(false);
  expect(result.limitations).toContain('nws:synthetic-no-geometry: location unknown');
  for (const id of ['hospital', 'shelter', 'road', 'county', 'multi'])
    expect(result.findings.some((f) => f.assetId === id && f.kind === 'alert-intersection')).toBe(
      true,
    );
  expect(result.findings.some((f) => f.assetId === 'outside')).toBe(false);
  expect(
    result.findings.some((f) => f.kind === 'epicenter-proximity' && f.distanceKm !== null),
  ).toBe(true);
  expect(countAssets(result.findings, data)).toEqual({
    hospital: 1,
    'potential-shelter': 1,
    road: 2,
    community: 1,
  });
  expect(analyzeExposure(data, [], at).limitations).toHaveLength(2);
  expect(() => analyzeExposure(data, snapshots, at, 0)).toThrow();
  expect(() => analyzeExposure(data, snapshots, 'bad')).toThrow();
  snapshots[0]!.status = 'degraded';
  expect(analyzeExposure(data, snapshots, at).limitations).toContain(
    'nws: unavailable or stale evidence',
  );
  expect(analyzeExposure(data, snapshots, '2026-09-25T13:00:00Z').findings).toHaveLength(0);
});
it('honors expiration, nonactual status, future effective time, holes and source zones', async () => {
  const snapshots = await feeds();
  snapshots[0]!.events = snapshots[0]!.events.filter((e) => e.geometry !== null);
  snapshots[1]!.events = [];
  const event = snapshots[0]!.events[0]!;
  event.confirmationStatus = 'test';
  expect(analyzeExposure(inventory(), snapshots, at).findings).toHaveLength(0);
  event.confirmationStatus = 'source-issued';
  event.sourceFacts.effective = '2026-09-26T00:00:00Z';
  expect(analyzeExposure(inventory(), snapshots, at).findings).toHaveLength(0);
  event.sourceFacts.effective = null;
  event.expirationTime = at;
  expect(analyzeExposure(inventory(), snapshots, at).findings).toHaveLength(0);
  event.expirationTime = '2026-09-25T15:00:00Z';
  event.geometry = null;
  event.sourceFacts.affectedZones = ['https://api.weather.gov/zones/forecast/NCZ071'];
  const zone = await normalizeZone(
    event.sourceFacts.affectedZones[0]!,
    { type: 'Feature', geometry: area },
    at,
  );
  expect(zoneGeometry(event, [])).toBeNull();
  expect(analyzeExposure(inventory(), snapshots, at, 100, [zone]).findings).toHaveLength(4);
  const multi = await normalizeZone(
    zone.url,
    { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [area.coordinates] } },
    at,
  );
  expect(zoneGeometry(event, [multi])?.coordinates).toHaveLength(1);
  const poly = structuredClone(area);
  poly.coordinates.push([
    [-78.6, 35.4],
    [-78.4, 35.4],
    [-78.4, 35.6],
    [-78.6, 35.6],
    [-78.6, 35.4],
  ]);
  event.geometry = poly;
  expect(
    analyzeExposure(inventory(), snapshots, at).findings.some((f) => f.assetId === 'shelter'),
  ).toBe(false);
});
it('rejects unsafe/failed zone lookups and never builds partial coverage', async () => {
  const snapshots = await feeds();
  const event = snapshots[0]!.events.find((e) => !e.geometry)!;
  event.sourceFacts.affectedZones = [
    'https://api.weather.gov/zones/forecast/NCZ071',
    'http://evil',
  ];
  const result = await resolveEventZones(
    [event],
    async () => ({ type: 'Feature', geometry: area }),
    at,
  );
  expect(result.records).toHaveLength(1);
  expect(result.errors).toEqual(['http://evil']);
  expect(zoneGeometry(event, result.records)).toBeNull();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ type: 'Feature', geometry: area })))
      .mockResolvedValueOnce(new Response('', { status: 503 })),
  );
  expect((await resolveEventZones([event])).records).toHaveLength(1);
  expect((await resolveEventZones([event])).records).toHaveLength(0);
  await expect(normalizeZone('http://evil', {}, at)).rejects.toThrow();
});
it('exports complete inputs, detects corruption and replays deterministic findings', async () => {
  const data = inventory();
  const snapshots = await feeds();
  const bundle = await createBundle(data, snapshots, at);
  expect((await importBundle(JSON.stringify(bundle))).result).toEqual(bundle.result);
  expect((await createBundle(data, snapshots, at)).sha256).toBe(bundle.sha256);
  const corrupt = structuredClone(bundle);
  corrupt.inventory.assets[0]!.properties.name = 'changed';
  await expect(importBundle(JSON.stringify(corrupt))).rejects.toThrow('checksum');
  async function resign(value: typeof bundle) {
    const { sha256: _hash, ...content } = value;
    void _hash;
    value.sha256 = await sha256(content);
    return JSON.stringify(value);
  }
  const raw = structuredClone(bundle);
  raw.snapshots[0]!.rawPayloads[Object.keys(raw.snapshots[0]!.rawPayloads)[0]!] = {};
  await expect(importBundle(await resign(raw))).rejects.toThrow('Raw payload');
  const ref = structuredClone(bundle);
  ref.snapshots[0]!.events[0]!.rawPayloadReference.featureIndex = 999;
  await expect(importBundle(await resign(ref))).rejects.toThrow('Raw event');
  const wrong = structuredClone(bundle);
  wrong.result.findings = [];
  await expect(importBundle(await resign(wrong))).rejects.toThrow('replay');
  const dup = structuredClone(bundle);
  dup.snapshots = [snapshots[0]!, snapshots[0]!];
  await expect(importBundle(await resign(dup))).rejects.toThrow('Duplicate');
  const zone = await normalizeZone(
    'https://api.weather.gov/zones/forecast/NCZ071',
    { type: 'Feature', geometry: area },
    at,
  );
  const z = await createBundle(data, snapshots, at, 100, [zone]);
  z.zones[0]!.sha256 = '0'.repeat(64);
  await expect(importBundle(await resign(z))).rejects.toThrow('Zone checksum');
  await expect(importBundle(' '.repeat(128_000_001))).rejects.toThrow('128 MB');
});
it('preserves all coastal zone parts and accepts area-only GeometryCollections losslessly', async () => {
  const url = 'https://api.weather.gov/zones/forecast/NCZ106';
  const multipart = {
    type: 'MultiPolygon',
    coordinates: Array.from({ length: 216 }, () => area.coordinates),
  };
  const record = await normalizeZone(
    url,
    { type: 'Feature', geometry: { type: 'GeometryCollection', geometries: [area, multipart] } },
    at,
  );
  expect(record.geometry.type).toBe('MultiPolygon');
  expect(record.geometry.coordinates).toHaveLength(217);
  await expect(
    normalizeZone(
      url,
      {
        type: 'Feature',
        geometry: {
          type: 'GeometryCollection',
          geometries: [{ type: 'Point', coordinates: [-78, 35] }],
        },
      },
      at,
    ),
  ).rejects.toThrow();
});
