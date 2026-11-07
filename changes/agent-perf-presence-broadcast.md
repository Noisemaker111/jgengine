a ws room sends at most one presence roster per pose interval (poseRules.minIntervalMs, 100 ms by default) instead of one per accepted pose; the first move in a quiet room, a player's first pose and a leave still go out at once, and later moves and appearance changes ride the roster that closes the window

### Changed

- 128 players in one room, every player posing every 100 ms: 15 ms of host time per game second instead of 12 to 30 s on JSON (8.6 ms instead of 30 s on binary), and 25 MB/s out instead of 3.2 GB/s. The wire format is unchanged; #2990 covers binary delta rosters and interest-limited rows

### Fixed

- a ws room sends at most one presence roster per pose interval (poseRules.minIntervalMs, 100 ms by default) instead of one per accepted pose; the first move in a quiet room, a player's first pose and a leave still go out at once, and later moves and appearance changes ride the roster that closes the window
- presence, chat and voice broadcasts encode each message once per codec and send the same frame to every subscriber
