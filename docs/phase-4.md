# Phase 4: Responsive analysis and local evidence history

Phase 4 implements a cancellable worker, cached inventory bounds, explicit dated local snapshots and comparison/replay. No AI, live source expansion or failure prediction is added. Phase 3's source licenses, geometries, uncertainty labels and exposure methods remain applicable.

## Setup and use

```bash
npm ci
# Only needed when the local inventory has not already been prepared:
npm run data:prepare
npm run live
```

Open `http://127.0.0.1:4174/?mode=live`. The application remains the labelled MapLibre development harness; the separately built GeoLibre plugin uses the same worker and public panel/layer integration. The default fixture preview is unchanged. See [Phase 3 host setup](phase-3.md#actual-geolibre-host) for the pinned actual host.

The exposure panel is above the feed event list. It reports the current processing stage and keeps prior completed evidence visible with its timestamp while new work runs. **Cancel current work** stops the worker; it does not erase previously completed evidence. Automatic analysis remains paused after cancellation or replay/comparison. **Analyze latest inputs** resumes live analysis using the latest available snapshots. **Reload inventory and analyze** also discards the worker cache and rereads the local inventory. Closing the panel or deactivating the plugin terminates its worker.

**Export reproducible evidence bundle** downloads the current completed evidence. **Replay evidence bundle** accepts a Phase 3 or Phase 4 version 1 file, checks it and reruns analysis in the worker. Re-selecting the same file after cancellation retries correctly. Imported evidence does not replace live feeds. Inventory loading failures do not disable file replay or saved history.

**Save snapshot locally** saves the displayed evidence, including its original analysis time and a separate local save time. Select snapshots A/B to replay A, compare them, or delete A. Comparison verifies both bundles first, then reports added, removed and unchanged event–asset match identities. It explicitly flags inventory changes; source snapshot IDs can change even when a real-world facility has not. These counts do not indicate damage, recovery or changed operations. The original evidence export remains the detailed audit artifact.

History uses `geotrust-history-v1`, separate from `geotrust-evidence-v1` latest-feed storage. Duplicate checksums keep a single saved snapshot. Limits are ten records / 256 MB total, with a 128 MB maximum bundle. Limit/quota/storage failures are visible; nothing is silently evicted or saved remotely. Explicit deletion removes the selected local copy only. Browser origin (scheme, host and port) determines storage isolation. Clearing browser data or browser eviction can remove it. Export anything important; this is not a backed-up archival service.

After an initial app load, file/saved replay needs no live APIs or local inventory fetch. Serving/reloading the application still requires the local server. The standalone harness is not a newly added installable offline PWA. No API keys, cloud database or Python service is required.

## Boundaries and lifecycle

- `jobs/protocol.ts`: typed commands and small results.
- `jobs/service.ts`: worker-only inventory parsing/validation, prepared analysis, hashing, encoding, replay and comparison.
- `jobs/client.ts`: one active request, request identities, progress, hard cancellation/restart and Blob URL cleanup.
- `jobs/worker-entry.ts`: message routing; errors become explicit responses.
- `history`: atomic IndexedDB snapshot persistence with schema/size/count checks.
- `exposure`: deterministic reference predicates and reusable candidate bounds index.
- `presentation`: safe text, progress/cancel controls, Blob download and history selection; no large evidence JSON parsing.

The cached inventory is scoped to one worker, never silently mutated or refreshed from a remote URL. A prepared index is tied to its inventory object; mismatches are rejected. Periodic feeds do not interrupt in-progress analysis or interactive replay/comparison. Late completions cannot repopulate a disposed panel or restart its worker. Stage progress is not a percentage estimate.

`npm run worker:build` generates `generated/worker-source.ts` from locked local dependencies. `predev`, `pretest`, `pretest:coverage` and `pretypecheck` run it automatically. It is ignored by Git, formatting and linting; original executable worker modules remain covered by the unchanged per-file coverage gate. The normal plugin ZIP remains self-contained and includes dependency license notices. There are no new runtime dependencies.

## Verification

Run `npm run check` for formatting, lint, >80% per-file coverage, type checking, build, actual package import and fixture browser tests. Unit tests cover worker caching/equivalence, cancellation/supersession, late results, worker construction/runtime errors, oversized/malformed imports, storage failures/limits, persistence, safe rendering and teardown.

The opt-in large-file test reuses existing captured evidence without live APIs:

```bash
GEOTRUST_PHASE3_BUNDLE=/absolute/path/to/phase3-evidence.json npm run test:performance
```

Run it after `npm run build`. It checks cancellation under one second, a 25 ms UI heartbeat whose largest observed gap stays below 500 ms, successful retry of the same file, and identical findings/checksum after worker replay. It skips explicitly when no evidence path is supplied. Timing is machine-dependent; this is a responsiveness/equivalence check, not a claim that total analysis is now instantaneous. See [validation results](phase-4-validation.md).

## Remaining limits and proposed Phase 5

Full inventory hashing, serialization and geometric analysis still take CPU time and memory inside the worker. The bounded summary avoids large return-message cloning, but feed/zone inputs, the main-thread map and feed event rendering can still cost time. The index reduces candidate work; it is not a tiled spatial database. Comparison holds two verified bundles in worker memory. The 128 MB limit is enforced before imported text parsing and after export encoding; fetching inventory still buffers its response before the byte check. No streaming archive or multi-worker pool is claimed.

Proposed Phase 5 (not implemented): measure larger workloads and add indexed GeoParquet/DuckDB-WASM only if justified; improve snapshot lifecycle/storage budgeting; add explicit bundle/algorithm migration policy; then consider projected road-length/community-area metrics with validated units and separately reviewed population data. Dependency modelling still requires sourced relationships, not inferred proximity. No failure prediction is authorized by this phase.
