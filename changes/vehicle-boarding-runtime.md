### Added

- Switch existing camera rigs at runtime with a serializable data overlay, and apply vehicle board/leave patches through shared helpers with explicit rider identity and caller camera policy. Seat occupancy exposes snapshot/restore/reset and an unseated-safe driven-vehicle query.

### Fixed

- Preserve hidden riders during entity hydration and provide a validated, copied velocity setter so dismounts clear stale movement without rewriting controller algorithms.
