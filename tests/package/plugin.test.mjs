import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
test('release ZIP has matching manifest, notices and self-contained ESM', async () => {
  const archive = unzipSync(await readFile('dist/geotrust-plugin.zip'));
  const manifest = JSON.parse(strFromU8(archive['plugin.json']));
  const plugin = (await import('../../dist/geolibre-plugin/dist/index.js')).default;
  assert.equal(plugin.id, manifest.id);
  assert.equal(plugin.name, manifest.name);
  assert.equal(plugin.version, manifest.version);
  assert.ok(archive[manifest.entry]);
  assert.ok(archive[manifest.style]);
  assert.ok(archive.LICENSE);
  const meta = JSON.parse(await readFile('dist/plugin-metafile.json', 'utf8'));
  assert.ok(Object.values(meta.outputs).every((file) => file.imports.length === 0));
  assert.ok(Object.keys(archive).every((name) => !name.includes('..') && !name.startsWith('/')));
  assert.equal(typeof plugin.activate, 'function');
  if (plugin.applyProjectState)
    assert.equal(plugin.applyProjectState({}, { schemaVersion: 1, mode: 'fixture' }), true);
  else assert.match(manifest.description, /local gateway/);
});
