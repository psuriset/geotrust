import { zoneUrl } from '../../zones/src/index';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fetchFeed, FeedHttpError } from '../../feeds/src/transport';
import type { SourceId } from '../../geoevent/src/schema';
export function createGateway(
  root: string,
  upstream = fetchFeed,
  now = Date.now,
  port = 4174,
  geolibreHost = false,
) {
  const cache = new Map<SourceId, { value?: unknown; until: number; error?: string }>();
  const zones = new Map<string, { value: unknown; until: number }>();
  const pending = new Map<SourceId, Promise<unknown>>();
  async function acquire(source: SourceId): Promise<unknown> {
    const cached = cache.get(source);
    if (cached && now() < cached.until) {
      if (cached.error) throw new Error(cached.error);
      return cached.value;
    }
    const active = pending.get(source);
    if (active) return active;
    const work = upstream(source)
      .then((result) => {
        cache.set(source, {
          value: { payload: result.payload, retrievedAt: new Date(now()).toISOString() },
          until: now() + result.cacheMs,
        });
        return cache.get(source)!.value;
      })
      .catch((error) => {
        cache.set(source, {
          error: String(error),
          until: Math.max(now() + 60_000, error instanceof FeedHttpError ? error.retryAt : 0),
        });
        throw error;
      })
      .finally(() => pending.delete(source));
    pending.set(source, work);
    return work;
  }
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const origin = 'http://127.0.0.1:' + port;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'" +
        (geolibreHost ? " blob: 'unsafe-eval'" : '') +
        "; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    if (
      req.headers.host !== '127.0.0.1:' + port ||
      (req.headers.origin && req.headers.origin !== origin) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    ) {
      res.writeHead(403).end('Forbidden origin');
      return;
    }
    if (req.method !== 'GET') {
      res.writeHead(405).end('GET only');
      return;
    }
    const url = new URL(req.url!, origin);
    const match = /^\/api\/feeds\/(nws|usgs)$/.exec(url.pathname);
    if (match && !url.search) {
      try {
        const payload = await acquire(match[1] as SourceId);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(payload));
      } catch {
        res.setHeader('Retry-After', '60');
        res.writeHead(503).end('Feed unavailable');
      }
      return;
    }
    const zone = /^\/api\/zones\/(forecast|county|fire)\/([A-Z]{2}[CZ][0-9]{3})$/.exec(
      url.pathname,
    );
    if (zone && !url.search) {
      const upstreamUrl = zoneUrl.parse('https://api.weather.gov/zones/' + zone[1] + '/' + zone[2]);
      try {
        const cached = zones.get(upstreamUrl);
        let payload: unknown;
        if (cached && cached.until > now()) payload = cached.value;
        else {
          const response = await fetch(upstreamUrl, {
            redirect: 'error',
            signal: AbortSignal.timeout(10000),
            headers: {
              'User-Agent': 'GeoTrust/0.3 (https://github.com/psuriset/geotrust)',
              Accept: 'application/geo+json',
            },
          });
          if (!response.ok) throw new Error('Zone HTTP error');
          const body = await response.text();
          if (new TextEncoder().encode(body).length > 8_000_000) throw new Error('Zone too large');
          payload = JSON.parse(body);
          if (zones.size >= 200) zones.clear();
          zones.set(upstreamUrl, { value: payload, until: now() + 86_400_000 });
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(payload));
      } catch {
        res.writeHead(503).end('Zone unavailable');
      }
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404).end('Unknown route');
      return;
    }
    const path = resolve(
      root,
      '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
    );
    if (!path.startsWith(resolve(root) + '/')) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(path);
      const mime: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.txt': 'text/plain',
        '.wasm': 'application/wasm',
        '.mjs': 'text/javascript',
        '.woff2': 'font/woff2',
      };
      res.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream');
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  }
  return createServer((req, res) => {
    void handle(req, res).catch(() => {
      res.writeHead(400).end('Bad request');
    });
  });
}
