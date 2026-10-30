createPhaseSchedule in time/stateSchedule, phases that end by time or when the game calls advance(), with snapshot and restore

Refs #2817

### Added

- createPhaseSchedule in time/stateSchedule, phases that end by time or when the game calls advance(), with snapshot and restore
- `createPhaseSchedule` (`@jgengine/core/time/stateSchedule`): A stateful timeline of named phases, ended by their own durations or by `advance()`. Also `PhaseSchedule`, `PhaseScheduleConfig`, `PhaseScheduleState`, `PhaseSpec`, `PhaseTransition`.

### Fixed

- round state and agent work schedules run on the shared phase part; a finished match no longer reports a full timeLeft
