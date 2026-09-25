# Phase 2: GeoEvent and live feeds

This increment implements the user's live-feed Phase 2 scope. It supersedes the earlier proposed Phase 2 sequence, which started with full-host certification and asset acquisition. Neither of those separate gates is claimed complete here. No AI content or source-text inference is used.

## Run locally

```sh
npm ci
npm run check
npm run live
```

Open `http://127.0.0.1:4174/?mode=live`. The Node gateway serves the built preview and two fixed feed routes on one loopback origin. Default `npm run dev` and the default plugin build remain offline fixtures. The explicit `mode=live` query selects the live preview. No keys or cloud accounts are required; obtaining new events requires internet access.

For the external GeoLibre plugin, build with `GEOTRUST_MODE=live npm run build`, install `dist/geotrust-plugin.zip`, and serve a compatible GeoLibre web build through the same gateway using `GEOTRUST_WEB_ROOT=/absolute/path/to/geolibre/dist node scripts/live.mjs`. This is an operator-controlled local static root, never a request parameter. Full GeoLibre runtime certification remains outstanding. Fixture/live builds share a plugin identity and must not be installed simultaneously. Build output is overwritten when switching modes.

## Contract and meanings

The authoritative Zod contract is `packages/geoevent/src/schema.ts`; the portable draft-2020-12 JSON Schema is `schemas/geoevent-v1.schema.json`. `node scripts/export-contract.mjs` regenerates it and the synthetic samples. Tests detect drift. Runtime geometry checks additionally enforce closed rings; JSON Schema cannot express that equality constraint.

GeoEvent version **1.0.0** requires ID, type, title, nullable description/geometry, observation/ingestion/source-update times, source identity and HTTPS URL, source-event ID, publisher reliability, freshness, spatial uncertainty, confidence band, confirmation status, nullable expiration, provenance and raw-payload reference. Unknown contract fields are rejected. Source documents may contain additional provider fields; they are retained in raw payloads rather than silently promoted into the contract.

- IDs are source-qualified stable provider IDs. SHA-256 of canonical feature JSON identifies content revisions; the full canonical payload hash plus feature index resolves raw evidence in the stored snapshot.
- `authoritative-publisher` describes NOAA/NWS or USGS publishing authority, not certainty of a particular forecast or damage assessment.
- `confidenceBand: unknown` is deliberate. CAP certainty stays in `sourceFacts.certainty`; USGS `reviewed`/`automatic` remains confirmation status. No fabricated numeric probability or text interpretation.
- Weather observation time means CAP `sent` (issuance), not an observed impact time. Expiration comes from `expires`; effective/onset/ends and references remain distinct source fields.
- Null NWS polygons stay null; affected zones are retained without fetching or guessing geometry.
- USGS coordinates become a 2D epicenter and explicit `depthKm`. Magnitude may be null. Earthquakes have no manufactured expiration; disappearance from the weekly feed does not mean the event was disproved or effects ended.
- Geometry location error remains unknown in these summary feeds. A warning polygon is a coverage region, not a positional error estimate.

## Ingestion and state

The gateway's only upstream destinations are the [NWS NC active-alert query](https://www.weather.gov/documentation/services-web-api) and the [USGS global weekly GeoJSON summary](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php). The NWS query uses `/alerts?active=true&area=NC` to avoid the active-endpoint redirect. USGS remains global to retain nearby out-of-state events; NC asset proximity filtering is separate future analysis.

`GET /api/feeds/nws` and `/api/feeds/usgs` return `{ payload, retrievedAt }`. `GeoEventAdapter.refresh(source)` strictly validates and supplies normalized `FeedSnapshot` objects to the GeoLibre integration. The live plugin lists event/status records and maps only fresh, non-test/non-cancelled records with geometry. It does not combine synthetic asset fixtures with live hazards.

Requests identify GeoTrust with a User-Agent. The gateway rejects redirects, arbitrary destinations, cross-origin/Host-mismatched requests and non-GET methods. It limits bodies to 16 MB, times out each attempt after 10 seconds, retries transient errors at most twice with exponential delay, honors Retry-After, and enforces at least 60 seconds between upstream checks. Long Retry-After values become gateway cooldowns rather than blocking sleeps. Cache-Control max-age can extend the cache; cached responses retain their original retrieval time. Concurrent callers share requests. The browser adapter has a 40-second gateway timeout; plugin polling runs only while active.

Feed states are separate from event counts:

| Status     | Meaning                                                                           |
| ---------- | --------------------------------------------------------------------------------- |
| `ok`       | Fully validated nonempty snapshot                                                 |
| `empty`    | Fully validated successful empty snapshot                                         |
| `degraded` | Latest request/validation failed; retain last successful snapshot, possibly empty |
| `failed`   | No successful snapshot exists                                                     |

Feed freshness is `fresh`, `stale` after five minutes, or `unavailable` after thirty minutes. It uses gateway retrieval time and, for USGS, the earlier feed-generation timestamp. Individual old earthquakes can remain fresh catalog evidence when successfully rechecked. Explicit weather expiration overrides event freshness. Empty feeds also carry freshness, so a cached empty snapshot is not portrayed as current indefinitely. These thresholds are product policies, not provider guarantees. UI freshness updates on polling, not while a browser is suspended.

Duplicate identical features collapse; newer revisions win. Same-ID/equal-timestamp conflicting content is quarantined, and older revisions across refreshes are rejected. Any malformed/conflicting feature, incomplete paginated response or regressed revision fails the incoming snapshot atomically. Last-good data remains visible with the failure. CAP cross-ID references are retained but no full CAP lifecycle graph is inferred.

## Persistence and boundaries

IndexedDB database `geotrust-evidence-v1` stores the latest snapshot and its referenced raw payload together in one transaction per source. An outage preserves that evidence. Successful empty snapshots replace prior current events. This deliberately bounded two-feed store is **not a historical revision archive**; old successful snapshots are replaced. Quota, corruption and blocked-upgrade failures surface as storage errors without silently switching to ephemeral memory. `IndexedEvidenceStore.clear()` provides a local data reset API. Browser profile deletion/eviction can remove evidence; storage is unencrypted. Full archive export/import and historical retention remain future work.

Module dependencies: `geoevent → domain/provenance`; `feeds → geoevent/storage`; `storage → geoevent`; `gateway → feeds/geoevent`; `plugin → adapter/presentation`. The gateway owns network policy, the normalizer owns semantics, IndexedDB owns persistence, and the plugin owns presentation/lifecycle. Existing deterministic asset analysis remains fixture-only.

No credentials, AI, cloud upload, basemap traffic, location tracking or private asset/person data were introduced. Government source attribution and [NWS terms](https://www.weather.gov/disclaimer) / [USGS rights](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) remain separate from the MIT software license.

## Validation and limits

See `phase-2-validation.md` for executed checks. Synthetic normalized examples are in `docs/samples/nws-geoevents.json` and `docs/samples/usgs-geoevents.json`; they are not current conditions.

Remaining limits: full GeoLibre runtime certification; zone polygon resolution; complete CAP reference reconciliation; provider pagination traversal (currently fails safely); durable historical archive/export; NC asset acquisition and exposure analysis; Firefox/Tauri and NC-scale performance certification. The local gateway must stay running for acquisition. This is an inspection tool, not an unattended alerting service.
