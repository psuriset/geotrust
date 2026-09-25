# GeoTrust implementation plan and acceptance criteria

> Historical Phase 0 roadmap. The current Phase 1 request explicitly excludes live feeds and focuses on the offline foundation. See [the implemented scope](docs/phase-1.md); the broader gates below are not all complete.

Proposed work only. Phase 0 stops with these documents. Task IDs below are planning identifiers, not created Linear tickets. No AlgoSphere tickets were repurposed or moved to review.

## Proposed repository

The separate `geotrust` repository now contains the Phase 0 documents. The structure below is proposed for implementation; dependency locks, CI and application scaffolding have not been created.

```text
geotrust/
  README.md
  LICENSE                         # proposed MIT code license
  THIRD_PARTY_NOTICES.md
  package.json                    # Node/TypeScript workspaces
  package-lock.json
  upstream/geolibre.lock.json      # exact upstream SHA and artifact hashes
  apps/local-launcher/             # static serving and fixed public-feed routes
  packages/
    plugin/                       # GeoLibre lifecycle, panels, MapLibre adapter
      geolibre-plugin/plugin.json
      src/
    domain/                       # source-independent types and schemas
    ingestion/                    # NWS/USGS parsing, revisions, validity
    analysis/                     # fixed SQL, worker, predicates, metrics
    evidence/                     # provenance, quality rules, export/import
    explanations/                 # deferred optional adapter; absent in Phase 1
  config/
    default.json                  # versioned thresholds, event allowlist, limits
    sources.json                  # exact routes, source IDs and terms
  schemas/                        # JSON Schema; worker/result/bundle contracts
  data/
    manifests/                    # checked-in provenance and terms references
    licenses/                     # dataset terms snapshots and attribution
    fixtures/                     # small reviewed/synthetic test inputs
    raw/                          # ignored source downloads
    bundles/                      # ignored/generated release datasets
  tools/data-prep/                 # maintainer Python CLI; no runtime web API
  distribution/
    host-profile/                 # upstream-supported deployment configuration
    runtime/                      # generated workers/WASM/extensions, checksummed
  tests/
    unit/
    contracts/                    # exact upstream API and source schemas
    spatial/                      # independent golden geometries and metrics
    e2e/                          # offline, live failure, lifecycle, persistence
    security/
    performance/
  docs/
    architecture/
    adr/
    data-dictionary.md
    source-register.md
    operations.md
  .github/workflows/               # build, test, license/SBOM and package checks
```

Do not scaffold this tree during Phase 0. Vendor only redistributable runtime assets at release build time; avoid committing a full GeoLibre fork. The release build checks out the lock's SHA, places the built plugin under the verified public-plugin directory, applies documented deployment configuration and builds the local package. Any necessary source patch is explicit, small and tracked for upstreaming.

## Phases and exit gates

| Phase | Deliverable | Exit criterion |
| --- | --- | --- |
| 0 — architecture | This design, API/source audit, source register and backlog | Recommendation and uncertainties documented; no product implemented. Complete. |
| 1 — prove the local foundation | Pinned host/plugin, local NC bundle, two feed adapters, deterministic exposure/proximity results and evidence export | All Phase 1 gates below pass; no scenario or AI claims needed. |
| 2 — bounded resilience MVP | Polished four-question workflow, county/tract summaries, explicit dependency scenarios, optional PMTiles display, historical replay hardening | Conditional effects trace to verified/assumed edges; no unqualified outage predictions; all classes and NC coverage limitations visible. |
| 3 — optional explanations and extension | Local AI explanation adapter; optional STAC imagery/ShakeMap evidence; richer dependency datasets | AI-off parity, cited outputs and privacy tests; each added source has terms and uncertainty review. |
| 4 — only after demonstrated need | Multi-user PostGIS/FastAPI, native desktop packaging, unattended collection or public embedded portal | Separate architecture/security/capacity decision; not necessary for local MVP. |

## Exact Phase 1 tasks

Execute in the dependency order below. No implementation starts as part of this Phase 0 request.

