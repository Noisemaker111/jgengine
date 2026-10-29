fairChance (random/fairChance) deals chance rolls like a shuffled deck: the odds hold over any stretch and a 50% roll never runs more than four the same way

Root cause: the turf test checked one fixed roll sequence (every run shared the same luck), which happened to be a 15-hit streak and hid that the Carmines never pushed back in real play

Engine seam: packages/core/src/random/fairChance.ts, packages/core/src/random/seedSweep.ts, packages/core/src/worldModel/worldModel.ts

### Added

- fairChance (random/fairChance) deals chance rolls like a shuffled deck: the odds hold over any stretch and a 50% roll never runs more than four the same way
- acrossSeeds (random/seedSweep) runs a scenario under many seeds and returns the share it held for, so tests check odds instead of one lucky run; longestStreak reports streaks
- world models take a seed, saved with the world; schedule chances are dealt by fairChance from it
- `fairChance` (`@jgengine/core/random/fairChance`): Whether roll `index` of the chance named `key` succeeds, dealt from shuffled bags like a deck of cards: over any stretch of rolls the share that succeed stays at `chance`, so a 70% roll can't miss nine times running or a 30% one hit nine times running. Also `FairChanceOptions`, `longestStreak`.
- `acrossSeeds` (`@jgengine/core/random/seedSweep`): Run a seeded scenario once per seed (`sweep:0`, `sweep:1`, …) and report the share it held for. Also `SeedSweep`.

### Fixed

- Harbor Heat's Carmines calmed down 40 s after losing a block, before their first push at 83 s, so they never pushed back. Losing a block now angers them for about 7 minutes, they push every 60 s for 25 hold, and an undefended block falls back to them in 4-5 minutes in 93 of 100 runs
- Harbor Heat's 'drop them or lose the block' now holds: each crew member dropped on your block gives back 10 hold, so beating a push's 3-man crew undoes it
