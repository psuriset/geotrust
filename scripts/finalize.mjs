import { copyFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.txt']) {
  await copyFile('dist/geolibre-plugin/' + name, 'dist/demo/' + name);
}
const result = spawnSync('npm', ['sbom', '--omit=dev', '--sbom-format', 'cyclonedx'], {
  encoding: 'utf8',
});
if (result.status !== 0) throw new Error('SBOM generation failed: ' + result.stderr);
await writeFile('dist/sbom.cdx.json', result.stdout);
