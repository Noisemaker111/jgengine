the frame gate (bun run perf gate), CI's perf matrix and perf network --all measure every game under games/ with a web entry, read from disk, instead of a hand-kept list of 8 that left Fernwild unjudged; a new game is measured the day it lands

### Fixed

- the frame gate (bun run perf gate), CI's perf matrix and perf network --all measure every game under games/ with a web entry, read from disk, instead of a hand-kept list of 8 that left Fernwild unjudged; a new game is measured the day it lands
- the capture test that checks --reuse-storage refuses without a warm browser allows 30 s per start instead of 5; the script loads much of the engine first, which ran past 5 s on a cold CI runner and failed an unrelated PR

### Removed

- PERF_GATE_GAMES and perf-network's ALL_GAMES; FRAME_GAMES in scripts/ci-scope.ts is the one list
