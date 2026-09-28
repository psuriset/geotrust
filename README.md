# GeoTrust

An open-source GeoLibre plugin foundation for exploring infrastructure exposure and the evidence behind it. **Phase 4 adds cancellable worker analysis, cached inventory bounds and local evidence history.** Default mode remains offline and fixture-only. Fixture mode displays synthetic examples near North Carolina. Explicit live mode displays source events with freshness and feed-health labels; it does not assess infrastructure damage.

The external plugin runs inside GeoLibre using its documented public APIs. This repository also includes a local MapLibre development harness so contributors can work without installing GeoLibre or contacting APIs. The harness is explicitly labelled and is not the full GeoLibre application.

## Live feeds, NC exposure and local history

Run `npm ci`, `npm run data:prepare`, then `npm run live` and open `http://127.0.0.1:4174/?mode=live`. Read the [Phase 2 contract, configuration, persistence and limitations](docs/phase-2.md), [validation](docs/phase-2-validation.md), and [sample events](docs/samples/). Read the [Phase 4 worker/history guide](docs/phase-4.md) and [validation](docs/phase-4-validation.md), plus the [Phase 3 setup, data sources and limitations](docs/phase-3.md) and [validation results](docs/phase-3-validation.md). No AI or paid keys.

## Offline setup

Use Node.js 22 LTS and npm. `.nvmrc` selects Node 22; exact dependency versions are in `package-lock.json`.

```bash
git clone https://github.com/psuriset/geotrust.git
cd geotrust
nvm use
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. The blank local basemap, synthetic fixtures, application code and styles require no runtime internet connection, cloud service or paid key. The first dependency installation requires access to npm (or a prepared npm cache).

The offline fixture four-question panel shows events, point exposure/proximity, unavailable dependency modelling, and input hashes/limitations. Roads appear on the map but are explicitly unanalyzed. Potential shelters are never labelled open. Export evidence as JSON using the panel button.

Extra Phase 3 commands: `npm run data:prepare` acquires public inventories; `npm run test:host` tests a separately built pinned host. `node scripts/smoke-nc.mjs` performs an opt-in real-feed acquisition, analysis and replay check.

## Commands

| Command                 | Purpose                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`           | Local development preview, bound to loopback                                        |
| `npm run typecheck`     | Strict TypeScript checks                                                            |
| `npm run lint`          | ESLint and module import boundaries                                                 |
| `npm run format`        | Format source and current documentation                                             |
| `npm run format:check`  | Verify formatting without modifying files                                           |
| `npm test`              | Unit and pinned API-contract tests                                                  |
| `npm run test:watch`    | Interactive test runner                                                             |
| `npm run test:coverage` | Per-file >80% gate on executable application packages                               |
| `npm run build`         | Type check, self-contained plugin ZIP, demo, dependency licenses and CycloneDX SBOM |
| `npm run test:package`  | Verify the built ZIP and import its actual ESM entry; run after build               |
| `npm run preview`       | Serve the built demo at `http://127.0.0.1:4173`                                     |
| `npm run test:e2e`      | Start preview and test offline rendering, lifecycle and export in Chromium          |
| `npm run check`         | Formatting, lint, coverage, type check/build, package and browser tests             |

For browser tests, install Chromium once with `npx playwright install chromium` (Linux CI uses `npx playwright install --with-deps chromium`). On macOS the test configuration uses locally installed Google Chrome if available. Browser tests block and fail on external requests. The server must be permitted to bind to loopback. Tests are not tied to a user's browser session.

Coverage excludes type-only contracts and the one-line bundled entry; the entry is exercised by the release-package test. The preview and build scripts are exercised by build/package/browser tests. CI uses Node 22 on Linux. See [validation results](docs/validation.md) for what was actually run locally.

## Install into GeoLibre

1. Build with `npm run build`.
2. In a compatible GeoLibre host, use **Manage Plugins → Settings → Install from file**, selecting `dist/geotrust-plugin.zip`.
3. Activate **GeoTrust** in the plugin manager. External ZIPs do not automatically activate by default.
4. The plugin registers one native layer group and a right panel. Deactivation removes its owned sources/layers, subscriptions and panel. An incompatible host fails activation with a diagnostic in the developer console.

The package is also available unpacked in `dist/geolibre-plugin/`. A deployment maintainer can place that folder under the host's documented `public/plugins/geotrust/` drop-in path before building their own distribution. No upstream checkout was modified by this implementation.

