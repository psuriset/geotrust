import { instant, feedFreshness } from '../../geoevent/src/schema';
import { normalizeFeed } from '../../geoevent/src/normalize';
import { freshness, type SourceId } from '../../geoevent/src/schema';
import type { EvidenceStore, FeedSnapshot } from '../../storage/src/index';
export type FeedLoader = (source: SourceId) => Promise<{ payload: unknown; retrievedAt: string }>;
export async function loadLocalFeed(
  source: SourceId,
): Promise<{ payload: unknown; retrievedAt: string }> {
  const response = await fetch('/api/feeds/' + source, { signal: AbortSignal.timeout(40_000) });
  if (!response.ok) throw new Error('Gateway HTTP ' + response.status);
  return response.json();
}
/** Serializes callers per source; source failure preserves last-good evidence, never pretends empty. */
export class GeoEventAdapter {
  private pending = new Map<SourceId, Promise<FeedSnapshot>>();
  constructor(
    private store: EvidenceStore,
    private loader: FeedLoader = loadLocalFeed,
    private now = () => new Date().toISOString(),
  ) {}
  refresh(source: SourceId): Promise<FeedSnapshot> {
    const current = this.pending.get(source);
    if (current) return current;
    const work = this.update(source).finally(() => this.pending.delete(source));
    this.pending.set(source, work);
    return work;
  }
  async read(source: SourceId): Promise<FeedSnapshot | undefined> {
    const snapshot = await this.store.get(source);
    return (
      snapshot && {
        ...snapshot,
        freshnessState: feedFreshness(this.now(), snapshot.dataAsOf),
        events: snapshot.events.map((e) => freshness(e, this.now(), snapshot.dataAsOf)),
      }
    );
  }
  private async update(source: SourceId): Promise<FeedSnapshot> {
    const previous = await this.store.get(source);
    const checkedAt = this.now();
    let snapshot: FeedSnapshot;
    try {
      const { payload, retrievedAt } = await this.loader(source);
      instant.parse(retrievedAt);
      if (Date.parse(retrievedAt) > Date.parse(checkedAt) + 60_000)
        throw new Error('Future retrieval time');
      const normalized = await normalizeFeed(source, payload, checkedAt);
      // Reject incomplete snapshots atomically rather than publishing partial safety information.
      if (normalized.issues.length)
        throw new Error('Feed validation failed: ' + normalized.issues.join('; '));
      const previousById = new Map(previous?.events.map((e) => [e.id, e]));
      for (const event of normalized.events) {
        const old = previousById.get(event.id);
        if (old && Date.parse(old.sourceUpdatedTime) > Date.parse(event.sourceUpdatedTime))
          throw new Error('Regressed source revision');
        if (
          old &&
          Date.parse(old.sourceUpdatedTime) === Date.parse(event.sourceUpdatedTime) &&
          old.contentFingerprint !== event.contentFingerprint
        )
          throw new Error('Conflicting source revision');
      }
      snapshot = {
        schemaVersion: 1,
        freshnessState: 'fresh',
        source,
        checkedAt,
        lastSuccess: retrievedAt,
        dataAsOf:
          normalized.sourceGeneratedTime &&
          Date.parse(normalized.sourceGeneratedTime) < Date.parse(retrievedAt)
            ? normalized.sourceGeneratedTime
            : retrievedAt,
        status: normalized.events.length ? 'ok' : 'empty',
        error: null,
        events: normalized.events,
        issues: [],
        duplicates: normalized.duplicates,
        rawPayloads: { [normalized.payloadSha256]: payload },
      };
    } catch (error) {
      snapshot = {
        schemaVersion: 1,
        freshnessState: 'fresh',
        source,
        checkedAt,
        lastSuccess: previous?.lastSuccess ?? null,
        dataAsOf: previous?.dataAsOf ?? null,
        status: previous?.lastSuccess ? 'degraded' : 'failed',
        error: String(error),
        events: previous?.events ?? [],
        issues: previous?.issues ?? [],
        duplicates: 0,
        rawPayloads: previous?.rawPayloads ?? {},
      };
    }
    snapshot.freshnessState = feedFreshness(checkedAt, snapshot.dataAsOf);
    snapshot.events = snapshot.events.map((e) => freshness(e, checkedAt, snapshot.dataAsOf));
    await this.store.put(snapshot); // Quota/corruption failures are errors, not successful persistence.
    return snapshot;
  }
}
