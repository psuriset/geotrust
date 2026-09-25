import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({
  stdin: {
    contents:
      "export { geoEventSchema } from './packages/geoevent/src/schema'; export { normalizeFeed } from './packages/geoevent/src/normalize'; export { z } from 'zod';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  outfile: 'dist/contract.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { geoEventSchema, normalizeFeed, z } = await import('../dist/contract.mjs');
await writeFile(
  'schemas/geoevent-v1.schema.json',
  JSON.stringify(z.toJSONSchema(geoEventSchema), null, 2) + '\n',
);
for (const source of ['nws', 'usgs']) {
  const { default: payload } = await import('../data/fixtures/feeds/' + source + '.json', {
    with: { type: 'json' },
  });
  const normalized = await normalizeFeed(source, payload, '2026-09-25T12:00:00.000Z');
  await writeFile(
    'docs/samples/' + source + '-geoevents.json',
    JSON.stringify(normalized.events, null, 2) + '\n',
  );
}
