# Phase 1 validation

Validated on 2026-09-25 on macOS using Node 22.23.3 and local Google Chrome through Playwright. This records local execution; GitHub Actions and a full GeoLibre host were not run as part of this validation.

## Commands executed

- `npm install`: established exact dependencies and lockfile.
- `npm exec --yes --package=node@22 -- npm ci`: clean lockfile installation, 205 packages; npm reported zero known vulnerabilities at installation time.
- `npm run format`, `npm run typecheck`, `npm run lint`, `npm run test:coverage`, `npm run build`, `npm run test:package`, `npm run test:e2e`: individual development checks.
- `npm exec --yes --package=node@22 -- npm run check`: final complete pipeline, exit code 0. The wrapper selected Node 22 because the system default was Node 25.
- `git diff --check`: whitespace validation.

`check` executes formatting, lint, coverage, TypeScript/build, package validation and browser testing in that order. No live hazard services were queried by the application or tests.

## Results

| Check                                  | Result               |
| -------------------------------------- | -------------------- |
| Prettier                               | Pass                 |
| ESLint, including module import rules  | Pass, zero warnings  |
| Strict TypeScript                      | Pass                 |
| Unit and pinned API-contract tests     | 28 passed in 5 files |
| Built ESM and installation ZIP test    | 1 passed             |
| Offline browser test                   | 1 passed             |
| Plugin and local demo builds           | Pass                 |
| License aggregation and CycloneDX SBOM | Generated            |

Coverage of executable application packages: statements **99.67%**, branches **97.85%**, functions **100%**, lines **100%**. Each covered file passes an 81% gate for all four metrics. Type-only contracts and the tiny bundled entry are excluded from coverage; package tests exercise the compiled entry. The demo and build scripts have browser/package validation rather than instrumented unit coverage.

The browser test blocks external requests, checks rendered map features and console errors, exports and inspects evidence JSON, and exercises deactivate/reactivate. The final screenshot was visually inspected: the hazard polygon, road and point features are visible. This check caught a missing MapLibre worker during development; the worker is now an explicit local Vite bundle. CSP was not relaxed to accommodate it.

## Artifacts and remaining gates

Build output (ignored by Git): `dist/geotrust-plugin.zip`, `dist/geolibre-plugin/`, `dist/demo/`, `dist/plugin-metafile.json`, and `dist/sbom.cdx.json`. Coverage and browser artifacts are in `coverage/` and `test-results/`; CI is configured to upload them.

The preview main JavaScript is approximately 1.13 MB before compression and its worker 510 KB. Vite emits a non-fatal chunk-size advisory. This is not the size of the external GeoLibre plugin, which reuses the host map. Test output also includes a harmless terminal color-environment warning.

The pinned GeoLibre API snapshot is checked by SHA-256 and inspected for the names/arity of consumed methods. That does not prove every runtime behavior or full structural type compatibility with all upstream imports. Full installation into the pinned GeoLibre runtime, Firefox/Tauri testing and NC-scale performance remain explicit Phase 2 gates. Fixtures are synthetic; there is no real inventory, live-feed implementation or operational certification.
