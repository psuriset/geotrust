# Phase 2 validation results

Executed locally on 2026-09-25. Final complete pipeline used Node 22 and macOS Google Chrome through Playwright. GitHub Actions and the full upstream GeoLibre runtime are not claimed tested.

## Commands and results

| Command                                                      | Result                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `npm install --save-dev --save-exact fake-indexeddb`         | Lockfile updated; zero known audit vulnerabilities reported at installation |
| `node scripts/export-contract.mjs`                           | Generated versioned JSON Schema and synthetic normalized samples            |
| `npm run format`                                             | Formatted source, schema, samples and docs                                  |
| `npm run typecheck`, `npm run lint`, `npm run test:coverage` | Passed during development and in final pipeline                             |
| `GEOTRUST_MODE=live npm run build`                           | Live plugin, demo and Node gateway built                                    |
| `npm run test:package` after live build                      | Live self-contained ESM/ZIP passed                                          |
| `npm exec --yes --package=node@22 -- npm run check`          | Complete final pipeline passed, exit code 0                                 |
| `node scripts/smoke-feeds.mjs`                               | Both actual public feeds fetched and normalized successfully                |
| `git diff --check`                                           | Passed                                                                      |

The complete pipeline ran **44 unit/contract tests in 8 files**, **1 release-package test**, and **2 browser tests**. Formatting, lint and strict TypeScript checks passed. Default offline and explicit live plugin builds were both validated.

Coverage across executable application packages: **99.33% statements, 97.56% branches, 99.08% functions, 99.81% lines**. Every instrumented file exceeded the 80% requirement (81% configured minimum); no thresholds were lowered. The existing exclusions for type-only declarations and the bundled entry remain; package tests execute the actual compiled entry.

Coverage includes malformed input, stable-ID/content deduplication, conflicting/regressed revisions, stale and expired evidence, nullable geometry/magnitude, source review status, raw references, timeout, retry/backoff, HTTP 429/503, long Retry-After, streaming byte limits, concurrent request sharing, gateway Host/Origin/path controls, successful empty feeds, unavailable/degraded feeds, persistence across reloads, database corruption/blocked/abort/quota errors, and plugin cleanup. Browser tests mock feed responses; they do not depend on upstream uptime.

## Read-only live smoke

The separate upstream smoke returned:

- NWS North Carolina active alerts: **16 normalized events**, zero validation issues, zero duplicates.
- USGS global weekly summary: **2,191 normalized events**, zero validation issues, zero duplicates; provider generation time `2026-09-25T15:39:34.000Z`.

These are point-in-time connectivity/schema observations, not current hazard claims or proof of future availability. Live payloads were not committed. Checked-in example events are explicitly synthetic fixtures.

## Remaining limitations

The production preview still emits Vite's non-fatal bundle-size advisory (main JavaScript approximately 1.14 MB; worker approximately 510 KB). Test output includes a harmless terminal color-environment warning. Full-host certification, other browsers/Tauri, automated history retention/export and NC asset analysis remain outside this Phase 2 increment. IndexedDB validation checks record structure; content hashes identify evidence but are not an authenticity guarantee or encryption.

Generated artifacts are ignored by Git. `dist/geotrust-plugin.zip` is the default fixture package after the final pipeline; `dist/geotrust-live-plugin.zip` is a saved copy of the separately validated live build. Regenerate the live ZIP with `GEOTRUST_MODE=live npm run build`. The `dist/gateway/server.mjs` bundle supports `node scripts/live.mjs` after building.
