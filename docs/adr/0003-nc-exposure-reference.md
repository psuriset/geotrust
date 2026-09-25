# ADR 0003: NC exposure reference implementation and host validation

Status: accepted for the Phase 3 screening implementation; worker scalability remains open.

Retain one external GeoLibre plugin and the Phase 2 loopback gateway. The actual pinned browser host now passes fixture and live-plugin integration tests using its documented panel/layer/lifecycle APIs. No upstream application source is changed. Opt-in host CSP compatibility is isolated from the stricter demo policy.

Use source-preserving WGS84 GeoJSON with strict schemas and Turf for boolean intersection and geodesic proximity. This extends the deterministic reference implementation to roads and county community proxies without claiming area, length or population metrics. Its output contract can later be implemented by DuckDB-WASM in a plugin-owned worker; no nonexistent GeoLibre SQL API is assumed. A full local September 2026 run took about 15.8 seconds to validate/analyze/hash 11,090 inventory records and detailed zone geometry, so this synchronous implementation is a correctness baseline with a known responsiveness limitation, not completion of the Phase 0 worker/performance goals.

Use fixed public Census TIGERweb January 2026 service snapshots and NC OneMap layers, with verified object-ID pagination, metadata and hashes. This deliberately replaces the earlier proposed static 2025 Census download with the actual inspected service vintage. Do not treat a mutable service URL or its object IDs as an immutable dataset identity. Retain exact local snapshots/evidence exports for reproducibility.

Retain Phase 2 IndexedDB for current feeds and local files for prepared inventory/export. No FastAPI, PostGIS, cloud database, paid map service or AI layer is needed for this phase. These choices keep fixture development and replay local; live acquisition remains opt-in.

Consequences: large GeoJSON/bundles use substantial memory, coastal geometries can block the UI, and evidence exports are manually saved. SHA-256 is an integrity check, not a signature. County intersections cannot establish resident exposure, and potential shelter locations cannot establish operating status. These limitations are visible in the UI and phase documentation.
