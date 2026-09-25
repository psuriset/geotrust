# GeoTrust contributor instructions

- Work in this repository; never modify an upstream GeoLibre checkout directly.
- Read docs/phase-4.md for worker/history scope and docs/phase-3.md for NC exposure; docs/phase-2.md governs live feeds. Earlier phase documents are historical.
- Use the public API boundary in packages/presentation/src/geolibre-api.ts and pinned upstream contract.
- Keep acquisition, normalization, presentation, analysis, provenance and dependency modelling separate.
- Every implementation change needs tests under tests/. New/modified executable modules must exceed 80% coverage before review.
- Run npm run check before handoff. Never weaken coverage thresholds to pass.
- Fixtures remain the default. Live acquisition requires explicit mode selection and the fixed-route local gateway.
- Never commit credentials; VITE_* settings are public. Render untrusted content as text.
- Label synthetic data, unknown geometry and unavailable analyses explicitly.
