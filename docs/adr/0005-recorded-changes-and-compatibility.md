# ADR 0005: Recorded change factors and identity-preserving compatibility

Status: accepted for Phase 5.

A changed event–asset match can reflect feed failure, catalog omission, expiry, source revision, different zone geometry, inventory replacement or parameters. Report all applicable recorded factors rather than assign an inferred physical cause. Compare events by their normalized stable source IDs and assets by exact snapshot-scoped IDs. Do not match mutable provider object IDs, names or nearby points across inventory revisions. Reject ambiguous duplicate identities in comparison.

Keep deterministic comparison in the plugin-owned worker and export all rows in a report with input bundle checksums. Return bounded details to the UI. Reports are separate from replayable evidence; preserve the existing version 1 bundle and `turf-screening-v1` results. Inventory review age is supplemental UI context with an explicit 30-day local policy; it does not rewrite historical evidence or invent source observation dates.

Support the existing version 1 format through an identity reader. Explicitly reject unknown envelope/result/method versions rather than silently change them. There is no justified incompatible-format migration today. Future migrations require auditable adapters and golden source-version fixtures while retaining the original bytes. The committed Phase 4 synthetic golden bundle and retained Phase 3 real export anchor compatibility.

Expose exact saved-bundle budget separately from approximate browser-origin quota. Keep explicit per-snapshot export/restore, checksum deduplication and atomic capacity rejection. Browser persistence is optional and user-triggered; refusal or missing APIs is not hidden. No cloud backup, bulk archive, database schema migration or new runtime dependency is needed.
