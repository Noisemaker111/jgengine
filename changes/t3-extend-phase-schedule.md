createPhaseSchedule in time/stateSchedule, phases that end by time or when the game calls advance(), with snapshot and restore

Refs #2817

### Added

- createPhaseSchedule in time/stateSchedule, phases that end by time or when the game calls advance(), with snapshot and restore
- createPhaseSchedule jumps to a named phase, retunes a phase in play, follows a per-phase next and can drop overshoot
- ride cycles and breakdowns run on the shared phase schedule; saves keep their shape
- daily routines resolve their holds and walks through the shared state schedule
- `createPhaseSchedule` (`@jgengine/core/time/stateSchedule`): A stateful timeline of named phases, ended by their own durations or by `advance()`. Also `PhaseSchedule`, `PhaseScheduleConfig`, `PhaseScheduleState`, `PhaseSpec`, `PhaseTransition`.

### Fixed

- round state and agent work schedules run on the shared phase part; a finished match no longer reports a full timeLeft
