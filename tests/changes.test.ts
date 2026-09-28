import { expect, it } from 'vitest';
import { compareEvidence, inventoryAge } from '../packages/changes/src/index';
import { createBundle } from '../packages/bundles/src/index';
import { inventory, feeds, at, area } from './phase3-fixtures';
import { normalizeZone } from '../packages/zones/src/index';
const bundle = async () => createBundle(inventory(), await feeds(), at);
it('reports capture age relative to analysis and review without inventing source vintage', () => {
  const data = inventory();
  expect(inventoryAge(data, at, '2026-10-25T12:00:00Z')).toMatchObject({
    state: 'review-due',
    daysAtAnalysis: 0,
    daysAtReview: 30,
    reviewDays: 30,
  });
  expect(inventoryAge(data, at, at).state).toBe('recent-capture');
  expect(inventoryAge(data, at, '2026-09-24T12:00:00Z').state).toBe('future-capture');
  expect(inventoryAge(data, at, at).sources[0]!.vintage).toBeNull();
  expect(() => inventoryAge(data, 'bad', at)).toThrow('parameters');
  expect(() => inventoryAge(data, at, at, 0)).toThrow('parameters');
});
it('compares equal, absent and unhealthy feeds without describing recovery', async () => {
  const a = await bundle();
  expect(await compareEvidence(a, a)).toMatchObject({
    added: 0,
    removed: 0,
    unchanged: a.result.findings.length,
    updated: 0,
    eventChanges: [],
    assetChanges: [],
    findingChanges: [],
  });
  const missing = await createBundle(inventory(), [], at);
  const diff = await compareEvidence(a, missing);
  expect(diff.removed).toBe(a.result.findings.length);
  expect(
    diff.findingChanges.every(
      (f) => f.reasons.includes('feed-unavailable') && f.reasons.includes('event-not-in-snapshot'),
    ),
  ).toBe(true);
  expect(diff.eventChanges.every((c) => c.change === 'absent-in-B')).toBe(true);
  const reverse = await compareEvidence(missing, a);
  expect(reverse.added).toBe(diff.removed);
  expect(reverse.eventChanges[0]!.change).toBe('appears-in-B');
  const failed = await feeds();
  failed[0]!.status = 'failed';
  failed[1]!.dataAsOf = '2026-09-25T11:00:00Z';
  const unhealthy = await compareEvidence(a, await createBundle(inventory(), failed, at));
  expect(unhealthy.findingChanges.every((c) => c.reasons.includes('feed-unavailable'))).toBe(true);
  const empty = await feeds();
  empty.forEach((s) => {
    s.events = [];
    s.status = 'empty';
  });
  expect(
    (await compareEvidence(a, await createBundle(inventory(), empty, at))).findingChanges.every(
      (c) => !c.reasons.includes('feed-unavailable'),
    ),
  ).toBe(true);
});
it('separates expiration, source revisions, normalized revisions and temporal eligibility', async () => {
  const a = await bundle();
  const expired = await feeds();
  const later = '2026-09-25T16:00:00Z';
  expired.forEach((s) => {
    s.dataAsOf = later;
  });
  const diff = await compareEvidence(a, await createBundle(inventory(), expired, later));
  expect(diff.findingChanges.some((c) => c.reasons.includes('expiration-reached'))).toBe(true);
  expect(diff.eventChanges.some((c) => c.change === 'eligibility-changed')).toBe(true);
  for (const status of ['cancelled', 'test', 'unknown'] as const) {
    const snapshot = await feeds();
    snapshot[0]!.events.find((e) => e.geometry)!.confirmationStatus = status;
    const result = await compareEvidence(a, await createBundle(inventory(), snapshot, at));
    expect(result.findingChanges.some((c) => c.reasons.includes('event-ineligible'))).toBe(true);
  }
  const revised = await feeds();
  const e = revised[0]!.events.find((e) => e.geometry)!;
  e.contentFingerprint = '1'.repeat(64);
  e.geometry = null;
  e.title = '<script>revision</script>';
  const changes = await compareEvidence(a, await createBundle(inventory(), revised, at));
  expect(changes.eventChanges[0]).toMatchObject({ change: 'source-revision' });
  expect(
    changes.findingChanges.some(
      (c) => c.reasons.includes('source-revision') && c.reasons.includes('geometry-unavailable'),
    ),
  ).toBe(true);
  const future = await feeds();
  future[0]!.events.find((e) => e.geometry)!.sourceFacts.effective = '2026-09-26T00:00:00Z';
  expect(
    (await compareEvidence(a, await createBundle(inventory(), future, at))).findingChanges.some(
      (c) =>
        c.reasons.includes('not-yet-effective') && c.reasons.includes('normalized-record-revision'),
    ),
  ).toBe(true);
});
it('keeps snapshot asset identities separate and flags inventory revisions and analysis parameters', async () => {
  const a = await bundle();
  const data = inventory();
  data.assets[0]!.id = 'new-snapshot-id';
  data.assets[0]!.properties.name = null;
  data.assets[1]!.geometry = { type: 'Point', coordinates: [-100, 40] };
  data.sources[0]!.sha256 = '1'.repeat(64);
  const diff = await compareEvidence(a, await createBundle(data, await feeds(), at, 10));
  expect(diff).toMatchObject({ inventoryChanged: true, parametersChanged: true });
  expect(diff.assetChanges.map((c) => c.change)).toEqual(
    expect.arrayContaining(['record-added', 'record-removed', 'record-revised']),
  );
  expect(
    diff.findingChanges.some(
      (c) =>
        c.reasons.includes('inventory-record-missing') &&
        c.reasons.includes('inventory-source-revision'),
    ),
  ).toBe(true);
  expect(diff.findingChanges.some((c) => c.reasons.includes('inventory-record-revision'))).toBe(
    true,
  );
  expect(diff.findingChanges.every((c) => c.reasons.includes('analysis-parameters-changed'))).toBe(
    true,
  );
  const dup = structuredClone(a);
  dup.inventory.assets.push(dup.inventory.assets[0]!);
  await expect(compareEvidence(dup, a)).rejects.toThrow('Ambiguous duplicate');
});
it('reports zone-only changes, changed distance values and reverse time direction', async () => {
  const snapshots = await feeds();
  const e = snapshots[0]!.events.find((e) => e.geometry)!;
  e.geometry = null;
  e.sourceFacts.affectedZones = ['https://api.weather.gov/zones/forecast/NCZ071'];
  const zone = await normalizeZone(
    e.sourceFacts.affectedZones[0]!,
    { type: 'Feature', geometry: area },
    at,
  );
  const a = await createBundle(inventory(), snapshots, at, 100, [zone]);
  const b = await createBundle(inventory(), snapshots, at, 100, []);
  expect(
    (await compareEvidence(a, b)).findingChanges.some((c) =>
      c.reasons.includes('zone-geometry-revision'),
    ),
  ).toBe(true);
  const base = await bundle();
  const altered = structuredClone(base);
  altered.asOf = '2026-09-24T12:00:00Z';
  altered.result.findings.find((f) => f.distanceKm !== null)!.distanceKm = 123;
  const diff = await compareEvidence(base, altered);
  expect(diff).toMatchObject({ reverseChronology: true, updated: 1 });
  expect(diff.findingChanges[0]!.reasons).toContain('match-membership-changed');
});
