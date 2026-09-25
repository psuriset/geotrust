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
