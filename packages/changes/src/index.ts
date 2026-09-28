import type { importBundle } from '../../bundles/src/index';
import type { Inventory } from '../../assets/src/schema';
import type { GeoEvent } from '../../geoevent/src/schema';
import { feedFreshness } from '../../geoevent/src/schema';
import { canonicalJson, sha256 } from '../../provenance/src/index';
import { zoneGeometry } from '../../zones/src/index';
type Bundle = Awaited<ReturnType<typeof importBundle>>;
/** Capture-age policy, never an assertion that source observations are current. */
export function inventoryAge(
  inventory: Inventory,
  asOf: string,
  checkedAt: string,
  reviewDays = 30,
) {
  if (
    ![asOf, checkedAt, inventory.capturedAt].every((value) => Number.isFinite(Date.parse(value))) ||
    !Number.isFinite(reviewDays) ||
    reviewDays <= 0
  )
    throw new Error('Invalid inventory age parameters');
  const days = (at: string) => (Date.parse(at) - Date.parse(inventory.capturedAt)) / 86_400_000;
  const age = days(checkedAt);
  return {
    capturedAt: inventory.capturedAt,
    checkedAt,
    reviewDays,
    daysAtAnalysis: Math.floor(days(asOf)),
    daysAtReview: Math.floor(age),
    state:
      age < 0
        ? ('future-capture' as const)
        : age >= reviewDays
          ? ('review-due' as const)
          : ('recent-capture' as const),
    sources: inventory.sources.map((source) => ({ id: source.id, vintage: source.vintage })),
    message: `${reviewDays}-day capture review policy is local guidance, not a provider freshness guarantee. Source vintage may be unknown; capture time is not observation time.`,
  };
}
export const reasonText = {
  'feed-unavailable': 'The snapshot without this match lacks fresh successful source coverage.',
  'event-not-in-snapshot':
    'The event record is absent from one snapshot; absence does not establish that a hazard ended.',
  'expiration-reached':
    'The recorded expiration time has been reached in the snapshot without this match.',
  'event-ineligible': 'The recorded confirmation status excludes the event from analysis.',
  'not-yet-effective': 'The recorded effective time is later than that snapshot.',
  'geometry-unavailable':
    'Complete event or zone geometry is unavailable in the snapshot without this match.',
  'source-revision': 'Raw source content changed for the same event ID.',
  'normalized-record-revision':
    'Normalized event facts changed; this alone does not establish a source revision.',
  'zone-geometry-revision': 'Resolved zone geometry changed between snapshots.',
  'inventory-record-missing': 'This exact snapshot-scoped asset ID is absent from one inventory.',
  'inventory-source-revision':
    'The asset source snapshot changed; IDs are not linked across source revisions.',
  'inventory-record-revision': 'Geometry or attributes changed for this exact asset ID.',
  'analysis-parameters-changed': 'Analysis parameters differ between the snapshots.',
  'match-membership-changed':
    'The verified geographic match changed; no more specific recorded factor was identified.',
} as const;
export type Reason = keyof typeof reasonText;
const facts = (event: GeoEvent) => ({
  title: event.title,
  description: event.description,
  geometry: event.geometry,
  sourceFacts: event.sourceFacts,
  expirationTime: event.expirationTime,
  confirmationStatus: event.confirmationStatus,
  observationTime: event.observationTime,
  sourceUpdatedTime: event.sourceUpdatedTime,
  source: event.source,
  locationUncertainty: event.locationUncertainty,
});
function unique<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T>();
  for (const row of rows) {
    const id = key(row);
    if (map.has(id)) throw new Error('Ambiguous duplicate identity: ' + id);
    map.set(id, row);
  }
  return map;
}
function eligibility(event: GeoEvent, at: string) {
  if (event.expirationTime && Date.parse(event.expirationTime) <= Date.parse(at)) return 'expired';
  if (['test', 'cancelled', 'unknown'].includes(event.confirmationStatus)) return 'excluded-status';
  if (event.sourceFacts.effective && Date.parse(event.sourceFacts.effective) > Date.parse(at))
    return 'not-yet-effective';
  return 'eligible-status-and-time';
}
/** Compares recorded evidence, not causal impact. Receives already verified/replayed bundles. */
export async function compareEvidence(left: Bundle, right: Bundle) {
  const eventsA = unique(
    left.snapshots.flatMap((s) => s.events),
    (e) => e.id,
  );
  const eventsB = unique(
    right.snapshots.flatMap((s) => s.events),
    (e) => e.id,
  );
  const assetsA = unique(left.inventory.assets, (a) => a.id);
  const assetsB = unique(right.inventory.assets, (a) => a.id);
  const sourcesA = unique(left.inventory.sources, (s) => s.id);
  const sourcesB = unique(right.inventory.sources, (s) => s.id);
  const eventChanges: { id: string; title: string; change: string; fields: string[] }[] = [];
  for (const id of [...new Set([...eventsA.keys(), ...eventsB.keys()])].sort()) {
    const a = eventsA.get(id),
      b = eventsB.get(id);
    if (!a || !b) {
      eventChanges.push({
        id,
        title: (a ?? b)!.title,
        change: a ? 'absent-in-B' : 'appears-in-B',
        fields: [],
      });
      continue;
    }
    const af = facts(a),
      bf = facts(b);
    const fields: string[] = (Object.keys(af) as (keyof typeof af)[]).filter(
      (field) => canonicalJson(af[field]) !== canonicalJson(bf[field]),
    );
    const lifecycleChanged = eligibility(a, left.asOf) !== eligibility(b, right.asOf);
    if (lifecycleChanged) fields.push('eligibility-at-snapshot-time');
    if (a.contentFingerprint !== b.contentFingerprint || fields.length)
      eventChanges.push({
        id,
        title: b.title,
        change:
          a.contentFingerprint !== b.contentFingerprint
            ? 'source-revision'
            : lifecycleChanged
              ? 'eligibility-changed'
              : 'normalized-record-revision',
        fields,
      });
  }
  const assetChanges: { id: string; name: string; change: string; fields: string[] }[] = [];
  for (const id of [...new Set([...assetsA.keys(), ...assetsB.keys()])].sort()) {
    const a = assetsA.get(id),
      b = assetsB.get(id);
    if (!a || !b || canonicalJson(a) !== canonicalJson(b))
      assetChanges.push({
        id,
        name: (b ?? a)!.properties.name ?? id,
        fields:
          a && b
            ? (['geometry', 'properties'] as const).filter(
                (field) => canonicalJson(a[field]) !== canonicalJson(b[field]),
              )
            : [],
        change: !a ? 'record-added' : !b ? 'record-removed' : 'record-revised',
      });
  }
  const coverage = (bundle: Bundle, source: string) => {
    const snapshot = bundle.snapshots.find((s) => s.source === source);
    return {
      status: snapshot?.status ?? 'missing',
      freshness: feedFreshness(bundle.asOf, snapshot?.dataAsOf ?? null),
    };
  };
  const healthy = (bundle: Bundle, source: string) => {
    const c = coverage(bundle, source);
    return ['ok', 'empty'].includes(c.status) && c.freshness === 'fresh';
  };
  const parametersChanged = left.earthquakeRadiusKm !== right.earthquakeRadiusKm;
  const cache = new Map<string, Reason[]>();
  const eventReasons = (id: string, without: Bundle): Reason[] => {
    const cacheKey = id + '|' + (without === left ? 'A' : 'B');
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const a = eventsA.get(id),
      b = eventsB.get(id),
      event = without === left ? a : b,
      known = (event ?? a ?? b)!;
    const reasons: Reason[] = [];
    if (!healthy(without, known.source.id)) reasons.push('feed-unavailable');
    if (!event) reasons.push('event-not-in-snapshot');
    if (known.expirationTime && Date.parse(known.expirationTime) <= Date.parse(without.asOf))
      reasons.push('expiration-reached');
    if (['test', 'cancelled', 'unknown'].includes(known.confirmationStatus))
      reasons.push('event-ineligible');
    if (
      known.sourceFacts.effective &&
      Date.parse(known.sourceFacts.effective) > Date.parse(without.asOf)
    )
      reasons.push('not-yet-effective');
    if (event && !event.geometry && !zoneGeometry(event, without.zones))
      reasons.push('geometry-unavailable');
    if (a && b) {
      if (a.contentFingerprint !== b.contentFingerprint) reasons.push('source-revision');
      else if (canonicalJson(facts(a)) !== canonicalJson(facts(b)))
        reasons.push('normalized-record-revision');
      if (
        !a.geometry &&
        !b.geometry &&
        canonicalJson(zoneGeometry(a, left.zones)) !== canonicalJson(zoneGeometry(b, right.zones))
      )
        reasons.push('zone-geometry-revision');
    }
    cache.set(cacheKey, reasons);
    return reasons;
  };
  const key = (f: Bundle['result']['findings'][number]) =>
    JSON.stringify([f.eventId, f.assetId, f.kind, f.geometryBasis]);
  const before = unique(left.result.findings, key),
    after = unique(right.result.findings, key);
  const findingChanges: {
    eventId: string;
    eventTitle: string;
    assetId: string;
    assetName: string;
    change: 'added' | 'removed' | 'distance-revised';
    reasons: Reason[];
  }[] = [];
  let added = 0,
    removed = 0,
    unchanged = 0,
    updated = 0;
  for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const a = before.get(id),
      b = after.get(id),
      finding = (a ?? b)!;
    if (a && b) {
      unchanged++;
      if (a.distanceKm === b.distanceKm) continue;
      updated++;
    } else if (b) added++;
    else removed++;
    const without = b ? left : right;
    const reasons = [...eventReasons(finding.eventId, without)];
    const assetA = assetsA.get(finding.assetId),
      assetB = assetsB.get(finding.assetId),
      asset = (assetA ?? assetB)!;
    if (!assetA || !assetB) reasons.push('inventory-record-missing');
    else if (canonicalJson(assetA) !== canonicalJson(assetB))
      reasons.push('inventory-record-revision');
    if (
      sourcesA.get(asset.properties.sourceId)?.sha256 !==
      sourcesB.get(asset.properties.sourceId)?.sha256
    )
      reasons.push('inventory-source-revision');
    if (parametersChanged) reasons.push('analysis-parameters-changed');
    if (!reasons.length) reasons.push('match-membership-changed');
    findingChanges.push({
      eventId: finding.eventId,
      eventTitle: (eventsB.get(finding.eventId) ?? eventsA.get(finding.eventId))!.title,
      assetId: asset.id,
      assetName: asset.properties.name ?? asset.id,
      change: a && b ? 'distance-revised' : b ? 'added' : 'removed',
      reasons,
    });
  }
  return {
    schemaVersion: '1.0.0' as const,
    kind: 'comparison' as const,
    left: left.asOf,
    right: right.asOf,
    inputHashes: { left: left.sha256, right: right.sha256 },
    added,
    removed,
    unchanged,
    updated,
    inventoryChanged: (await sha256(left.inventory)) !== (await sha256(right.inventory)),
    parametersChanged,
    radiusKm: { left: left.earthquakeRadiusKm, right: right.earthquakeRadiusKm },
    reverseChronology: Date.parse(right.asOf) < Date.parse(left.asOf),
    coverage: ['nws', 'usgs'].map((source) => ({
      source,
      left: coverage(left, source),
      right: coverage(right, source),
    })),
    eventChanges,
    assetChanges,
    findingChanges,
    message:
      'Recorded factors can coexist; they do not prove which factor caused a match change. No damage, recovery, closure or operational change is inferred. Asset IDs are not linked across inventory revisions.',
  };
}
