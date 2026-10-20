### Added

- `player_pose` agent-bridge verb (`@jgengine/shell`, `window.__jgengineAgent`, `drive --rpc '{"method":"player_pose"}'`) returns the local player's position and heading, and `debug_snapshot` carries the same `player` field, so a drive can prove movement from position deltas instead of screenshots.
