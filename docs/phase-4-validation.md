# Phase 4 validation — September 25, 2026

## Checks

`npm run check` passes formatting, ESLint/module boundaries, strict TypeScript, 67 unit tests across 13 files, the self-contained plugin ZIP/ESM import check and both browser harness tests. Coverage remains above the unchanged per-file 81% gates (the project requirement is greater than 80%). Aggregate coverage: statements 99.22%, branches 95.49%, functions 99.11%, lines 100%. No worker executable code is excluded from coverage; only the generated bundle is outside the application source coverage glob.

The browser harness tests exercise the actual Blob worker, IndexedDB snapshot persistence across reload, replay while feeds and local inventory are unavailable, comparison, and the unchanged offline fixture mode. Unit tests cover prepared-index equivalence, one-time inventory loading across repeated jobs, input/combined-export byte limits, malformed evidence, cancellation/supersession, late replies/errors, disposal, storage limits, duplicate saves, database failures, corruption, safe text and file retry.

`GEOTRUST_MODE=live npm run check` validates the opt-in live release package as well. The actual pinned GeoLibre host is separately rebuilt and tested with `GEOTRUST_HOST_MODE=live npm run test:host`; this tests the real plugin loader/CSP with no tracked upstream source modifications, rather than treating the MapLibre harness as equivalent. Fixture-mode host coverage from Phase 3 remains historical; Phase 4 host scope is its changed live worker/history flow.

## Large captured evidence test

Command, after build:

```bash
GEOTRUST_PHASE3_BUNDLE=/absolute/path/to/phase3-evidence.json npm run test:performance
```

Measured locally in Chrome using the existing Phase 3 captured evidence, without source API calls:

| Measurement                                      |           Result |
| ------------------------------------------------ | ---------------: |
| Evidence size                                    | 69,219,332 bytes |
| Findings                                         |            1,701 |
| Cancellation response                            |            40 ms |
| Full import, verification, analysis and encoding |        14,399 ms |
| 25 ms main-thread heartbeat ticks                |              575 |
| Largest heartbeat gap                            |          39.9 ms |
| Phase 3 result and checksum equality             |           Passed |

The original checksum is `facd8d360b4eba491b7c0b7c5d3e9e0c67574bfb0df63992c45cb218a4e2b778`. The test compares the returned export's checksum and entire findings result with the captured Phase 3 bundle. The measured summary is in `docs/samples/phase-4-performance.json`; a screenshot is retained locally in `dist/validation/phase4-worker-history.png`.

The first large test found that choosing the same file after cancellation did not trigger a browser change event. Resetting the input after capturing the File fixed it; the successful test includes cancel and immediate same-file retry. The test requires cancellation under one second and a maximum heartbeat gap below 500 ms. Those thresholds test responsiveness, not total speed or performance on every machine. Phase 3's Node timing and this Chrome replay timing measure different operations; no speedup ratio is claimed.

## Limits

Large geometry/hash work still takes seconds and substantial worker memory. Comparisons load two bundles; they are bounded but not streaming. Full inventory hashes/exports remain recomputed, while validated inventory and bounding boxes are reused. Explicit cancellation discards that cache. Main-thread map/feed rendering remains separate from worker analysis and can still consume time. Live network feeds and offline evidence are deliberately separate modes of evidence use; no source facts are inferred by this phase.

Local snapshots are origin-specific, unsigned, and subject to browser eviction. Counts/changes are geographic match evidence, not damage, recovery or operational status. The preview bundle-size warning remains nonfatal; worker embedding increases the self-contained artifact size. No native Tauri/all-browser certification, AI, DuckDB-WASM, server database or automatic cloud backup is introduced.
