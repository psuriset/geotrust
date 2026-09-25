# Synthetic fixtures

All three JSON files are authored GeoTrust test data under the repository's MIT license. They contain fictional locations and events near central North Carolina. No actual hospital, shelter availability, road closure or current hazard is represented.

- nws.json follows a small explicit subset of the NWS GeoJSON shape.
- usgs.json follows a small explicit subset of USGS GeoJSON; its third coordinate is depth in kilometers, removed from display geometry during normalization.
- assets.json includes fictional hospitals, potential shelters and major roads.

The fixed analysis time is 2026-09-25T12:00:00Z. Never replace it with the wall clock silently. Keep the visible synthetic/replay label when sharing results. These fixtures are compiled into both demo and plugin; runtime data requests are unnecessary.
