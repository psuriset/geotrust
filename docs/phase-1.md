# Phase 1 scope and handoff

This implementation follows the user's refined Phase 1 requirements: repository/tooling, actual plugin integration structure, offline fixtures, module boundaries, configuration, documentation and validation. It supersedes the earlier Phase 0 roadmap's assignment of live feeds and full NC data acquisition to Phase 1. Those features are not implemented here.

## Delivered

- Independent GeoTrust repository and implementation branch.
- Strict TypeScript, ESLint architectural import boundaries, Prettier, Vitest per-file coverage gate, Playwright browser test and build/package tests.
- Validated development/test/production profiles; all remain fixture-only. No credentials.
- Three synthetic NC fixture datasets: NWS-shaped warnings, USGS-shaped earthquakes, and hospital/potential-shelter/road examples.
- Normalization, small point-exposure/proximity reference analysis, hashes/provenance export and dependency contracts.
- External plugin ZIP with self-contained ESM and scoped CSS, plus a local MapLibre preview.
- Offline tests for typed API shape, lifecycle cleanup, geometry boundaries, malformed data, uncertainty and evidence reproducibility.

## Limitations

- No live HTTP hazard adapter, polling gateway or downloaded real NC inventory.
- No full upstream GeoLibre build/install smoke test; the upstream declaration snapshot and local harness establish contract structure, not full host certification.
- No DuckDB-WASM worker, GeoParquet, PMTiles, STAC, PostGIS, Python or FastAPI runtime.
- No road lengths, community/population analysis, network routing, dependency propagation, AI, background monitoring or durable IndexedDB storage.
- The limited fixture parsers are not complete NWS CAP or USGS catalog clients. No zone resolution or cross-ID alert-reference reconciliation.
- Geometry validation checks bounded coordinates/ring closure; it does not repair topology or certify arbitrary uploaded geometry.
- No live asset operational status. No prediction of failure probability.
- The development demo is an API harness, not a separate replacement product or an embedded GeoLibre deployment.
- Browser test covers Chromium. Firefox and native Tauri are not certified.

## Proposed Phase 2

1. Build the pinned upstream revision in a separate checkout and install the generated plugin ZIP. Test panel/layer synchronization, style changes, host removal and project restore; avoid editing upstream directly.
2. Prove a plugin-owned DuckDB-WASM Spatial worker with locally packaged, version-matched WASM/extensions in a cold offline profile. Compare against independent fixtures.
3. Review source rights/vintage and acquire the real NC hospitals, potential shelters, roads and community boundaries into a hashed GeoParquet bundle.
4. Add durable evidence storage and complete bundle export/import with quota/corruption tests.
5. Extend deterministic analysis to roads/communities and explicit conditional dependency scenarios only when supporting data exists.
6. Implement live NOAA/USGS adapters only in a separately authorized increment: rate limits, cache/zone resolution, cancellation references, stale/offline health and a loopback gateway.
7. Preserve the AI-off workflow; optional explanations remain later work.

Do not mark the broad Phase 0 roadmap's runtime/NC-scale/live-feed gates complete based on this smaller foundation.
