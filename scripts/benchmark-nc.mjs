import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
await build({
  stdin: {
    contents:
      "export {analyzeExposure} from './packages/exposure/src/index'; export {normalizeFeed} from './packages/geoevent/src/normalize';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  outfile: 'dist/benchmark.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { analyzeExposure, normalizeFeed } = await import('../dist/benchmark.mjs');
const inventory = JSON.parse(await readFile('public/data/nc-inventory.json', 'utf8'));
const at = '2026-09-25T12:00:00.000Z';
const snapshots = [];
for (const source of ['nws', 'usgs']) {
  const payload = JSON.parse(await readFile('data/fixtures/feeds/' + source + '.json', 'utf8'));
  const n = await normalizeFeed(source, payload, at);
  snapshots.push({ source, status: 'ok', dataAsOf: at, events: n.events });
}
const start = performance.now();
const result = analyzeExposure(inventory, snapshots, at);
console.log(
  JSON.stringify({
    milliseconds: performance.now() - start,
    findings: result.findings.length,
    assets: inventory.assets.length,
  }),
);
