# GeoLibre source inspection

Inspection date: 2026-09-25. Repository: [opengeos/GeoLibre](https://github.com/opengeos/GeoLibre). Reviewed HEAD: [`e7db039f8eb66c98cd50091f3ee05bb8032dedb4`](https://github.com/opengeos/GeoLibre/tree/e7db039f8eb66c98cd50091f3ee05bb8032dedb4), committed 2026-09-25 09:39:35 -04:00. Root/app/embed package versions: `3.0.0`. This is an inspected commit, not a claim about the latest published release or npm availability.

## License and organization

The root [LICENSE](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/LICENSE) is MIT, copyright 2026 Qiusheng Wu. Preserve the notice and license in redistributed copies. This does not license datasets, service access, provider trademarks, or all transitive dependencies under MIT.

The npm-workspaces monorepo contains `apps/geolibre-desktop` (React/TypeScript/Vite and Tauri v2 shell), `packages/core` (domain/store/project state), `packages/map` (rendering), `packages/plugins`, `packages/processing`, `packages/ui`, `packages/embed`, an optional Python backend, and service workers. MapLibre is the default renderer; other engines are optional. See the pinned [architecture](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/docs/architecture.md).

## Plugin packaging and lifecycle

Verified against [types.ts](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/packages/plugins/src/types.ts), [plugin-manager.ts](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/packages/plugins/src/plugin-manager.ts), [external-plugins.ts](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/apps/geolibre-desktop/src/lib/external-plugins.ts), and the [plugin guide](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/docs/plugin-api.md).

- `GeoLibrePlugin` has identity/version, `activate(app)`, `deactivate(app)`, and optional project-state and URL-parameter hooks. `activate` is synchronous (`boolean | void`); start cancellable asynchronous work after registration rather than assuming the host awaits a promise.
- External plugins have root `plugin.json`, an ESM entry and optional CSS. Entry exports default or named `plugin`; identity/version must match the manifest. The entry must be self-contained: relative imports inside a ZIP are not resolved by the loader.
- Desktop accepts ZIPs, unpacked development directories and manifest URLs. Web accepts manifest URLs and ZIP upload, persisting uploaded bundles in IndexedDB. URL plugins require HTTPS except localhost and must satisfy CORS.
- A build can discover plugin folders under `apps/geolibre-desktop/public/plugins/` without editing core registration code. Only these bundled manifests may request `activeByDefault: true`; saved state can override it. This is the proposed distribution path.
- JavaScript is loaded through a blob import. CSS is injected globally. Plugins share the host document and can access available environment credentials. Installation is a trust decision, not sandboxed capability delegation.
- Project-supplied manifest URLs have a trust gate. Marketplace metadata includes a minimum-version field, but this is not proof of API stability or compatibility for all installation paths.

## Verified integration surface and missing assumptions

The authoritative runtime wiring is [usePlugins.ts](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/apps/geolibre-desktop/src/hooks/usePlugins.ts). Optional methods must be feature-detected; refuse activation with a useful incompatibility message if essential methods are absent.

| Need | Exists at inspected revision | GeoTrust decision |
| --- | --- | --- |
| A native workspace panel | `registerRightPanel`, `openRightPanel`, unregister disposer; DOM `render(container)` | One panel with Events, Exposure, Scenarios and Evidence tabs; scoped CSS. Do not import host React internals. |
| Menu/control | `registerToolbarMenu`, `addMapControl`, `removeMapControl` | Small GeoTrust menu; panel is primary UI. |
| Add immutable vector output | `addGeoJsonLayer(name, FeatureCollection, sourcePath?)` | Explicit exported snapshots only, not a new layer on every poll. |
| Live map access | `getMap()` supplies MapLibre map, or null | Declare `engines: ["maplibre"]`; do not claim other renderer support. |
| Managed custom layers | `registerExternalNativeLayer`, `unregisterExternalNativeLayer` | Plugin owns stable sources/layers. Re-registering an existing ID updates the host record; unregister removes it from the store. |
| Read selection | `listLayers`, `getLayerFeatures`, `onSelectionChange`, selected-feature helpers | Link evidence to features; returned features are read-only. |
| Watch layer removal | `getLayers`, `onLayersChanged` | Honor user removal; do not resurrect layers on the next refresh. |
| Save settings | `getProjectState`, `applyProjectState` | Non-secret settings only. GeoTrust evidence bundle is the durable interchange format. |
| Export/import text | `exportTextFile`, `importTextFile` | Useful for small manifests; ordinary browser file APIs for data bundles. |
| Local runtime asset URL | `resolvePluginAssetUrl` | Valid for bundled/URL plugin assets; may return null for desktop filesystem installations. ZIP-only WASM packaging is not assumed. |
| Generic update/delete API | No general `updateLayer`/`removeLayer` on public plugin interface | Use the external-native-layer path for owned layers. Do not reach into Zustand. |
| Host SQL execution | No general public DuckDB connection or SQL-query method | Own a DuckDB-WASM worker; no invented `app.runSQL` or `app.getDuckDB`. |
| GeoParquet/PMTiles import helpers | Host supports these formats, but no general public `addGeoParquetLayer` or `addPMTilesLayer` was found | Analysis worker reads GeoParquet; emit bounded GeoJSON. PMTiles may use the existing host import workflow after testing. |
| AI integration | Assistant tool/guidance registration exists | Defer it. JSON-schema tool specs do not automatically validate callback inputs. |

Live layer synchronization needs a Phase 1 contract test: create MapLibre sources/layers, register their IDs/GeoJSON with the host, replace data and re-register on refresh, survive style reload, restore visibility, and clean up on deactivate. Source availability does not prove all these interactions work together. Pin this adapter separately from analysis.

The internal processing package contains algorithms and registries, but the inspected external plugin interface does not provide a general processing registration/execution bridge. Do not build on internal imports just because they are exported inside the monorepo.

Deployment restrictions also have a significant caveat: the existing [`plugins:install` capability](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/docs/deployment-capabilities.md) gates plugin activation/deactivation and plugin toolbar menus as well as installation. It is not an independent “disable marketplace only” switch. Keep required plugin capabilities enabled during the compatibility spike; use deployment UI configuration and a same-origin network policy to remove remote installation paths, then verify startup. Any stronger install-only gate may require an explicit upstream change. Client-side capabilities do not constrain devtools or a machine's owner.

## Embedding alternative

There is a real typed iframe client, [`@geolibre/embed`](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/packages/embed/README.md), using a versioned `postMessage` protocol. Verified methods include `connect`, `loadProject`, `setView`, `listLayers`, `setLayerVisibility`, `setFilter`, `addLayer`, `addData`, `exportImage`, events and disconnect. It is not an embeddable React component contract.

The deployment must explicitly allow parent origins through `GEOLIBRE_EMBED_ORIGINS` (Docker) or `VITE_GEOLIBRE_EMBED_ORIGINS` (static build). The public hosted site does not enable this runtime protocol by default. A separate shell still needs local GeoLibre assets and analysis, and adds cross-frame synchronization; it does not automatically solve plugin lifecycle or SQL access gaps.

## Build process and offline caveats

Verified [root scripts](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/package.json), [app scripts](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/apps/geolibre-desktop/package.json), [Vite configuration](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/apps/geolibre-desktop/vite.config.ts), and [contribution guide](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/docs/contributing.md).

- Node 22+; `.nvmrc` is 22. npm workspaces and `package-lock.json`; use `npm ci` for a reproducible Phase 1 build. Postinstall applies dependency patches.
- `npm run dev` starts Vite. `npm run build` runs the app's prebuild, TypeScript build and Vite; output is `apps/geolibre-desktop/dist/`.
- Prebuild compiles the embed client and invokes JupyterLite construction. The latter can skip with a warning if its CLI is unavailable unless required by build mode/environment. GeoTrust does not need notebooks; document this deliberately rather than installing Python notebook dependencies accidentally.
- Tauri development/build commands exist and require Rust and platform dependencies. Native desktop packaging is deferred; a local browser build is enough for the MVP.
- Upstream has lint, frontend Node tests, coverage, Playwright, backend and Rust checks. Its thresholds are not GeoTrust's thresholds. No checks were executed in this architecture-only review.
- Standard builds bundle DuckDB-WASM; `lite:build` deliberately uses CDN assets and is unsuitable for cold offline use. `GEOLIBRE_NO_EXTERNAL_CDN=1` controls upstream CDN choices but is not a blanket guarantee against third-party requests.
- `VITE_DUCKDB_SPATIAL_EXTENSION_PATH` supports a self-hosted spatial extension for the host. The plugin worker needs its own explicit local extension configuration. Match binary version/platform; retain signatures. [DuckDB extension documentation](https://www.duckdb.org/docs/current/clients/wasm/extensions).
- Bundle fonts, styles, glyphs, sprites, worker scripts and WASM. Hosted basemaps, plugin registries and optional engines may contact the internet. A service-worker cache warmed online does not satisfy cold offline acceptance.

## Data formats

The pinned [format matrix](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/docs/data-formats.md) lists:

| Category | Supported by host | Relevant qualification |
| --- | --- | --- |
| Vector/tabular | GeoJSON, GeoParquet/Parquet, FlatGeobuf, GeoPackage, Shapefile, GML, MapInfo TAB, KML/KMZ, GPX, delimited text, Excel, CAD, LandXML, OSM PBF, FileGDB | Source CRS and companion files matter; FileGDB folders need desktop access; large imports consume memory. |
| Raster/archives | GeoTIFF/COG, PMTiles, MBTiles, Zarr, NetCDF/HDF, Kerchunk | Local MBTiles requires desktop filesystem access. |
| Services | XYZ, WMS, WFS, WMTS, WCS 1.0.0, OGC API Features/Tiles, ArcGIS services, GeoRSS, STAC, CSW | CORS/auth/rate limits remain source-specific; WCS 1.1/2 are not claimed. |
| Database/project | DuckDB Spatial, desktop PostgreSQL/PostGIS connection, in-browser PGlite; `.geolibre.json`, supported QGIS/ArcGIS imports | Project JSON does not automatically package referenced local/remote data. |

Only GeoJSON/GeoParquet and the selected MapLibre path are required for first analysis. Format support is not a claim that every host feature is reachable through the external-plugin API.

## Remaining proof obligations

Build reproducibility; clean-profile offline boot; exact spatial extension/worker loading; external-layer lifecycle; local data import/export durability; browser memory at NC scale; dependency license inventory; source CORS/status and geometry quality. These are explicit Phase 1 gates, not verified results.
