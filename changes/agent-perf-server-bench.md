bun run perf server, a repeatable load benchmark for the multiplayer host: N players in one room on the real createGameServerHost and createHostRouter, each subscribed to presence and posing every 100 ms of a fake clock that also drives the router's timers; one JSON line per room size (wall and CPU ms per game second, MB and messages out per game second, average message bytes), and a stderr note when a size cannot keep up in real time

### Added

- bun run perf server, a repeatable load benchmark for the multiplayer host: N players in one room on the real createGameServerHost and createHostRouter, each subscribed to presence and posing every 100 ms of a fake clock that also drives the router's timers; one JSON line per room size (wall and CPU ms per game second, MB and messages out per game second, average message bytes), and a stderr note when a size cannot keep up in real time
- a run measures up to 100 steps and stops early after 5 s of measuring once it has 5, sizes stop at 256 players, and --max-seconds (default 60, warmup included) is the hard cap on one run; documented in README, the verify drive reference and the multiplayer skill; not a CI gate
