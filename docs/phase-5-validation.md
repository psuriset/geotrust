# Phase 5 validation — September 28, 2026

## Automated checks

The full project check covers formatting, lint/import boundaries, strict TypeScript, 77 unit tests in 16 files, per-file coverage, plugin/demo/gateway build, the actual ZIP/ESM package import, and three browser tests. The unchanged per-file 81% thresholds enforce the project's greater-than-80% rule. All checks passed in both default fixture and live release modes. Aggregate coverage: statements 99.26%, branches 95.86%, functions 99.25%, lines 100%. No new runtime dependencies or coverage exclusions were introduced.

New checks cover capture-age thresholds/future dates/unknown vintage; feed failure/staleness versus healthy empty catalogs; source/normalized revisions; expiry/status/effective-time changes; missing/changed zone geometry; inventory identity changes; different radius parameters; changed distance values; reverse comparison direction; duplicate identity refusal; safe rendering; origin quota/persistence statuses; and verified selected backup export.

The offline browser scenario imports the committed Phase 4 golden bundle with both live feeds and prepared inventory unavailable, compares a second fixture snapshot, verifies coverage/inventory factors, exports the full comparison report, exports a verified saved bundle, deletes and restores that copy, checks origin storage estimates, and rejects a version 2 file. The source/version tests verify that the v1 golden bundle retains its exact checksum and results through both import and new creation.

The live plugin is also staged into the unchanged pinned GeoLibre browser host and tested for replay, comparison report export and verified selected backup export. Host tests block external requests. This remains browser-host validation, not certification of Tauri, every browser or unrelated upstream features.

## Historical real-data regression

After build, the existing opt-in test was run with:

```bash
GEOTRUST_PHASE3_BUNDLE=/absolute/path/to/nc-smoke.json npm run test:performance
```

This reused the retained 69,219,332-byte Phase 3 export without contacting hazard/data APIs. Results:

- All 1,701 findings and checksum `facd8d360b4eba491b7c0b7c5d3e9e0c67574bfb0df63992c45cb218a4e2b778` remained identical.
- Cancellation: 38 ms.
- Complete replay: 14,875 ms.
- Main-thread heartbeat: 594 ticks; largest gap 27.5 ms.

The measured summary is `docs/samples/phase-5-performance.json`. These are local Chrome responsiveness observations, not a promise of total runtime or a benchmark of large two-bundle comparisons. Phase 5 comparison is exercised with controlled fixtures whose changed inputs have known interpretations. Source/license restrictions from prior phases remain unchanged; no newly fetched live observations are claimed.

## Compatibility and limits

The committed synthetic golden bundle was generated from merged Phase 4 `d82de34` before Phase 5 edits. Supported v1 files use an identity reader; unsupported envelope/result/method versions are refused, with no speculative migration or checksum rewrite. Comparison reports carry input hashes but are separate export-only artifacts, not replayable evidence. Checksums are not signatures or proof of source accuracy.

Differences are recorded evidence factors, not proven causes, recovery or damage. Capture-age policy is local review guidance and does not fill unknown source vintage. Storage estimates/persistence depend on the browser; explicit exports remain important. Large replay/comparison still consumes worker CPU and memory, and the preview retains its nonfatal bundle-size advisory. No AI, cloud backup, new hazard feed or failure model is added.
