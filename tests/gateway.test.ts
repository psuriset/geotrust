// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createGateway } from '../packages/gateway/src/server';
import { FeedHttpError } from '../packages/feeds/src/transport';
function request(
  server: Server,
  url: string,
  headers: Record<string, string> = {},
  method = 'GET',
) {
  return new Promise<{ status: number; body: string; headers: Record<string, string> }>(
    (resolve) => {
      const state = { status: 200, body: '', headers: {} as Record<string, string> };
      const response = {
        setHeader(k: string, v: string) {
          state.headers[k] = v;
        },
        writeHead(status: number) {
          state.status = status;
          return response;
        },
        end(body?: string | Buffer) {
          state.body = body?.toString() ?? '';
          resolve(state);
          return response;
        },
      };
      server.emit(
        'request',
        { url, method, headers: { host: '127.0.0.1:4174', ...headers } },
        response,
      );
    },
  );
}
it('serves same-origin static files and fixed feed routes with shared cache', async () => {
  const root = await mkdtemp(join(tmpdir(), 'geotrust-gateway-'));
  await writeFile(join(root, 'index.html'), 'local');
  await writeFile(join(root, 'asset.bin'), 'bytes');
  let time = Date.parse('2026-09-25T12:00:00Z');
  const upstream = vi.fn(async () => ({
    payload: { type: 'FeatureCollection', features: [] },
    cacheMs: 60000,
  }));
  const server = createGateway(root, upstream, () => time);
  const [a, b] = await Promise.all([
    request(server, '/api/feeds/nws'),
    request(server, '/api/feeds/nws'),
  ]);
  expect(a).toEqual(b);
  expect(upstream).toHaveBeenCalledTimes(1);
  expect(JSON.parse(a.body).retrievedAt).toBe(new Date(time).toISOString());
  await request(server, '/api/feeds/nws');
  expect(upstream).toHaveBeenCalledTimes(1);
  time += 60001;
  await request(server, '/api/feeds/nws');
  expect(upstream).toHaveBeenCalledTimes(2);
  expect((await request(server, '/')).body).toBe('local');
  expect((await request(server, '/asset.bin')).headers['Content-Type']).toBe(
    'application/octet-stream',
  );
  for (const path of ['/api/proxy?url=http://evil', '/api/feeds/nws?url=evil', '/missing'])
    expect((await request(server, path)).status).toBe(404);
  expect((await request(server, '/%2e%2e%2fsecret')).status).toBe(403);
  expect((await request(server, '/%ZZ')).status).toBe(400);
  expect((await request(server, '/', { host: 'evil' })).status).toBe(403);
  expect((await request(server, '/', { origin: 'http://evil' })).status).toBe(403);
  expect((await request(server, '/', { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
  expect((await request(server, '/', { origin: 'http://127.0.0.1:4174' })).status).toBe(200);
  expect((await request(server, '/', {}, 'POST')).status).toBe(405);
  await rm(root, { recursive: true });
});
it('rate limits failures without presenting an empty successful feed', async () => {
  let time = 0;
  const upstream = vi
    .fn()
    .mockRejectedValueOnce(new FeedHttpError(429, 120000))
    .mockRejectedValue(new Error('offline'));
  const server = createGateway('/none', upstream, () => time);
  expect((await request(server, '/api/feeds/usgs')).status).toBe(503);
  time = 61000;
  expect((await request(server, '/api/feeds/usgs')).status).toBe(503);
  expect(upstream).toHaveBeenCalledTimes(1);
  time = 120001;
  expect((await request(server, '/api/feeds/usgs')).status).toBe(503);
  expect(upstream).toHaveBeenCalledTimes(2);
  const defaults = createGateway('/none', upstream);
  expect((await request(defaults, '/missing')).status).toBe(404);
});
it('enables only explicit host CSP and serves bounded cached official zone routes', async () => {
  const payload = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-79, 35],
          [-78, 35],
          [-78, 36],
          [-79, 35],
        ],
      ],
    },
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(payload)))
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(new Response(' '.repeat(8_000_001)));
  vi.stubGlobal('fetch', fetcher);
  let time = 0;
  const host = createGateway('/none', undefined, () => time, 4174, true);
  expect((await request(host, '/missing')).headers['Content-Security-Policy']).toContain(
    "blob: 'unsafe-eval'",
  );
  const demo = createGateway('/none');
  expect((await request(demo, '/missing')).headers['Content-Security-Policy']).not.toContain(
    'unsafe-eval',
  );
  expect((await request(host, '/api/zones/forecast/NCZ071')).status).toBe(200);
  expect((await request(host, '/api/zones/forecast/NCZ071')).status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(1);
  time = 86_400_001;
  expect((await request(host, '/api/zones/forecast/NCZ071')).status).toBe(503);
  expect((await request(host, '/api/zones/county/NCC183')).status).toBe(503);
  expect((await request(host, '/api/zones/forecast/NCZ071?url=http://evil')).status).toBe(404);
  vi.unstubAllGlobals();
});
