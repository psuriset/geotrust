import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
await build({
  stdin: {
    contents:
      "export {fetchFeed} from './packages/feeds/src/transport'; export {normalizeFeed} from './packages/geoevent/src/normalize'; export {resolveEventZones} from './packages/zones/src/index'; export {createBundle,importBundle} from './packages/bundles/src/index'; export {countAssets} from './packages/exposure/src/index';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  outfile: 'dist/smoke-nc.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const api = await import('../dist/smoke-nc.mjs');
const inventory = JSON.parse(await readFile('public/data/nc-inventory.json', 'utf8'));
const snapshots = [];
const at = new Date().toISOString();
for (const source of ['nws', 'usgs']) {
  const { payload } = await api.fetchFeed(source);
  const n = await api.normalizeFeed(source, payload, at);
  if (n.issues.length) throw new Error(n.issues.join('; '));
  snapshots.push({
    schemaVersion: 1,
    source,
    checkedAt: at,
    lastSuccess: at,
    dataAsOf: n.sourceGeneratedTime ?? at,
    freshnessState: 'fresh',
    status: n.events.length ? 'ok' : 'empty',
    error: null,
    events: n.events,
    issues: [],
    duplicates: n.duplicates,
    rawPayloads: { [n.payloadSha256]: payload },
  });
}
const zones = await api.resolveEventZones(
  snapshots.flatMap((s) => s.events),
  async (url) => {
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'GeoTrust/0.3 (https://github.com/psuriset/geotrust)' },
    });
    if (!response.ok) throw new Error('Zone HTTP ' + response.status);
    return response.json();
  },
  at,
);
const started = performance.now();
const bundle = await api.createBundle(inventory, snapshots, at, 100, zones.records);
const analysisAndHashMs = performance.now() - started;
const encoded = JSON.stringify(bundle);
await api.importBundle(encoded);
await mkdir('dist/evidence', { recursive: true });
await writeFile('dist/evidence/nc-smoke.json', encoded);
const summary = {
  asOf: at,
  assets: inventory.assets.length,
  eventCounts: snapshots.map((s) => ({ source: s.source, count: s.events.length })),
  resolvedZones: zones.records.length,
  unresolvedZones: zones.errors.length,
  findings: bundle.result.findings.length,
  counts: api.countAssets(bundle.result.findings, inventory),
  complete: bundle.result.complete,
  limitations: bundle.result.limitations,
  analysisAndHashMs,
  bundleBytes: Buffer.byteLength(encoded),
  bundleSha256: bundle.sha256,
  replayVerified: true,
};
await writeFile('docs/samples/phase-3-live-run.json', JSON.stringify(summary, null, 2) + '\n');
console.info(JSON.stringify(summary, null, 2));
