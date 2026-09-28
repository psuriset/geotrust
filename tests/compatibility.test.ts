import { expect, it } from 'vitest';
import legacy from '../data/fixtures/bundles/v1-phase4.json';
import { importBundle, createBundle } from '../packages/bundles/src/index';
import { compatibility } from '../packages/bundles/src/compatibility';
import { inventory, feeds, at } from './phase3-fixtures';
it('reads the committed Phase 4 v1 golden bundle without migration or checksum changes', async () => {
  expect(compatibility).toEqual({ bundle: '1.0.0', result: '1.0.0', method: 'turf-screening-v1' });
  expect(await importBundle(JSON.stringify(legacy))).toEqual(legacy);
  expect(await createBundle(inventory(), await feeds(), at)).toEqual(legacy);
});
it('rejects future/obsolete bundle and method versions without relabelling or rewriting files', async () => {
  for (const version of ['0.9.0', '1.1.0', '2.0.0', null]) {
    const changed = { ...legacy, schemaVersion: version };
    const text = JSON.stringify(changed);
    await expect(importBundle(text)).rejects.toThrow('Unsupported evidence bundle version');
    expect(JSON.stringify(changed)).toBe(text);
  }
  for (const result of [
    { ...legacy.result, method: 'unknown' },
    { ...legacy.result, schemaVersion: '2.0.0' },
  ])
    await expect(importBundle(JSON.stringify({ ...legacy, result }))).rejects.toThrow(
      'Unsupported analysis',
    );
  await expect(importBundle('{}')).rejects.toThrow();
  await expect(importBundle(JSON.stringify({ ...legacy, sha256: '0'.repeat(64) }))).rejects.toThrow(
    'checksum',
  );
});
