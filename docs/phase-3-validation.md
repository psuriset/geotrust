# Phase 3 validation — September 25, 2026

## Automated checks

- `npm ci` and locked dependency installation completed.
- `npm run typecheck`: strict TypeScript passed.
- `npm run test:coverage`: 56 tests passed across 11 files. Statements 99.33%, branches 96.51%, functions 99.35%, lines 99.87%; every measured file exceeds the unchanged 80% requirement (configured minimum 81%).
- `npm run check`: formatting, lint, coverage, type checks, release/demo/gateway build, package import test and two Chromium harness tests all passed (56 unit tests, one package test and two browser tests).
- `GEOTRUST_MODE=live npm run build` and `npm run test:package`: live plugin bundle build and actual ESM entry import verified.
- Pinned actual GeoLibre build: completed under Node 22; upstream optional notebook assets warning and chunk-size/eval advisories remain. No tracked host source changes.
- `npm run test:host`: actual host fixture activation, visibility toggle, deactivate/reactivate and reload passed. `GEOTRUST_HOST_MODE=live npm run test:host`: actual host live plugin with deterministic mocked feeds/inventory, evidence export/import and deactivation passed. Each mode intentionally skips the other mode's test.

Host tests use Chrome/MapLibre and a blank local basemap. They do not certify native desktop packaging, Firefox, GeoLibre notebooks, every upstream feature or other plugins. Harness/host fixture tests block external requests; separate source smoke tests intentionally use internet access.

## Real source acquisition and replay

`npm run data:prepare` acquired 11,090 inventory records with complete object-ID pagination, stable before/after ID sets, boundary filtering and source metadata. The ignored local GeoJSON file is 62,419,419 bytes; its exact hash/counts are in `data/nc/acquisition-manifest.json`.

`node scripts/smoke-nc.mjs` captured data at **2026-09-25T16:59:00.750Z**: 16 NWS events, 2,158 USGS events, all eight required zone geometries resolved. The run produced 1,701 event–asset findings, with unique intersecting records: 18 hospitals, 234 potential shelters, 1,149 roads and 28 counties. This is a dated test result, not current emergency guidance, evidence of damage or a claim that shelters are open.

All selected inputs met this method's coverage checks. Full bundle export/import replay passed. The bundle was 69,219,332 bytes and took 15,757.9 ms to validate, analyze and hash on this machine; replay is additional work. The exact bundle checksum and summary are committed at `docs/samples/phase-3-live-run.json`; the full evidence file is retained locally under ignored `dist/evidence/nc-smoke.json`.

The first smoke run exposed real coastal zone MultiPolygons above an older 100-part bound and area-only GeometryCollections. The schema was corrected to accept bounded, source-preserving area geometries; a regression test covers 216 polygon parts and collection flattening. The final run resolved all eight zones. No text inference or geometry approximation was used to fill missing NWS zones.

## Known limitations

The synchronous reference implementation can freeze browser interaction during full-data analysis, hashing or import. The 16-second run is not a responsiveness benchmark pass. Moving that work to a cancellable worker is the first proposed Phase 4 task. Acquisition verifies IDs/page completeness, but a mutable provider can still edit attributes during capture. No historical immutable upstream snapshot is implied. Full evidence is large, checksums are not signatures, and inventory source payloads are summarized rather than all archived verbatim.
