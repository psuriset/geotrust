# Phase 3: NC inventories, exposure and reproducible evidence

This phase adds one GeoLibre plugin's real NC inventory screening, NWS zone geometry, and portable evidence replay. Fixture mode remains the default. No AI, cloud account or paid key is required. GeoLibre is still a separate pinned host; GeoTrust does not fork its application source.

## Run locally

```bash
npm ci
npm run data:prepare
npm run live
```

Open `http://127.0.0.1:4174/?mode=live`. Stop an older server on that port before restarting. Preparation contacts five fixed public ArcGIS layers, verifies complete object-ID pages, filters roads against NC county boundaries, then atomically writes `public/data/nc-inventory.json`. Build copies it to the local demo. A missing inventory shows an explicit setup error; it never falls back to synthetic assets in live mode.

`npm run dev` remains the offline synthetic demonstration. Unit and browser tests use local fixtures without external services. Saved evidence can be replayed without network access using `importBundle` in `packages/bundles`; the live panel's replay control is available once a local inventory is installed. Live feeds require internet; failed or stale feeds produce partial/unknown coverage rather than an all-clear. The current browser implementation can pause during large inventory analysis and import.

## Data snapshot and rights

The acquisition manifest at `data/nc/acquisition-manifest.json` records the actual September 25, 2026 capture, source URLs, metadata, terms, counts and hashes. The 62,419,419-byte inventory is ignored by Git; rebuild it with the preparation command or retain the exact snapshot/evidence bundle for reproducibility. A later acquisition will produce a different hash and potentially different counts.

| Source                          | Included records | Interpretation                                                                         |
| ------------------------------- | ---------------: | -------------------------------------------------------------------------------------- |
| NC OneMap hospitals             |              163 | Listed facilities, including different hospital types; no capacity or operating status |
| NC OneMap potential shelters    |            2,447 | Candidate buildings, not activated or confirmed-open shelters                          |
| Census TIGERweb primary roads   |              686 | Road features, not distinct named routes                                               |
| Census TIGERweb secondary roads |            7,694 | Major-road features; not every local road                                              |
| Census TIGERweb counties        |              100 | Administrative community proxies, not population exposure                              |

Census layer metadata identifies January 1, 2026 vintage. NC OneMap vintage is retained as unknown where the service provides no authoritative date; acquisition time is not the data's observation time. Roads that cross the NC border retain their full source geometry; the inventory is selected by intersection, not clipped. Provider object IDs are scoped to the source snapshot, not assumed to be persistent real-world asset identifiers.

