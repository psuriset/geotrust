import { build } from 'esbuild';
await build({
  stdin: {
    contents:
      "export { fetchFeed } from './packages/feeds/src/transport'; export { normalizeFeed } from './packages/geoevent/src/normalize';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  outfile: 'dist/smoke.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { fetchFeed, normalizeFeed } = await import('../dist/smoke.mjs');
for (const source of ['nws', 'usgs']) {
  try {
    const { payload } = await fetchFeed(source);
    const result = await normalizeFeed(source, payload, new Date().toISOString());
    console.info(
      JSON.stringify({
        source,
        received: true,
        events: result.events.length,
        issues: result.issues,
        duplicates: result.duplicates,
        sourceGeneratedTime: result.sourceGeneratedTime,
      }),
    );
    if (result.issues.length) process.exitCode = 1;
  } catch (error) {
    console.error(source + ': ' + String(error));
    process.exitCode = 1;
  }
}
