# ADR 0004: Plugin-owned worker and explicit local history

Status: accepted for Phase 4.

The Phase 3 reference engine produced reproducible results but synchronous geometry, validation, hashing and JSON operations could stall the map. Run those operations in a dedicated GeoTrust Web Worker. The main thread sends normalized feed snapshots and resolved zones; the worker loads and validates the local inventory itself. Replies contain a bounded summary and a Blob, not the complete parsed inventory or bundle. Export downloads that Blob without stringify on the UI thread.

Bundle the worker as an embedded self-contained classic script and launch it with a Blob URL. This is compatible with GeoLibre's external plugin loader without assuming plugin-relative asset URLs, additional host APIs or a CDN. The existing `worker-src 'self' blob:` policy supports it; no CSP relaxation is added. `scripts/build-worker.mjs` generates an ignored source module before development, tests and type checks/builds. The generated module contains code, not data or secrets.

Cancellation terminates the worker. This stops synchronous geometry and JSON work immediately, while cooperative messages alone could not interrupt those operations. A later operation creates a fresh worker. Completed workers remain available for reuse: their validated inventory and sorted bounding-box index are cached until explicit reload, panel close, cancellation, error or plugin deactivation. There is no silent main-thread fallback when workers are unavailable.

Retain the Phase 3 version 1 evidence contract and screening methods. A sorted bounding-box candidate index avoids recomputing all asset bounds on each refresh; exact Turf predicates and final finding ordering remain unchanged. Hashes still cover the complete inventory, so encoding/hashing is not incremental. GeoParquet/DuckDB-WASM is deferred until needed for data size and query workloads; this phase needs no new service or runtime dependency.

Use a separate IndexedDB database for explicit dated evidence snapshots, leaving Phase 2 current-feed storage unchanged. Store opaque evidence Blobs plus small metadata, keyed by checksum. Enforce ten snapshots and 256 MB atomically; reject quota/limit failures rather than silently evict evidence. Save is explicit because 69 MB bundles should not accumulate every minute. Import/replay validates evidence in the worker without replacing live feed storage. Comparisons report set membership changes in evidence matches, not damage, recovery or operational change.

Consequences: termination drops the inventory cache, full evidence still consumes considerable memory, browser storage is origin-specific and can be cleared/evicted, and checksums do not authenticate publishers. Export important snapshots. Worker progress reports stages rather than fictitious completion percentages. UI responsiveness is measured separately from total computation time.