The pinned API revision is `e7db039f8eb66c98cd50091f3ee05bb8032dedb4` (package version 3.0.0). Contract tests inspect a checksummed upstream type snapshot. **The actual pinned browser host now passes fixture and live-plugin integration tests.** See [host setup and validation scope](docs/phase-3.md#actual-geolibre-host); the development harness remains separate. The intended package format and API calls are grounded in the [pinned plugin documentation](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/docs/plugin-api.md).

## Configuration and secrets

`config/development.json`, `config/test.json` and `config/production.json` share a strict schema. All set `mode: fixture`, a fixed replay time, an earthquake screening radius and an input byte cap. Unknown fields, unknown profiles, live mode and invalid limits are rejected.

The demo selects development/production from Vite's mode. To select an explicit public profile, copy `.env.example` to `.env.local` and set `VITE_GEOTRUST_PROFILE=test`. For a plugin build use `GEOTRUST_PROFILE=test npm run build` (production is the default). Tests always use the checked-in test profile.

`.env*` and `config/*.local.json` are ignored, except the public example file. Local JSON overrides are deliberately not loaded in Phase 1. Never put secrets in `VITE_*` variables: they are compiled into browser assets. No credentials or network URLs are needed. Changing a profile cannot enable live feeds.

## Repository structure

- `packages/domain`: shared types and geometry validation.
- `packages/ingestion`: immutable, size-bounded bundled fixtures; no HTTP client.
- `packages/normalization`: bounded source-shape parsers and revision handling.
- `packages/analysis`: deterministic fixture point screening; no failure predictions.
- `packages/jobs`: plugin-owned cancellable worker, small message contract and cached inventory analysis.
- `packages/history`: explicit local snapshot saves, bounded IndexedDB storage and metadata.
- `packages/assets`: strict NC inventory contracts and fixed-source, verified acquisition.
- `packages/zones`: complete-or-unknown NWS zone geometry resolution.
- `packages/exposure`: deterministic real-inventory point/road/county screening.
- `packages/bundles`: self-contained evidence export and verified local replay.
- `packages/geoevent`, `packages/feeds`, `packages/storage`, `packages/gateway`: Phase 2 live event contract, transport, IndexedDB and fixed local API.
- `packages/provenance`: canonical JSON, SHA-256 input/run hashes and evidence export records.
- `packages/dependencies`: explicit edge contracts; propagation deferred.
- `packages/presentation`: MapLibre adapter, safe DOM panel and narrow public GeoLibre API boundary.
- `packages/plugin`: composition, manifest, entry and lifecycle.
- `packages/config`, `config`: strict environment profiles.
- `apps/demo`, `index.html`: local development harness.
- `data/fixtures`: clearly labelled synthetic NOAA/USGS-shaped events and NC assets.
- `tests`: unit, contract, lifecycle, package and browser tests.
- `scripts`: build, license aggregation and SBOM generation.
- `upstream`: exact inspected API revision/hash; not an upstream checkout.

## Architecture and next phase

Read [ADR 0003](docs/adr/0003-nc-exposure-reference.md), [Phase 3](docs/phase-3.md), [ADR 0001](docs/adr/0001-geolibre-plugin.md), [module boundaries](docs/module-boundaries.md), and [current Phase 1 scope / proposed Phase 2](docs/phase-1.md).

The earlier [architecture](ARCHITECTURE.md), [GeoLibre audit](GEOLIBRE-AUDIT.md) and [roadmap](IMPLEMENTATION-PLAN.md) remain as Phase 0 references. Phase 1 followed the foundation-only scope; Phase 2 follows the subsequently authorized live-feed scope.

Known limits: large analysis still takes CPU time and memory in a worker; no DuckDB-WASM, GeoParquet/PMTiles, projected lengths/areas, population estimates, dependency propagation or AI. Local history is explicitly saved, origin-specific and subject to browser eviction; export important evidence. See [Phase 4 limitations and follow-up scope](docs/phase-4.md#remaining-limits-and-proposed-phase-5). The preview still produces a nonfatal bundle-size advisory.

GeoTrust code and authored fixtures use [MIT](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md); builds include full production-dependency license texts and `dist/sbom.cdx.json`. Dataset/service terms remain separate from software licensing.
