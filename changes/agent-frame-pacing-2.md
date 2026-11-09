Closes #3022

### Added

- `STEP_AHEAD_MAX_FRAME_SHARE` (`@jgengine/core/runtime/simAhead`): Frames shorter than this share of a fixed step get their next step run ahead, between frames. Also `IdleTask`, `RecordedTime`, `createIdleTask`, `createRecordedTime`, `shouldStepAhead`.
