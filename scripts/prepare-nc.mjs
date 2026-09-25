import { build } from 'esbuild';
import { mkdir, writeFile, rename } from 'node:fs/promises';
await build({
  entryPoints: ['packages/assets/src/acquire.ts'],
  outfile: 'dist/acquire.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { acquireInventory, readJson } = await import('../dist/acquire.mjs');
const inventory = await acquireInventory(async (url) => {
  if (!url.includes('objectIds=')) console.info('Reading ' + new URL(url).pathname);
  return readJson(url);
});
await mkdir('public/data', { recursive: true });
await writeFile('public/data/nc-inventory.json.tmp', JSON.stringify(inventory));
await rename('public/data/nc-inventory.json.tmp', 'public/data/nc-inventory.json');
console.info(
  JSON.stringify(
    inventory.sources.map(({ id, sourceCount, includedCount, sha256 }) => ({
      id,
      sourceCount,
      includedCount,
      sha256,
    })),
    null,
    2,
  ),
);
