bun run perf server, a repeatable load benchmark for the multiplayer host: N players in one room on the real createGameServerHost and createHostRouter, each subscribed to presence and posing every 100 ms of fake clock; one JSON line per room size (wall and CPU ms per game second, MB and messages out per game second, average message bytes), and a stderr note when a size cannot keep up in real time

Engine seam: none - game content only

### Added

- bun run perf server, a repeatable load benchmark for the multiplayer host: N players in one room on the real createGameServerHost and createHostRouter, each subscribed to presence and posing every 100 ms of fake clock; one JSON line per room size (wall and CPU ms per game second, MB and messages out per game second, average message bytes), and a stderr note when a size cannot keep up in real time

### Changed

- big rooms measure fewer steps (100 up to 32 players, shrinking with N^3, at least 5), sizes stop at 256 players, and --max-seconds (default 60) ends one run early; documented in README, the verify drive reference and the multiplayer skill; not a CI gate
