measureLocomotion and compareLocomotion score a game character's start, stop, reversal, tightest turn, jump, landing speed and uphill speed against a real person at the same speed.

### Added

- measureLocomotion and compareLocomotion score a game character's start, stop, reversal, tightest turn, jump, landing speed and uphill speed against a real person at the same speed.
- bun run games:capabilities locomotion prints that comparison for every game with a walking player (game:entity names a player whose role is set only at spawn); --validate checks the human reference itself.
- timeToSpeed, the human sprint time from standing to a speed.
- `compareLocomotion` (`@jgengine/core/movement/reference/compareLocomotion`): Measure a game character and compare it, metric by metric, with what a real person does at its top speed. Also `HumanLocomotionReference`, `LocomotionComparisonRow`, `LocomotionMetrics`, `LocomotionProbeOptions`, `defaultHumanReference`, `formatLocomotionComparison`, `measureLocomotion`, `referenceLocomotion`.
- `timeToSpeed` (`@jgengine/core/movement/reference/humanEnvelope`): Time to sprint from rest to `speed` (capped just under top speed), s.

### Changed

- Part of #2767
