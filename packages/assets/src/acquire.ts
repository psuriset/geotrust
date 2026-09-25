import { bbox } from '@turf/bbox';
import { booleanIntersects } from '@turf/boolean-intersects';
import { z } from 'zod';
import { sha256 } from '../../provenance/src/index';
import { assetGeometry, inventorySchema, type Asset, type Inventory } from './schema';
export const sources = [
  {
    id: 'counties',
    url: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1',
    where: "STATE='37'",
    fields: 'OBJECTID,GEOID,NAME',
    key: 'OBJECTID',
    name: 'NAME',
    subtype: 'GEOID',
    kind: 'community',
  },
  {
    id: 'hospitals',
    url: 'https://services.nconemap.gov/secure/rest/services/NC1Map_Health/FeatureServer/0',
    where: '1=1',
    fields: 'objectid,facility,hltype,stype',
    key: 'objectid',
    name: 'facility',
    subtype: 'hltype',
    kind: 'hospital',
  },
  {
    id: 'shelters',
    url: 'https://services.nconemap.gov/secure/rest/services/NC1Map_Emergency_Law_Enforcement/FeatureServer/2',
    where: '1=1',
    fields: 'objectid,bldg_name,bldg_type',
    key: 'objectid',
    name: 'bldg_name',
    subtype: 'bldg_type',
    kind: 'potential-shelter',
  },
  {
    id: 'primary-roads',
    url: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer/2',
    where: '1=1',
    fields: 'OBJECTID,OID,NAME,MTFCC',
    key: 'OBJECTID',
    name: 'NAME',
    subtype: 'MTFCC',
    kind: 'road',
  },
  {
    id: 'secondary-roads',
    url: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer/6',
    where: '1=1',
    fields: 'OBJECTID,OID,NAME,MTFCC',
    key: 'OBJECTID',
    name: 'NAME',
    subtype: 'MTFCC',
    kind: 'road',
  },
] as const;
export type JsonReader = (url: string) => Promise<unknown>;
export async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Asset HTTP ' + response.status);
  const text = await response.text();
  if (new TextEncoder().encode(text).length > 32_000_000)
    throw new Error('Asset response exceeds 32 MB');
  return JSON.parse(text);
}
/** ID-based pages and post-acquisition ID check refuse truncation/concurrent additions. */
export async function acquireInventory(
  read: JsonReader = readJson,
  at = new Date().toISOString(),
): Promise<Inventory> {
  const assets: Asset[] = [];
  const manifests: Inventory['sources'] = [];
  let counties: Asset[] = [];
  for (const source of sources) {
    const metadata = z.record(z.string(), z.unknown()).parse(await read(source.url + '?f=json'));
    if (metadata.error) throw new Error('Asset metadata error: ' + source.id);
    const spatial: Record<string, string> =
      source.kind === 'road'
        ? {
            geometry: '-84.4,33.8,-75.4,36.7',
            geometryType: 'esriGeometryEnvelope',
            inSR: '4326',
            spatialRel: 'esriSpatialRelIntersects',
          }
        : {};
    const idUrl =
      source.url +
      '/query?' +
      new URLSearchParams({ f: 'json', where: source.where, returnIdsOnly: 'true', ...spatial });
    const ids = z
      .object({ objectIds: z.array(z.number().int()).max(200_000) })
      .parse(await read(idUrl))
      .objectIds.sort((a, b) => a - b);
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate source IDs');
    const rows: Asset[] = [];
    const seen = new Set<number>();
    const payloads: unknown[] = [];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const page = await read(
        source.url +
          '/query?' +
          new URLSearchParams({
            f: 'geojson',
            objectIds: ids.slice(offset, offset + 100).join(','),
            outFields: source.fields,
            outSR: '4326',
            returnGeometry: 'true',
          }),
      );
      const parsed = z
        .object({
          type: z.literal('FeatureCollection'),
          features: z.array(
            z.object({
              type: z.literal('Feature'),
              geometry: assetGeometry,
              properties: z.record(z.string(), z.unknown()),
            }),
          ),
          exceededTransferLimit: z.boolean().optional(),
        })
        .parse(page);
      if (parsed.exceededTransferLimit) throw new Error('Truncated asset page');
      payloads.push(page);
      for (const feature of parsed.features) {
        const id = z.number().int().parse(feature.properties[source.key]);
        if (seen.has(id) || !ids.includes(id)) throw new Error('Unexpected asset ID');
        seen.add(id);
        rows.push({
          type: 'Feature',
          id: source.id + ':' + id,
          geometry: feature.geometry,
          properties: {
            kind: source.kind,
            sourceId: source.id,
            sourceObjectId: String(id),
            name: z
              .string()
              .nullable()
              .parse(feature.properties[source.name] ?? null),
            subtype: z
              .string()
              .nullable()
              .parse(feature.properties[source.subtype] ?? null),
            operationalStatus: 'unknown',
          },
        });
      }
    }
    if (seen.size !== ids.length) throw new Error('Incomplete asset acquisition');
    const finalIds = z
      .object({ objectIds: z.array(z.number()) })
      .parse(await read(idUrl))
      .objectIds.sort((a, b) => a - b);
    if (JSON.stringify(ids) !== JSON.stringify(finalIds))
      throw new Error('Source changed during acquisition');
    if (source.id === 'counties') {
      if (rows.length !== 100) throw new Error('Expected 100 NC counties');
      counties = rows;
    }
    const countyIndex = counties.map((county) => ({ county, bounds: bbox(county) }));
    const included =
      source.kind === 'community'
        ? rows
        : rows.filter((row) => {
            const a = bbox(row);
            return countyIndex.some(
              ({ county, bounds: b }) =>
                a[0]! <= b[2]! &&
                a[2]! >= b[0]! &&
                a[1]! <= b[3]! &&
                a[3]! >= b[1]! &&
                booleanIntersects(row, county),
            );
          });
    const digest = await sha256(payloads);
    for (const row of included)
      row.id = source.id + ':' + digest + ':' + row.properties.sourceObjectId;
    assets.push(...included);
    const nc = source.url.includes('nconemap.gov');
    manifests.push({
      id: source.id,
      url: source.url,
      license: nc ? 'LicenseRef-NC-OneMap-Terms' : 'US-Public-Domain',
      termsUrl: nc
        ? 'https://www.nconemap.gov/pages/terms'
        : 'https://www.census.gov/about/policies/copyright.html',
      attribution: nc
        ? 'NC OneMap / North Carolina Center for Geographic Information and Analysis'
        : 'U.S. Census Bureau TIGERweb',
      vintage: nc ? null : typeof metadata.description === 'string' ? metadata.description : null,
      sha256: digest,
      sourceCount: ids.length,
      includedCount: included.length,
      metadata,
    });
  }
  return inventorySchema.parse({
    schemaVersion: '1.0.0',
    capturedAt: at,
    scope: 'North Carolina',
    synthetic: false,
    sources: manifests,
    assets,
  });
}