Census data uses its [public-domain policy](https://www.census.gov/about/policies/copyright.html). NC OneMap records carry their source metadata, attribution and [data-sharing policy](https://www.nconemap.gov/pages/terms). These terms remain separate from GeoTrust's MIT code license. Preserve source notices and disclaimers when redistributing snapshots. Source availability, completeness and suitability for emergency decisions are not guaranteed. Preparation selects facility names/types and geometry; it does not ingest personal contact fields. Locally exported bundles contain those public facility locations and raw public hazard payloads; do not add private operational information casually.

## Analysis contract

`Inventory` and `ExposureRun` are version `1.0.0`. The existing versioned GeoEvent contract is unchanged. Acquisition, normalization, geometry resolution, analysis and presentation are separate modules. All results are deterministic for the same inventory, events, zones, timestamp, radius and installed algorithm version.

- Fresh successful feed snapshots are eligible. Failed/degraded/stale or missing sources are explicit limitations. Expired, test, cancelled, unconfirmed and future-effective events are excluded.
- Weather alerts use their source polygon when present. Otherwise every referenced NWS zone must resolve; partial zone sets are never presented as a complete alert footprint. Polygon, MultiPolygon and area-only GeometryCollection responses are supported without simplification.
- Boundary-inclusive point/line/area intersection provides weather exposure. Findings say `source-polygon` or `nws-zones`; a zone footprint is not a newly observed hazard boundary.
- Earthquake screening uses a disclosed 100 km radius by default (contract allows 10–300 km). Points and roads use geodesic distance; counties use intersection with a 256-segment geodesic circle. This is an approximate screening footprint, not ShakeMap, intensity, damage or failure probability.
- Unique record counts and event–asset matches are different. The panel displays both and lets users inspect the first 100 matches; export contains all matches.
- No affected road length, intersected area, population, network connectivity, closures, capacity, outages, shelter activation or cascading failure is calculated. Geographic overlap alone cannot establish those facts.

`complete` means eligible input coverage for these selected feeds and methods. It does not mean complete knowledge of all hazards or real infrastructure. Stale/missing inventories currently have no automatic recency threshold; their capture time and source vintage remain evidence that users must inspect.

## Persistence and replay

Phase 2 IndexedDB remains the latest-feed snapshot store. Local inventory is a static file. Explicit export produces a versioned bundle containing the normalized inventory, feed snapshots, raw hazard payloads, raw NWS zone responses, parameters, timestamp, findings and a canonical SHA-256 checksum. Import checks schemas, size (128 MB), raw payload references/hashes and zone hashes, then recomputes and compares the deterministic result.

Checksums detect changes; they do not authenticate a publisher or prove a source's truth. Inventory normalization is retained, not every original ArcGIS response. The manifest's source hash therefore is audit metadata, not a claim that replay revalidates every original source response. Retain acquisition inputs separately if that stronger audit is required. There is no automatic historical archive, signed bundle, cross-version migration or import into live feed storage.

## Actual GeoLibre host

Validated against `e7db039f8eb66c98cd50091f3ee05bb8032dedb4` (3.0.0). Tests exercised the actual built browser host with a blank basemap, not just the MapLibre harness. The public lifecycle, panels and native layer APIs are unchanged. Fixture activation/deactivation/reactivation, layer visibility and reload passed; the live bundle's fixture-fed panel, evidence export and replay passed.

To reproduce in a separate disposable checkout:

```bash
# In GeoTrust, after preparing data:
GEOTRUST_MODE=live npm run build
node scripts/stage-geolibre.mjs /absolute/path/to/pinned-GeoLibre
# In that pinned GeoLibre checkout:
npm ci
VITE_GEOLIBRE_CAPABILITIES=project:edit,data:add,export:data,plugins:install,settings:manage npm run build
# Back in GeoTrust (stop another server on port 4174 first):
GEOTRUST_WEB_ROOT=/absolute/path/to/pinned-GeoLibre/apps/geolibre-desktop/dist GEOTRUST_HOST_MODE=geolibre node scripts/live.mjs
GEOTRUST_HOST_URL=http://127.0.0.1:4174 GEOTRUST_HOST_MODE=live npm run test:host
```

Use Node 22. For fixture host tests, build without `GEOTRUST_MODE=live`, stage/rebuild, and run `test:host` without the live test selector. Staging refuses a mismatched upstream commit. It copies deployment artifacts into the isolated host's public directory: the plugin path is ignored upstream, while the data and starter project are untracked local files. No tracked upstream source is edited. Open the generated `geotrust.geolibre.json` starter project for a blank local basemap centered on NC. Host build and browser test are explicit commands because the full host is not a GeoTrust npm dependency.

The gateway's explicit `GEOTRUST_HOST_MODE=geolibre` policy permits blob scripts and `unsafe-eval`, required by this pinned host's plugin loader/vendor code. The smaller demo retains its stricter CSP. Plugin execution remains trusted code, not a sandbox. The gateway binds loopback, enforces same-origin/fixed upstream routes and rejects zone URL/ID injection; it is not a public multi-user deployment. Zone requests have a timeout, byte cap and bounded 24-hour cache. Missing zones remain unknown. No generic proxy or source credentials are introduced.

This validates the browser integration used here, not every GeoLibre feature, Tauri, arbitrary plugins or all browsers. The host build warned that optional JupyterLite assets were absent; notebook processing is not enabled or required.

## Acceptance and next phase

Phase 3 acceptance: complete paged acquisition with source manifest; typed deterministic point/road/county exposure; full-or-unknown zone resolution; explicit uncertainty/status; checksummed portable export/replay; offline fixture coverage; actual pinned host lifecycle tests; >80% per-file executable coverage and full project checks. See [validation](phase-3-validation.md) and [ADR 0003](adr/0003-nc-exposure-reference.md).

Proposed Phase 4, not implemented:

1. Move analysis and large-file parsing/hash work into a cancellable worker; measure responsiveness and memory with this exact 69 MB evidence sample.
2. Introduce indexed GeoParquet/DuckDB-WASM loading behind the existing contracts, validate result equivalence, and avoid loading every geometry for every refresh.
3. If required, add projected and validated road-length/community-area calculations with explicit units and boundary cases. Add population only with a separately licensed, dated population dataset.
4. Add durable snapshot/history management, normalization provenance verification, bundle migration/version tooling and inventory update review.
5. Model infrastructure dependencies only from explicit sourced relationships with dates and uncertainty. Do not turn proximity into a dependency or predict failure without an approved model.
