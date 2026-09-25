# GeoTrust contributor instructions

- Work in this repository; never modify an upstream GeoLibre checkout directly.
- Read docs/phase-1.md for current scope; live hazard feeds are not implemented in Phase 1.
- Use the public API boundary in packages/presentation/src/geolibre-api.ts and pinned upstream contract.
- Keep acquisition, normalization, presentation, analysis, provenance and dependency modelling separate.
- Every implementation change needs tests under tests/. New/modified executable modules must exceed 80% coverage before review.
- Run npm run check before handoff. Never weaken coverage thresholds to pass.
- All environments use fixtures until a later live-feed task is explicitly authorized.
- Never commit credentials; VITE_* settings are public. Render untrusted content as text.
- Label synthetic data, unknown geometry and unavailable analyses explicitly.
