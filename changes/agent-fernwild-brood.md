Fernwild: the Broodmother boss. Pay the Green Obelisk's tribute (artifacts, plus Argentavis, Sarco, sauropod and Titanoboa trophies for Beta and Alpha) and a portal takes you and your tames to her walled lair, where she spits web and acid and calls Araneo as she weakens; a win pays Element, a Spider Flag and her trophy and sends you home, a wipe loses the tames left inside. New engine feature bossArena: tribute and level gates, the portal with survivor and companion caps, win, wipe and return, plus a ring-wall helper.

Engine seam: packages/core/src/bossArena/bossArena.ts

### Added

- `arenaWall` (`@jgengine/core/bossArena/bossArena`): The ring wall that keeps a fight in its arena: `sides` solid slabs round the floor, each standing on the lowest ground under it so no gap opens on a slope. Also `ArenaCandidate`, `ArenaReturn`, `ArenaWallOptions`, `BossArena`, `BossArenaEvent`, `BossArenaHooks`, `BossArenaOptions`, `BossArenaPhase` and 5 more.

### Changed

- Fernwild: the Broodmother boss. Pay the Green Obelisk's tribute (artifacts, plus Argentavis, Sarco, sauropod and Titanoboa trophies for Beta and Alpha) and a portal takes you and your tames to her walled lair, where she spits web and acid and calls Araneo as she weakens; a win pays Element, a Spider Flag and her trophy and sends you home, a wipe loses the tames left inside. New engine feature bossArena: tribute and level gates, the portal with survivor and companion caps, win, wipe and return, plus a ring-wall helper.

### Fixed

- lane:close no longer lists every export of a large skill as new and fails to commit; git output over 1 MiB was being cut off.
