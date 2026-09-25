import { expect, it, vi, afterEach } from 'vitest';
import {
  acquireInventory,
  readJson,
  sources,
  type JsonReader,
} from '../packages/assets/src/acquire';
import { inventorySchema } from '../packages/assets/src/schema';
import { at, area, inventory } from './phase3-fixtures';
afterEach(() => vi.unstubAllGlobals());
function mockSource(edit?: (value: Record<string, unknown>, url: URL) => unknown): JsonReader {
  return async (input) => {
    const url = new URL(input);
    const source = sources.find((s) => input.startsWith(s.url))!;
    let value: Record<string, unknown>;
    if (!url.pathname.endsWith('/query')) value = { description: 'January 1, 2026' };
    else if (url.searchParams.has('returnIdsOnly'))
      value = {
        objectIds: Array.from({ length: source.id === 'counties' ? 100 : 2 }, (_, i) => i + 1),
      };
    else
      value = {
        type: 'FeatureCollection',
        features: url.searchParams
          .get('objectIds')!
          .split(',')
          .map((id) => ({
            type: 'Feature',
            geometry:
              source.kind === 'community'
                ? area
                : source.kind === 'road'
                  ? {
                      type: 'LineString',
                      coordinates: [
                        [-79.5, 35.5],
                        [-78.5, 35.5],
                      ],
                    }
                  : { type: 'Point', coordinates: id === '1' ? [-78.5, 35.5] : [-90, 40] },
            properties: {
              [source.key]: Number(id),
              [source.name]: 'Synthetic',
              [source.subtype]: 'test',
            },
          })),
      };
    return edit ? edit(value, url) : value;
  };
}
it('acquires complete NC records, excludes outside points and keeps source metadata/unknown status', async () => {
  const data = await acquireInventory(mockSource(), at);
  expect(data.assets).toHaveLength(106);
  expect(data.sources[1]!.sourceCount).toBe(2);
  expect(data.sources[1]!.includedCount).toBe(1);
  expect(data.sources[1]!.vintage).toBeNull();
  expect(data.assets.every((a) => a.properties.operationalStatus === 'unknown')).toBe(true);
  expect(data.assets[0]!.id).toMatch(/^counties:[a-f0-9]{64}:1$/);
  expect(inventorySchema.safeParse({ ...inventory(), extra: true }).success).toBe(false);
});
it('refuses metadata errors, repeated/unexpected IDs, missing pages, source changes and truncated pages', async () => {
  for (const edit of [
    (v: Record<string, unknown>, u: URL) =>
      !u.pathname.endsWith('/query') ? { error: { code: 500 } } : v,
    (v: Record<string, unknown>) => (v.objectIds ? { objectIds: [1, 1] } : v),
    (v: Record<string, unknown>) => (v.features ? { ...v, exceededTransferLimit: true } : v),
    (v: Record<string, unknown>) => (v.features ? { ...v, features: [] } : v),
    (v: Record<string, unknown>) =>
      v.features
        ? {
            ...v,
            features: [
              {
                type: 'Feature',
                geometry: area,
                properties: { OBJECTID: 999, NAME: 'x', GEOID: '37' },
              },
            ],
          }
        : v,
    (v: Record<string, unknown>) => (v.objectIds ? { objectIds: [1] } : v),
  ])
    await expect(acquireInventory(mockSource(edit), at)).rejects.toThrow();
  let queries = 0;
  await expect(
    acquireInventory(
      mockSource((v) => (v.objectIds && ++queries === 2 ? { objectIds: [1] } : v)),
      at,
    ),
  ).rejects.toThrow('Source changed');
});
it('default reader rejects HTTP/malformed/oversized responses and supports default clock', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(' '.repeat(32_000_001))),
  );
  expect(await readJson('https://example.org')).toEqual({});
  await expect(readJson('https://example.org')).rejects.toThrow('HTTP');
  await expect(readJson('https://example.org')).rejects.toThrow('32 MB');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => new Response(JSON.stringify(await mockSource()(String(url))))),
  );
  expect((await acquireInventory()).assets).toHaveLength(106);
});
