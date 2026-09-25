# ADR 0001: One external GeoLibre plugin

Status: accepted for the Phase 1 foundation.

GeoTrust needs an existing open-source map/layer workspace, a local workflow and auditable geospatial results. The Phase 0 inspection found an MIT-licensed GeoLibre host with public plugin lifecycle, native-layer registration and DOM panel APIs. The inspected revision is recorded in upstream/geolibre.lock.json.

We implement one self-contained ESM external plugin with a root plugin.json, a default plugin export and scoped CSS. It uses getMap, registerRightPanel, openRightPanel, closeRightPanel, registerExternalNativeLayer, unregisterExternalNativeLayer and onLayersChanged. The manifest/entry identity matches, activate is synchronous, and asynchronous work is cancelled logically by generation on deactivation.

This reuses GeoLibre's MapLibre instance. Several plugins would introduce lifecycle/version coordination before the data model is stable. A separate embedding application would require another UI and iframe messaging boundary; it remains a later option, not the starting point.

The TypeScript integration boundary is a narrow structural subset of the actual public API. Contract tests check the upstream declaration snapshot's SHA-256 and consumed method names/arities. They are not proof of runtime compatibility. The map preview provides real MapLibre rendering but a simulated GeoLibre panel/layer host; it must remain visibly labelled as a development harness.

We do not import private stores or assume a host SQL API. The future DuckDB-WASM worker remains plugin-owned. Phase 1 uses a small deterministic Turf reference implementation only for fixture point screening; it is not the final NC-scale analytical engine.

Consequences: plugins are trusted code; no sandbox isolation is implied. No upstream source is modified. Package installation, lifecycle and layer synchronization in a full GeoLibre build remain an explicit Phase 2 gate. We do not claim the earlier Phase 0 roadmap's full offline GeoLibre distribution is already delivered.

Source references:

- [Public plugin guide](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/docs/plugin-api.md)
- [Pinned types](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/packages/plugins/src/types.ts)
- [Runtime API wiring](https://github.com/opengeos/GeoLibre/blob/e7db039f8eb66c98cd50091f3ee05bb8032dedb4/apps/geolibre-desktop/src/hooks/usePlugins.ts)
