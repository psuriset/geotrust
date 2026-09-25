# GeoTrust — Phase 0 architecture review

Reviewed 2026-09-25. **Architecture only; no product code, dependencies, data pipelines, or deployment have been implemented.** This repository contains the GeoTrust architecture and feasibility review. Dependency locks, CI, and an implementation issue project remain Phase 1 work.

**Recommendation:** one external GeoLibre plugin, internally modular, delivered with a pinned, locally served GeoLibre web build. Use MapLibre for display and a plugin-owned DuckDB-WASM Spatial worker for deterministic analysis. A small local Node launcher serves files and fixed public-feed routes. No cloud account, paid key, PostGIS server, or AI service is required.

- [Architecture and decision record](ARCHITECTURE.md): components, data contracts, deterministic methods, evidence, restrictions, and risks.
- [GeoLibre source inspection](GEOLIBRE-AUDIT.md): exact revision, supported APIs, gaps, build process, and formats.
- [Implementation plan and acceptance criteria](IMPLEMENTATION-PLAN.md): proposed repository tree, phases, exact Phase 1 tasks, and go/no-go gates.

The inspection used GeoLibre commit `e7db039f8eb66c98cd50091f3ee05bb8032dedb4` (root package version `3.0.0`). Source was read from a temporary checkout; no upstream build or runtime compatibility test was performed. Version labels alone are insufficient: Phase 1 must test this exact revision or document a replacement.

The main feasibility limits are substantive: alerts identify threatened areas, earthquakes identify events, and asset inventories identify locations. These inputs do not establish actual outages, hospital capacity, shelter availability, or probabilities of cascading failure. GeoTrust can support exposure screening and explicit scenarios; it cannot honestly predict which facility will fail next from these sources alone.
