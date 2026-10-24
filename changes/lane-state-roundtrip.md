### Added

- `createDownedState` (`@jgengine/core/combat/downed`) exposes `restore(next)`, the counterpart to `snapshot()`, so a saved bleed-out resumes with the same remaining seconds, revive progress, phase and banner timer instead of being rebuilt around a guessed countdown.

### Fixed

- `check-stateful-ratchet` names the round-trip gap separately and caps it: a `snapshot()` with no `restore()`/`reset()` fails as `round-trip` debt, `--write` refuses to raise that ceiling, and a group paid below its ceiling must lower it. `createDownedState` was baselined when the ratchet shipped and never revisited; it is off the baseline, which is now 99 entries with a round-trip ceiling of 8.
