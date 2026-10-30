ARK's obelisk boss arena (bossArena/) and ai/director/boss; added summonedEncounter, a general fight started by paying a cost at a place, and ai/phaseLadder, boss phases as cut points over a health fraction

Refs #2817

Engine seam: packages/core/src/ai/director/boss.ts, packages/core/src/ai/phaseLadder.ts, packages/core/src/bossArena/bossArena.ts, packages/core/src/summonedEncounter/summonedEncounter.ts, packages/core/src/world/worldSolids.ts

### Migrate

- bossArena and ai/director/boss exports are gone; use createSummonedEncounter and the phaseLadder exports; maxCompanionWeight is gone, so filter candidates in your own gather()

### Added

- ringWallSolids in world/worldSolids, a ring wall that follows the ground
- `advancePhase` (`@jgengine/core/ai/phaseLadder`): Advance the phase clock by `dt` at a fraction of the ladder's value and return the phase in effect. Also `PhaseClockState`, `PhaseLike`, `PhaseStep`, `PhaseTell`, `createPhaseClock`.
- `createSummonedEncounter` (`@jgengine/core/summonedEncounter/summonedEncounter`): A fight a game starts by meeting a requirement at a place: the summoner pays a tier's cost and its extra condition, a portal counts down, then takes every candidate in range up to each kind's cap, each remembered where they stood. Also `CostSource`, `RefusedCandidate`, `SummonCandidate`, `SummonCheck`, `SummonResult`, `SummonReturn`, `SummonTier`, `SummonedEncounter` and 5 more.
- `ringWallSolids` (`@jgengine/core/world/worldSolids`): A closed ring wall: `sides` solid slabs round a circular floor, each standing on the lowest ground under it so no gap opens on a slope. Also `RingWallOptions`.

### Fixed

- Fernwild, Scrap Signal and Beacon Bastion own their boss costs, caps, clocks and phase numbers; old Fernwild boss saves start fresh (save key fernwild.brood)

### Removed

- ARK's obelisk boss arena (bossArena/) and ai/director/boss; added summonedEncounter, a general fight started by paying a cost at a place, and ai/phaseLadder, boss phases as cut points over a health fraction
- `@jgengine/core/ai/director/boss` no longer exports `BossBehaviour`, `BossPhase`, `BossState`, `BossStep`, `BossTell`, `advanceBoss`, `bossPhase`, `createBossState`.
- `@jgengine/core/bossArena/bossArena` no longer exports `ArenaCandidate`, `ArenaReturn`, `ArenaWallOptions`, `BossArena`, `BossArenaEvent`, `BossArenaHooks`, `BossArenaOptions`, `BossArenaPhase` and 6 more.
