import { readFile, cp, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const target = process.argv[2];
if (!target)
  throw new Error('Usage: node scripts/stage-geolibre.mjs /path/to/isolated/pinned/geolibre');
const lock = JSON.parse(await readFile('upstream/geolibre.lock.json', 'utf8'));
const head = execFileSync('git', ['-C', target, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== lock.commit) throw new Error('GeoLibre checkout does not match pinned revision');
const root = resolve(target, 'apps/geolibre-desktop/public');
await mkdir(root + '/plugins/geotrust', { recursive: true });
await cp('dist/geolibre-plugin', root + '/plugins/geotrust', { recursive: true });
const manifest = JSON.parse(await readFile(root + '/plugins/geotrust/plugin.json', 'utf8'));
manifest.activeByDefault = true;
await writeFile(root + '/plugins/geotrust/plugin.json', JSON.stringify(manifest, null, 2) + '\n');
await cp('public/data', root + '/data', { recursive: true });
await writeFile(
  root + '/geotrust.geolibre.json',
  JSON.stringify(
    {
      version: '0.2.0',
      name: 'GeoTrust North Carolina',
      mapView: { center: [-79.5, 35.5], zoom: 6, bearing: 0, pitch: 0 },
      basemapStyleUrl: '',
      layers: [],
      styles: {},
      plugins: {
        manifestUrls: [],
        activePluginIds: ['geotrust'],
        mapControlPositions: {},
        settings: {},
      },
    },
    null,
    2,
  ) + '\n',
);
console.info(
  'Staged GeoTrust, NC data and a blank-map NC starter project. Rebuild the host; no tracked upstream source was edited.',
);
