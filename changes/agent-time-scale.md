### Added

- `sim_advance` agent-bridge verb (`@jgengine/shell`, `drive --rpc '{"method":"sim_advance","seconds":30}'`) steps the mounted sim driver — input, movement, `onTick`, behaviors, bound actions — in 0.05 s frames without rendering, so a headless drive can reach waves, shifts and timers that never arrive at software-rendered frame rates. Capped at 120 s per call.
- `time_scale` agent-bridge verb sets the game clock's timescale and reports `{ timescale, now }`.
