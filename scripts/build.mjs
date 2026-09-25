import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
const profile = process.env.GEOTRUST_PROFILE ?? 'production';
if (!['development', 'test', 'production'].includes(profile))
  throw new Error('Invalid build profile');
const output = 'dist/geolibre-plugin';
await mkdir(output + '/dist', { recursive: true });
const result = await build({
  entryPoints: ['packages/plugin/src/index.ts'],
  outfile: output + '/dist/index.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  define: { __GEOTRUST_PROFILE__: JSON.stringify(profile) },
  minify: true,
  metafile: true,
  legalComments: 'inline',
});
if (Object.values(result.metafile.outputs).some((file) => file.imports.length)) {
  throw new Error('Plugin bundle must have no external imports');
}
const manifest = await readFile('packages/plugin/geolibre-plugin/plugin.json', 'utf8');
await writeFile(output + '/plugin.json', manifest);
await copyFile('packages/plugin/style.css', output + '/dist/style.css');
await copyFile('LICENSE', output + '/LICENSE');
await copyFile('THIRD_PARTY_NOTICES.md', output + '/THIRD_PARTY_NOTICES.md');
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const notices = [];
for (const [location, metadata] of Object.entries(lock.packages)) {
  if (!location || metadata.dev) continue;
  const names = (await readdir(location)).filter((name) =>
    /^(licen[sc]e|copying)(\.|$)/i.test(name),
  );
  if (names.length === 0) {
    const readme = await readFile(location + '/README.md', 'utf8');
    const licenseSection = readme.match(/## License[\s\S]*/i)?.[0];
    if (!licenseSection) throw new Error('Missing license text: ' + location);
    notices.push('Package: ' + location + ' @ ' + metadata.version + '\n' + licenseSection);
    continue;
  }
  notices.push(
    'Package: ' + location + ' @ ' + metadata.version + '\nLicense: ' + metadata.license,
  );
  for (const name of names) notices.push(await readFile(location + '/' + name, 'utf8'));
}
await writeFile(
  output + '/THIRD_PARTY_LICENSES.txt',
  notices.join('\n\n----------------------------------------\n\n'),
);
const archive = {};
for (const name of [
  'plugin.json',
  'dist/index.js',
  'dist/style.css',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'THIRD_PARTY_LICENSES.txt',
]) {
  archive[name] = strToU8(await readFile(output + '/' + name, 'utf8'));
}
await writeFile('dist/geotrust-plugin.zip', zipSync(archive));
await writeFile('dist/plugin-metafile.json', JSON.stringify(result.metafile, null, 2));
console.info('Built self-contained GeoLibre plugin (' + profile + ') and installation ZIP.');
