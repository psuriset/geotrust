# Module boundaries

| Module        | Owns                                                                               | Allowed dependencies       |
| ------------- | ---------------------------------------------------------------------------------- | -------------------------- |
| domain        | Data contracts and bounded geometry schemas                                        | Zod / GeoJSON types        |
| config        | Strict public profile validation                                                   | Zod, checked-in profiles   |
| ingestion     | Obtaining immutable fixture payloads and byte limits                               | domain, bundled JSON       |
| normalization | Source-shape validation, IDs, units, event revisions and rejected-record reporting | domain, Zod                |
| analysis      | Deterministic point/polygon screening and epicentral distances                     | domain, Turf               |
| provenance    | Canonical JSON, SHA-256 input/run identities, evidence labels                      | domain, Web Crypto         |
| dependencies  | Explicit evidence-backed edge schema; unavailable scenario status                  | domain, Zod                |
| presentation  | MapLibre native layers, safe DOM, GeoLibre public API boundary                     | domain, MapLibre types     |
| plugin        | Composition and lifecycle ownership                                                | All modules                |
| apps/demo     | Local MapLibre development harness                                                 | Plugin and public boundary |

ESLint restricts cross-domain imports so acquisition cannot call map or analysis modules. No module imports a GeoLibre internal store or a backend. All parsing happens before presentation. Presentation uses textContent, never feed-authored HTML.

The fixture adapter does not implement fetch, polling, API keys or a URL proxy. A future live adapter must be a separate implementation with bounded inputs, rights review and explicit configuration. Do not add network calls to the normalization or analysis modules.

Analysis returns exposure, proximity or unknown plus machine-readable source identities and limitations. Roads are rendered but their intersection/length analysis is deliberately unavailable. There is no claim about closure, capacity, outages, population exposure or predicted failure.

Evidence export contains the input hashes, result, parameters and validation issues; it is not a full data archive/import system yet. Reproduce it using this version's bundled fixture files. Dependency edges require a source and date; the foundation has no propagation engine and never invents edges from proximity.

## Phase 3 extension

The earlier table describes the fixture foundation. Live normalization is in `geoevent`; `feeds` transports and coordinates it with `storage` (IndexedDB). `gateway` exposes only fixed same-origin feed and validated NWS zone routes.

`assets` validates inventories and acquires fixed official layers. `zones` resolves and preserves source geometry independently of event normalization. Neither module imports presentation. `exposure` consumes validated inventory, snapshots and resolved zones, producing deterministic point/road/county findings without network calls. `bundles` packages those inputs and checks hashes/replay. `presentation` renders counts/details and export/import controls; `plugin` owns lifecycle and refresh. ESLint enforces these dependencies.

The Phase 3 live panel supersedes the fixture-only limitations above for boolean road/county intersections and portable evidence replay. Lengths, areas, population and dependency propagation remain unavailable. No GeoLibre internal SQL/store API is assumed. See ADR 0003 for the reference engine's performance limitation.