| ID | Work and concrete deliverable | Depends on | Acceptance |
| --- | --- | --- | --- |
| GT-P1-01 | Create the separate repository and GeoTrust issue project; copy these decisions; choose MIT; lock Node, upstream SHA and dependency strategy. Add TypeScript tests under `tests/`, CI and coverage reporting. | None | Fresh clone has documented build commands; trading repo untouched; every implementation ticket has tests and >80% coverage for new/modified modules before review. |
| GT-P1-02 | Build inspected GeoLibre unchanged with `npm ci` and documented scripts; record compiler/runtime versions, dependency patches, JupyterLite behavior and licenses. Produce locally served static artifact and no-CDN inventory. | 01 | Build succeeds at the lock SHA or an ADR explains replacement; notices/SBOM generated; no API-key prompt for NC workflow. |
| GT-P1-03 | Build minimum external plugin using the existing manifest/ESM contract. Exercise panel, selection, owned layers, data replacement, style reload, user deletion, deactivate/reactivate and state restore. | 02 | Ten refreshes keep stable layer IDs/counts; twenty activation cycles leak no timers/listeners/workers; user-deleted layers stay removed; no private-store imports. Missing required APIs cause a clear disabled state. |
| GT-P1-04 | Instantiate a separate DuckDB-WASM Spatial worker with local matching WASM/extension assets; prove GeoParquet import, intersection, metric projection, geodesic distance and cancellation. | 02–03 | Clean-profile offline worker load succeeds; signatures/version hashes retained; independent spatial fixtures pass; failed/cancelled jobs cannot publish partial findings. This is an early go/no-go gate. |
| GT-P1-05 | Freeze source register and terms. Verify NC hospital/shelter metadata, vintage, field restrictions and object-ID semantics. Select dated TIGER NC roads/counties/tracts. Record source queries, raw counts and coverage gaps. | 01 | Every selected input has publisher, URL, rights snapshot, citation, CRS, as-of/vintage or explicit unknown, and acquisition plan. No ambiguous-rights dataset enters the distributable bundle. |
| GT-P1-06 | Prepare versioned NC starter bundle via maintainer CLI. Fetch service object IDs and all pages/batches (2,000-record limits), request/transform coordinates correctly, validate geometry, strip private contact fields, convert to GeoParquet and generate hashes. | 04–05 | Retrieved unique IDs reconcile with source totals, with additions/deletions during extraction detected and retried or documented. All 100 counties represented by the boundary layer. Asset coverage is reported per county; no invented zero-as-complete claims. |
| GT-P1-07 | Define JSON schemas, stable IDs, hazard validity/revision rules, run manifests and evidence reason codes. Implement fixture-first parsers for NWS and USGS. | 01, 05 | Tests cover malformed payloads, coordinate order, USGS depth units, null geometry/magnitude, duplicates, revisions, time zones, test alerts, cancellations, missing/unknown fields and future-effective alerts. |
| GT-P1-08 | Implement local launcher and fixed-route hazard gateway, explicit live/offline modes and polling lifecycle. Cache NWS zone geometries; add backoff, timeouts, size caps, identifying User-Agent and shared request budget. | 02, 07 | Loopback/Host/Origin/redirect tests pass; no arbitrary proxy target; poll ≥60 seconds by default; 429/503/malformed responses retain last good snapshot with stale status; cross-tab use does not multiply upstream polling. |
| GT-P1-09 | Implement immutable IndexedDB snapshots, dataset/run references, quota handling and evidence-bundle import/export. | 06–08 | Restart restores data; missing/corrupt hashes reject imports; quota exhaustion is visible and offers export; secret/contact fields absent; changing a source revision invalidates only dependent results. |
| GT-P1-10 | Implement exact weather exposure and separately labelled earthquake screening; clipped road length and unique asset/community results; versioned review ordering. | 04, 06–09 | Golden spatial/temporal fixtures pass, overlaps do not double-count, invalid records are visible, determinism holds with declared tolerance, and stale worker outputs are ignored. |
| GT-P1-11 | Build the minimal four-question panel: event list, exposure table/map, scenario-unavailable state and evidence detail/export. Include keyboard navigation, labels, as-of times and no-data/error distinctions. | 03, 10 | A user can trace every finding to source and method without AI; potential shelters never show “open”; earthquake proximity never shows “damaged”; absent dependencies explicitly limit the third question. |
| GT-P1-12 | Package the local release; run integration, cold-offline, performance and security acceptance suite; publish the feasibility report and ADR updates for Phase 2. | All above | All gates below pass with recorded versions/logs; no open critical security defects; measured limits documented. Do not claim Phase 1 complete on a partial fixture demo. |

Tasks 03 and 04 are the first technical decision gates. If they fail, document the smallest host API addition or local-runtime alternative and revise the architecture before continuing feature work. Task 05 is the source-eligibility gate; a missing open dataset blocks the affected asset requirement rather than being silently replaced by synthetic production data.

Task 03 also tests the host's coarse deployment capabilities: disabling `plugins:install` must not be assumed compatible with automatic workbench activation. Verify the proposed UI restrictions and same-origin CSP with the real plugin; record any necessary installer-only upstream change before packaging.

## Phase 1 acceptance suite

