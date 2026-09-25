import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import nws from '../data/fixtures/feeds/nws.json';
import usgs from '../data/fixtures/feeds/usgs.json';
import { normalizeFeed } from '../packages/geoevent/src/normalize';
import { freshness, geoEventSchema } from '../packages/geoevent/src/schema';
import { GeoEventAdapter, loadLocalFeed } from '../packages/feeds/src/adapter';
import { fetchFeed, retryDelay, FeedHttpError } from '../packages/feeds/src/transport';
import { IndexedEvidenceStore } from '../packages/storage/src/index';
const now = '2026-09-25T12:00:00.000Z';
const empty = { type: 'FeatureCollection', features: [] };
const store = () => new IndexedEvidenceStore(new IDBFactory());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('normalizes source facts without inventing confidence, geometry, depth units or expiration', async () => {
  const weather = await normalizeFeed('nws', nws, now);
  expect(weather.issues).toEqual([]);
  expect(weather.events).toHaveLength(2);
  expect(weather.events.some((e) => e.geometry === null)).toBe(true);
  const quake = (await normalizeFeed('usgs', usgs, now)).events[0]!;
  expect(quake.geometry).toEqual({ type: 'Point', coordinates: [-78.5, 35.7] });
  expect(quake.sourceFacts.depthKm).toBe(5);
  expect(quake.expirationTime).toBeNull();
  expect(quake.confidenceBand).toBe('unknown');
  expect(quake.confirmationStatus).toBe('reviewed');
  expect(geoEventSchema.safeParse({ ...quake, unknown: true }).success).toBe(false);
  expect(geoEventSchema.safeParse({ ...quake, schemaVersion: '2' }).success).toBe(false);
  for (const [minutes, result] of [
    [0, 'fresh'],
    [5, 'stale'],
    [30, 'unavailable'],
  ] as const) {
    expect(
      freshness(quake, new Date(Date.parse(now) + minutes * 60_000).toISOString(), now)
        .freshnessState,
    ).toBe(result);
  }
  expect(freshness(quake, now, null).freshnessState).toBe('unavailable');
  expect(freshness(weather.events[0]!, '2026-09-25T16:00:00Z', now).freshnessState).toBe('expired');
});
it('deduplicates canonical payload fingerprints and quarantines malformed or conflicting revisions', async () => {
  const one = structuredClone(nws.features[0]!);
  expect((await normalizeFeed('nws', { ...empty, features: [one, one] }, now)).duplicates).toBe(1);
  const changed = structuredClone(one);
  changed.properties.description = 'Changed';
  const conflict = await normalizeFeed('nws', { ...empty, features: [one, changed, one] }, now);
  expect(conflict.events).toHaveLength(0);
  expect(conflict.issues).toHaveLength(1);
  changed.properties.sent = '2026-09-25T11:30:00Z';
  expect(
    (await normalizeFeed('nws', { ...empty, features: [changed, one] }, now)).events[0]!
      .description,
  ).toBe('Changed');
  expect(
    (await normalizeFeed('nws', { ...empty, features: [one, changed] }, now)).events[0]!
      .description,
  ).toBe('Changed');
  expect(
    (
      await normalizeFeed(
        'nws',
        {
          ...empty,
          features: [{}, { ...one, geometry: { type: 'Point', coordinates: [999, 0] } }],
        },
        now,
      )
    ).issues,
  ).toHaveLength(2);
  await expect(normalizeFeed('nws', {}, now)).rejects.toThrow();
  await expect(
    normalizeFeed('nws', { ...empty, pagination: { next: 'more' } }, now),
  ).rejects.toThrow('Incomplete');
  one.properties.sent = '2027-01-01T00:00:00Z';
  expect((await normalizeFeed('nws', { ...empty, features: [one] }, now)).issues).toHaveLength(1);
});
it('preserves tests/cancellations/unknown review status and nullable magnitude', async () => {
  for (const [status, messageType, expected] of [
    ['Test', 'Alert', 'test'],
    ['Actual', 'Cancel', 'cancelled'],
  ]) {
    const value = structuredClone(nws);
    Object.assign(value.features[0]!.properties, { status, messageType });
    expect(
      (await normalizeFeed('nws', value, now)).events.find(
        (e) => e.sourceEventId === 'synthetic-warning-1',
      )!.confirmationStatus,
    ).toBe(expected);
  }
  for (const status of ['automatic', 'other']) {
    const value = structuredClone(usgs);
    Object.assign(value.features[0]!.properties, { status, mag: null });
    expect((await normalizeFeed('usgs', value, now)).events[0]!.confirmationStatus).toBe(
      status === 'other' ? 'unknown' : status,
    );
  }
});
it('distinguishes empty, failed and degraded feeds, persists raw evidence, recalculates freshness', async () => {
  const db = store();
  let payload: unknown = nws;
  let fail = false;
  let time = now;
  const loader = vi.fn(async () => {
    if (fail) throw new Error('offline');
    return { payload, retrievedAt: now };
  });
  const adapter = new GeoEventAdapter(db, loader, () => time);
  expect(await adapter.read('nws')).toBeUndefined();
  const [a, b] = await Promise.all([adapter.refresh('nws'), adapter.refresh('nws')]);
  expect(a).toEqual(b);
  expect(loader).toHaveBeenCalledTimes(1);
  expect(Object.keys(a.rawPayloads)).toContain(a.events[0]!.rawPayloadReference.sha256);
  fail = true;
  time = '2026-09-25T12:06:00Z';
  expect((await adapter.refresh('nws')).status).toBe('degraded');
  expect((await adapter.read('nws'))!.events[0]!.freshnessState).toBe('stale');
  expect((await adapter.refresh('usgs')).status).toBe('failed');
  fail = false;
  payload = empty;
  expect((await adapter.refresh('nws')).status).toBe('empty');
  payload = { ...empty, features: [{}] };
  expect((await adapter.refresh('nws')).status).toBe('degraded');
  await db.clear();
  expect(await db.get('nws')).toBeUndefined();
  await db.close();
});
it('rejects conflicting/regressed revisions across refresh and storage errors', async () => {
  const db = store();
  let payload = structuredClone(nws);
  const adapter = new GeoEventAdapter(
    db,
    async () => ({ payload, retrievedAt: now }),
    () => now,
  );
  await adapter.refresh('nws');
  payload.features[0]!.properties.description = 'changed';
  expect((await adapter.refresh('nws')).error).toContain('Conflicting');
  payload = structuredClone(nws);
  payload.features[0]!.properties.sent = '2026-09-25T10:00:00Z';
  expect((await adapter.refresh('nws')).error).toContain('Regressed');
  const future = new GeoEventAdapter(
    db,
    async () => ({ payload: nws, retrievedAt: '2027-01-01T00:00:00Z' }),
    () => now,
  );
  expect((await future.refresh('nws')).error).toContain('Future');
  vi.spyOn(db, 'put').mockRejectedValue(new Error('QuotaExceededError'));
  await expect(adapter.refresh('nws')).rejects.toThrow('Quota');
  await db.close();
});
it('local loader rejects failed HTTP instead of returning an empty collection', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ payload: empty, retrievedAt: now })))
      .mockResolvedValueOnce(new Response('', { status: 503 })),
  );
  expect(await loadLocalFeed('nws')).toEqual({ payload: empty, retrievedAt: now });
  await expect(loadLocalFeed('usgs')).rejects.toThrow('503');
});
it('transport retries transient errors, honors Retry-After/cache and rejects unsafe responses', async () => {
  const sleep = vi.fn(async () => {});
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '2' } }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify(empty), { headers: { 'Cache-Control': 'max-age=120' } }),
    );
  expect((await fetchFeed('nws', fetcher, () => 0, sleep)).cacheMs).toBe(120000);
  expect(sleep).toHaveBeenCalledWith(2000);
  expect(fetcher.mock.calls[0]![1].redirect).toBe('error');
  const unavailable = vi.fn().mockRejectedValue(new Error('offline'));
  await expect(fetchFeed('usgs', unavailable, () => 0, sleep)).rejects.toThrow('offline');
  expect(unavailable).toHaveBeenCalledTimes(3);
  for (const status of [400, 429, 503]) {
    const fn = vi.fn(async () => new Response('', { status, headers: { 'Retry-After': '120' } }));
    await expect(fetchFeed('nws', fn, () => 0, sleep)).rejects.toBeInstanceOf(FeedHttpError);
    expect(fn).toHaveBeenCalledTimes(1);
  }
  expect(retryDelay('Thu, 01 Jan 1970 00:01:00 GMT', 0)).toBe(60000);
  expect(retryDelay('bad', 0)).toBe(0);
  expect(retryDelay(null, 0)).toBe(0);
  expect(
    (
      await fetchFeed(
        'nws',
        async () => new Response('{}'),
        () => 0,
        sleep,
      )
    ).cacheMs,
  ).toBe(60000);
  await expect(
    fetchFeed(
      'nws',
      async () => new Response(null),
      () => 0,
      sleep,
    ),
  ).rejects.toThrow('Missing');
  await expect(
    fetchFeed(
      'nws',
      async () => new Response('bad'),
      () => 0,
      sleep,
    ),
  ).rejects.toThrow();
  await expect(
    fetchFeed(
      'nws',
      async () => new Response(new Uint8Array(16_000_001)),
      () => 0,
      sleep,
    ),
  ).rejects.toThrow('16 MB');
  const hangs: typeof fetch = (_url, options) =>
    new Promise((_resolve, reject) =>
      options!.signal!.addEventListener('abort', () => reject(new Error('timeout'))),
    );
  await expect(fetchFeed('nws', hangs, () => 0, sleep, 5)).rejects.toThrow('timeout');
});
it('keeps CAP references and flags an old USGS-generated snapshot even after successful retrieval', async () => {
  const value = structuredClone(nws) as unknown as {
    type: string;
    features: Array<{ properties: Record<string, unknown> }>;
  };
  value.features[0]!.properties.references = [{ identifier: 'prior-message' }];
  expect(
    (await normalizeFeed('nws', value, now)).events.find(
      (e) => e.sourceEventId === 'synthetic-warning-1',
    )!.sourceFacts.references,
  ).toEqual(['prior-message']);
  const payload = structuredClone(usgs);
  payload.metadata.generated -= 600_000;
  const db = store();
  const adapter = new GeoEventAdapter(
    db,
    async () => ({ payload, retrievedAt: now }),
    () => now,
  );
  expect((await adapter.refresh('usgs')).events[0]!.freshnessState).toBe('stale');
  payload.metadata.generated = Date.parse(now) + 600_000;
  await expect(normalizeFeed('usgs', payload, now)).rejects.toThrow('Future feed');
  await db.close();
});
it('default transport timeout/retry scheduling works without injected dependencies', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue(new Response('{}')),
  );
  const pending = fetchFeed('nws');
  await vi.runAllTimersAsync();
  expect((await pending).payload).toEqual({});
  vi.useRealTimers();
});
it('surfaces database open, blocked, abort and corruption errors', async () => {
  for (const kind of ['onerror', 'onblocked']) {
    const request: Record<string, unknown> = { error: new Error('database failed') };
    const factory = {
      open: () => {
        queueMicrotask(() => (request[kind] as () => void)());
        return request;
      },
    } as unknown as IDBFactory;
    await expect(new IndexedEvidenceStore(factory).get('nws')).rejects.toThrow();
  }
  for (const error of [new Error('quota'), null]) {
    const tx: Record<string, unknown> = {
      error,
      objectStore: () => ({
        get: () => {
          queueMicrotask(() => (tx.onabort as () => void)());
          return {};
        },
      }),
    };
    const request: Record<string, unknown> = { result: { transaction: () => tx } };
    const factory = {
      open: () => {
        queueMicrotask(() => (request.onsuccess as () => void)());
        return request;
      },
    } as unknown as IDBFactory;
    await expect(new IndexedEvidenceStore(factory).get('nws')).rejects.toThrow();
  }
  const tx: Record<string, unknown> = {
    error: new Error('transaction error'),
    objectStore: () => ({
      get: () => {
        queueMicrotask(() => (tx.onerror as () => void)());
        return {};
      },
    }),
  };
  const request: Record<string, unknown> = { result: { transaction: () => tx } };
  await expect(
    new IndexedEvidenceStore({
      open: () => {
        queueMicrotask(() => (request.onsuccess as () => void)());
        return request;
      },
    } as unknown as IDBFactory).get('nws'),
  ).rejects.toThrow('transaction');
  const factory = new IDBFactory();
  const db = new IndexedEvidenceStore(factory, 'corrupt');
  await db.get('nws');
  await new Promise<void>((resolve) => {
    const open = factory.open('corrupt');
    open.onsuccess = () => {
      const transaction = open.result.transaction('feeds', 'readwrite');
      transaction.objectStore('feeds').put({ source: 'nws', schemaVersion: 999 });
      transaction.oncomplete = () => {
        open.result.close();
        resolve();
      };
    };
  });
  await expect(db.get('nws')).rejects.toThrow();
  await db.close();
});
it('JSON Schema export and checked-in examples match the runtime contract', async () => {
  const { readFileSync } = await import('node:fs');
  const { z } = await import('zod');
  expect(JSON.parse(readFileSync('schemas/geoevent-v1.schema.json', 'utf8'))).toEqual(
    z.toJSONSchema(geoEventSchema),
  );
  for (const source of ['nws', 'usgs'] as const) {
    const sample = JSON.parse(readFileSync(`docs/samples/${source}-geoevents.json`, 'utf8'));
    expect(sample).toEqual(
      (await normalizeFeed(source, source === 'nws' ? nws : usgs, now)).events,
    );
  }
});
