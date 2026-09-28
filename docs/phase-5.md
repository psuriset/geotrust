# Phase 5: Evidence changes, inventory review and storage controls

Phase 5 extends the worker/history workflow without changing the version 1 exposure algorithm or evidence bundle. It adds deterministic change reports, inventory capture-age review, storage budgeting and verified backup export. No AI, new hazard feed, dependency inference or failure prediction is added.

## Use

Use the existing setup: `npm ci`, `npm run data:prepare` if needed, then `npm run live`. Open `http://127.0.0.1:4174/?mode=live`. Default fixture mode remains offline. The analysis/replay worker, cancellation controls, latest-feed store and explicit saved-history database remain as documented in Phase 4.

Save or import two snapshots, select A and B, and choose **Compare saved snapshots A and B**. Both bundles are verified and replayed before comparison. Direction is explicitly A → B; a warning appears if B predates A. The report includes:

- Freshness and success/failure coverage for each feed at each snapshot's own analysis time.
- Event records that appear, disappear, change raw source content, change normalized fields, or change time/status eligibility. Ingestion timestamp alone is not treated as a source revision.
- Asset records added, removed or revised, using exact snapshot-scoped IDs. Geometry/attribute field groups are identified for revised records.
- Added/removed geographic matches and retained matches whose stored distance differs.
- Recorded factors accompanying a match change: missing/stale/failed feed coverage, absent event records, recorded expiration, excluded status, future effective time, missing geometry, source/normalized revisions, zone geometry changes, inventory revisions and changed radius parameters.

These factors can coexist. They are not a causal attribution model. A disappearing event/match is not evidence of recovery, lower risk, closure, damage or restored operations. Even a healthy empty feed can omit an event because of the source's catalog window. The report keeps that absence explicit rather than declaring a hazard ended. NWS replacement alerts with different IDs are not silently joined. Asset IDs are not matched by object ID, name or proximity across source snapshots; the sources do not guarantee those cross-revision identities.

The UI displays up to 25 event rows, 25 asset rows and 50 match rows. **Export comparison report** includes every row and the original input checksums, with its own `kind: comparison`, `schemaVersion: 1.0.0`. Retain the original evidence bundles for audit/recomputation. A comparison report is not a replayable evidence bundle. Export of the currently displayed evidence remains separate; comparing does not replace that evidence or live feeds.

## Inventory review

Each evidence view shows its inventory capture time, age at the original analysis time and age at today's review time. A **30-day local review policy** flags overdue captures. A future capture date is flagged separately. Recent capture does not establish recent observations, complete coverage or operational accuracy. Source vintage is displayed verbatim when present, otherwise Unknown; GeoTrust does not infer an observation date from descriptive text.

This is review guidance, not a provider SLA or an emergency decision threshold. It does not change, suppress, rehash or retrospectively rewrite the original analysis. Reviewing the same historical bundle on different days can change the UI age assessment while its original result/checksum remains identical. No refresh/download is triggered automatically by the warning.

## Storage and backups

The history panel shows exact saved-bundle bytes used, remaining bytes and remaining slots under the existing ten-snapshot / 256 MB local limit. Browser-origin usage/quota estimates are shown separately by **Check browser storage** because other origin data can consume storage too. **Request persistent storage** is an explicit browser request; granted, not granted, unknown and unavailable states are distinguished. Persistence may reduce eviction risk but is not a backup or a guarantee against user deletion.

**Export verified saved snapshot A** verifies/replays that saved file in the worker and downloads a portable evidence bundle. To restore it, select **Replay evidence bundle**, wait for verification, then **Save snapshot locally**. Original analysis time/checksum are preserved; a restored local copy gets a new save time. A duplicate checksum does not consume another slot. Export is per selected snapshot; no bulk archive format is introduced. Delete controls and atomic storage limits remain unchanged; no silent eviction or automatic upload occurs. Explicit backup also works when live feeds and the prepared inventory are unavailable.

## Version compatibility

Supported evidence contracts are:

| Component                         | Supported                         |
| --------------------------------- | --------------------------------- |
| Evidence envelope                 | `1.0.0`                           |
| Exposure result                   | `1.0.0`                           |
| Analysis method                   | `turf-screening-v1`               |
| Inventory / GeoEvent / normalizer | Existing strict version 1 schemas |
| Comparison report (export only)   | `1.0.0`, `kind: comparison`       |

The importer checks envelope/result/method compatibility before expensive replay, then performs the existing strict schema, checksum, raw-reference and deterministic-result checks. Unsupported older, newer or unknown versions are rejected with a clear message. There is no automatic migration: no existing incompatible format has an approved, lossless migration. Version 1 uses an identity reader that preserves the original checksum. A future migration requires a separate audited adapter, source-version fixtures and retained original evidence; relabelling a file is not migration.

`data/fixtures/bundles/v1-phase4.json` is a committed synthetic golden artifact generated from merged Phase 4 code before Phase 5 changes. Tests require both import and new version 1 creation to match it exactly. Do not regenerate the fixture merely to make a changed algorithm pass. The 69 MB real Phase 3 export remains a separate local regression artifact, not committed public data.

## Boundaries and acceptance

`packages/changes` compares already verified bundles and computes capture-age assessments. It has no network calls, UI dependencies or generated prose. `jobs/service` runs comparisons and creates complete report Blobs in the worker, returning only bounded rows to presentation. `bundles/compatibility` owns explicit version policy. `history/capacity` separates exact application budgeting from optional browser storage controls. Existing GeoLibre public APIs and trusted-plugin/CSP model are unchanged.

Acceptance requires: factual labels for simultaneous change factors; no automatic cross-snapshot asset identity inference; age assessed independently of historical results; intact version 1 checksums; unsupported-version rejection; offline verified export/delete/restore; all tests/builds/coverage gates; and actual pinned-host validation. See [validation results](phase-5-validation.md).

## Remaining limits / proposed Phase 6

Reports identify recorded differences, not causes or actual infrastructure failure. Two complete bundles are still loaded and replayed in worker memory. Review policy is fixed local guidance, and source vintage can remain unknown. Comparison exports are not signed or independently imported. Browser storage controls remain browser-dependent; exports should be retained outside that origin.

Proposed Phase 6 is a usability and resilience pass: make report filtering and navigation manageable with large real inventories, measure memory and feed/map rendering under load, and harden snapshot retention/recovery. Add GeoParquet/DuckDB-WASM only for a measured workload need. Road-length, area/population estimates and sourced dependency modelling still require separate scope and validation. Stop after Phase 5 until that work is authorized.
