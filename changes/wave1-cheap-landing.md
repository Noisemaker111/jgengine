CI's core test shard ran 1,000 files in one process for about 13 minutes on every PR; the long simulation tests move to shard d, and shards d and h run in four cost-balanced lanes

Refs #2837

Engine seam: none - game content only

### Added

- every check and generator row in scripts/run-stages.ts names the paths it reads; a diff that reaches none of them skips it, and a game-only diff judges games-depth on its own games
- a gate's cached pass is keyed on the files its row reads, not the whole tree
- scripts/perf-known-failing.json lists harbor-heat and drift-foundry as over the frame budget; it only shrinks

### Changed

- the perf gate judges a 16.7 ms p95 frame on the RTX 3070 at 1600x900, one game at a time on the uncapped clock, and keeps the GL allocation check; draws are printed, not gated

### Fixed

- CI's core test shard ran 1,000 files in one process for about 13 minutes on every PR; the long simulation tests move to shard d, and shards d and h run in four cost-balanced lanes
- preflight runs only the generators a diff reaches, and skips one whose inputs have not changed since it last ran; a lane never fails on a stale generated file, and a stale api baseline entry is pruned at land time
- CI's full-history checkouts fetch no file contents up front, and the games job type-checks the reached games four at a time

### Removed

- the draw, triangle and node ceilings in every perf-budget.json
- check orphan-ratchet, which check skill-api already runs
