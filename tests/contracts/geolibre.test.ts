import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { expect, it } from 'vitest';
import lock from '../../upstream/geolibre.lock.json';
import manifest from '../../packages/plugin/geolibre-plugin/plugin.json';
import { identity } from '../../packages/plugin/src/plugin';
it('uses API names and call signatures present in the exact pinned upstream type snapshot', () => {
  const original = readFileSync('tests/contracts/fixtures/geolibre-types.ts.txt', 'utf8');
  expect(createHash('sha256').update(original).digest('hex')).toBe(lock.contractSha256);
  const source = ts.createSourceFile('upstream.ts', original, ts.ScriptTarget.Latest, true);
  const api = source.statements.find(
    (node): node is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(node) && node.name.text === 'GeoLibreAppAPI',
  )!;
  const expected: Record<string, number> = {
    getMap: 0,
    registerRightPanel: 1,
    openRightPanel: 1,
    closeRightPanel: 1,
    registerExternalNativeLayer: 1,
    unregisterExternalNativeLayer: 1,
    onLayersChanged: 1,
  };
  for (const [name, count] of Object.entries(expected)) {
    const member = api.members.find((item) => item.name?.getText(source) === name);
    expect(member, name).toBeDefined();
    if (
      !member ||
      !ts.isPropertySignature(member) ||
      !member.type ||
      !ts.isFunctionTypeNode(member.type)
    )
      throw new Error('Unexpected upstream signature');
    expect(member.type.parameters.length, name).toBe(count);
  }
  for (const name of ['updateLayer', 'removeLayer', 'getDuckDB', 'runSQL'])
    expect(api.members.some((item) => item.name?.getText(source) === name)).toBe(false);
});
it('matches plugin identity to the required external manifest', () => {
  expect({ id: manifest.id, name: manifest.name, version: manifest.version }).toEqual(identity);
  expect(manifest.entry).toBe('dist/index.js');
  expect(manifest.engines).toEqual(['maplibre']);
});