These numbers are proposed release targets, not measured results. Freeze the test machine/browser versions with the results (reference: modern 4-core, 16 GB laptop, Chromium; Firefox compatibility run). Adjust a target only through a written ADR with measured evidence.

| Gate | Required evidence |
| --- | --- |
| A1 — cold local use | On a clean browser profile, launch the prebuilt local distribution with external network blocked. Open NC bundle, inspect events, run analysis and export results. No cloud, registry, font, tile, WASM or extension fetch required. Loopback requests are allowed. |
| A2 — real sources | One complete, rights-reviewed NC snapshot for each required asset class plus counties/tracts, and recorded real NWS/USGS fixtures. Report actual counts/vintage. If no current hazard exists, use clearly labelled replay; synthetic data never masquerades as current events. |
| A3 — geometry correctness | Fixtures for polygon holes, multipolygons, boundary points, invalid rings, null geometry, zone-derived geometry, line crossing/touching, overlapping warnings, missing CRS, NC border and outside-state earthquake. Exact categorical matches; metric error ≤1% or 1 meter for lengths/distances, whichever is larger, against an independently computed reference. Area tolerance ≤1% or 1 m², whichever is larger. |
| A4 — lifecycle/time | Updated and cancelled alerts, future onset, expiry, deleted/revised earthquakes, poll failure, sleep/resume and replay all preserve correct labels and provenance. Event IDs falling out of a rolling feed do not imply cancellation; scope/window and reconciliation status are recorded. |
| A5 — reproducibility | Same bundle, as-of time, rules and pinned engine reproduce finding IDs/counts and normalized metrics. Input/rule change creates a distinct analytical run. Export then import supports offline recomputation and hash verification. |
| A6 — UI and evidence | Each row links to its hazard revision, asset dataset, geometry basis, method and limitations. Empty-success, stale, unavailable, incomplete and unknown geometry are visually distinct. Keyboard-only selection/export works; severity is not conveyed by color alone. |
| A7 — performance | For the actual NC bundle and a declared benchmark of up to 100,000 asset/road features and 200 hazard geometries: startup to usable panel ≤15 s, warm analysis p95 ≤5 s across 20 runs, cancellation ≤1 s, total app/worker memory ≤1.5 GB on reference hardware. Vertex counts and dataset bytes accompany results; no silent truncation to pass. |
| A8 — load management | Proposed ingest limits: 20 MB per hazard response, 100 MB per normalized dataset file, 250 MB imported bundle, and 1,000,000 vertices per analysis batch. Reject or explicitly partition oversized inputs. Limits are revised only against real measurements; feature limits alone do not bound geometry cost. |
| A9 — security/privacy | Malicious text/link/CSV payloads, archive traversal, expansion bombs, oversized geometries and forbidden gateway destinations are rejected. Request capture shows only loopback offline and allowlisted public feeds live. No patient/resident/private contact information in exports. No remote AI calls. |
| A10 — quality/release | Tests under `tests/` accompany each ticket; new/modified modules exceed 80% coverage. Contract/E2E tests cover upstream integration, not just mocks. Dependency licenses/notices and reproducible-build inputs are archived. No ticket enters Human Review before the applicable coverage gate. |

If Python data-prep code is introduced, use `tests/test_<module_name>.py`, `monkeypatch`/`tmp_path`, and `PYTHONPATH=. pytest tests/ -v` with a >80% per-module coverage check. TypeScript modules use their native test runner and equivalent thresholds; do not pretend pytest measures JavaScript. Documentation-only Phase 0 requires no application tests because no modules were implemented or changed.

## Phase 2 MVP completion criteria

- All Phase 1 gates continue passing with the real NC bundle and both hazards.
- The four questions are represented in the UI; limitations are part of the answer, not hidden in documentation.
- At least one reviewed scenario fixture demonstrates a verified dependency path and one demonstrates a rejected/unknown dependency. Assumptions, disabled assets and conditional consequences can be exported and replayed.
- Hospital and shelter inventories retain operational status `unknown` unless a separately licensed, timestamped source supports it. Road intersections never imply closure.
- Community summaries deduplicate overlaps and preserve geography vintage. Any population context identifies its year/uncertainty and distinguishes total community population from an exposure estimate.
- PMTiles, if introduced, improves rendering without changing analytical results. AI remains disabled by default and unnecessary.
- A user can install the release, work offline from the supplied bundle, enable public-feed refresh, inspect evidence and export a reproducible run without cloud services or paid credentials.

The repository-creation portion of GT-P1-01 is complete. Its licensing, CI, test infrastructure and issue-project work remain pending. Phase 0 ends here.
