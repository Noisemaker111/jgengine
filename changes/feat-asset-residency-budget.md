### Added

- Asset streaming supports a retunable `maxResidentBytes` target and deterministic oldest/largest eviction within the frame unload budget. Pinned and retained assets remain protected; byte pressure overrides idle grace and small-asset caching.
- Streaming residency diagnostics expose protected and over-budget bytes, unknown-size loads, eviction totals, and record counts. Explicit `forget(id)` removes only settled, inactive, unowned history so demand churn can bound metadata without silently invalidating record consumers.
