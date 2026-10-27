# fernwild plan

Brief: ARK: Survival Evolved 1:1

## Features

<!-- Every feature the brief implies, one per line, a few words each (the words before ` — ` are looked up). Then run `jgengine plan` again. -->

- island terrain — The Island surveyed 1:1: coast, peaks, ridges, rivers, biomes, obelisks, caves
- creature spawns — ARK's spawn zones, species and weights per biome
- survival stats — food, water, stamina, oxygen, temperature, weight
- harvesting — trees, bushes, rocks by tool, ARK's yields
- crafting — engrams, recipes, a crafting queue
- progression — ARK's XP table, stat points, engram points
- taming — knock-out taming, torpor, narcotics, taming effectiveness
- riding — saddles, mounted steering and attacks
- base building — thatch, wood and stone tiers with snap sockets
- death — a body and beam to recover your items
- cave — artifact caves with pedestals
- weather — biome climate, day and night, rain, snow, storms
- airdrop — supply drops: coloured crates by place and level
- breeding — mating, eggs, incubation, imprinting, mutations
- boss fight — the Broodmother summoned at an obelisk with artifacts, an arena, Araneo minions, rewards
- metal tier — metal tools and structures, smithy, forge
- cooking — cooking pot, kibble for taming
- explorer notes — notes across the island and the experience they give
- more bosses — Megapithecus and the Dragon, the Overseer in the Tek cave

## Engine coverage

<!-- written by `jgengine plan` from the Features list; edit the list, then run it again -->

| Feature | Engine | Verdict |
| --- | --- | --- |
| island terrain — The Island surveyed 1:1: coast, peaks, ridges, rivers, biomes, obelisks, caves | `terrain-coast` · `import { withCoast } from "@jgengine/core/terrain/terrain"` | covered |
| creature spawns — ARK's spawn zones, species and weights per biome | `spawn-instance-restore` · `import { restoreSpawnInstance } from "@jgengine/core/stats/spawnLevelStats"`<br>`spawn-instance-snapshot` · `import { snapshotSpawnInstance } from "@jgengine/core/stats/spawnLevelStats"` | covered |
| survival stats — food, water, stamina, oxygen, temperature, weight | `decay-meter` · `import { decayMeterMoodles } from "@jgengine/core/gameplay"` | covered |
| harvesting — trees, bushes, rocks by tool, ARK's yields | `scatter-harvest` · `import { createScatterHarvest } from "@jgengine/core/harvest/scatterHarvest"`<br>`resource-node` · `import { createResourceNodeField } from "@jgengine/core/world/resourceNode"` | covered |
| crafting — engrams, recipes, a crafting queue | `recipe-catalog-validation` · `import { validateRecipeCatalog } from "@jgengine/core/crafting/recipeCatalog"` | covered |
| progression — ARK's XP table, stat points, engram points | `content-progression-validation` · `import { validateContentProgression } from "@jgengine/core/game/contentValidation"`<br>`progression-curve` · `import { evalCurve } from "@jgengine/core/gameplay"` | covered |
| taming — knock-out taming, torpor, narcotics, taming effectiveness | `knockout-taming` · `import { KnockoutTaming } from "@jgengine/core/taming/knockoutTaming"`<br>`creature-breeding` · `import { breedOffspring } from "@jgengine/core/game/breeding"` | covered |
| riding — saddles, mounted steering and attacks | `riding` · `import { Riding } from "@jgengine/core/scene/riding"`<br>`ride-choice` · `import { createRideChooser } from "@jgengine/core/gameplay"` | covered |
| base building — thatch, wood and stone tiers with snap sockets | `base-building` · `import { createBaseBuilding } from "@jgengine/core/basebuilding/baseBuilding"`<br>`base-structures-draw` · `import { BaseStructures } from "@jgengine/core/basebuilding/BaseStructures.draw"` | covered |
| death — a body and beam to recover your items | `death-system` · `import { createDeathSystem } from "@jgengine/core/combat"`<br>`on-death-drops` · `import { OnDeathSpec } from "@jgengine/core/combat"` | covered |
| cave — artifact caves with pedestals | `cave-draw` · `import { Cave } from "@jgengine/core/cave/Cave.draw"`<br>`cave-layout` · `import { caveLayout } from "@jgengine/core/cave/caveLayout"` | covered |
| weather — biome climate, day and night, rain, snow, storms | `authored-weather` · `import { createAuthoredWeather } from "@jgengine/core/weather/authoredWeather"`<br>`authored-weather-rendering` · `import { AuthoredWeatherLayer } from "@jgengine/core/weather/AuthoredWeatherLayer.draw"` | covered |
| airdrop — supply drops: coloured crates by place and level | `airdrops` · `import { createAirdropField } from "@jgengine/core/airdrop/airdrop"` | covered |
| breeding — mating, eggs, incubation, imprinting, mutations | `breeding` · `import { createBreedingField } from "@jgengine/core/breeding/breeding"`<br>`creature-breeding` · `import { breedOffspring } from "@jgengine/core/game/breeding"` | covered |
| boss fight — the Broodmother summoned at an obelisk with artifacts, an arena, Araneo minions, rewards | `boss-arena` · `import { createBossArena } from "@jgengine/core/bossArena/bossArena"` | covered |
| metal tier — metal tools and structures, smithy, forge | `mood` · `import { createMoodReader } from "@jgengine/core/agents/mood"`<br>`resolve` · `import { tierAt } from "@jgengine/core/gameplay"` | partial |
| cooking — cooking pot, kibble for taming | `scripts/` | partial |
| explorer notes — notes across the island and the experience they give | `editor-material-controls` · `import { materialAuthoringNotes } from "@jgengine/editor/materialControls"`<br>`damage-type-unknown` · `import { UnknownDamageTypeError } from "@jgengine/core/combat"` | partial |
| more bosses — Megapithecus and the Dragon, the Overseer in the Tek cave | `boss-arena` · `import { createBossArena } from "@jgengine/core/bossArena/bossArena"`<br>`boss-phase-state` · `import { createBossState } from "@jgengine/core/ai/director/boss"` | partial |

## Gaps

<!-- written by `jgengine plan` from the Features list; edit the list, then run it again -->

- metal tier — metal tools and structures, smithy, forge: only part ships (mood); extend that owner or confirm it covers the feature.
- cooking — cooking pot, kibble for taming: only part ships (scripts/); extend that owner or confirm it covers the feature.
- explorer notes — notes across the island and the experience they give: only part ships (editor-material-controls); extend that owner or confirm it covers the feature.
- more bosses — Megapithecus and the Dragon, the Overseer in the Tek cave: only part ships (boss-arena); extend that owner or confirm it covers the feature.

## Milestones

One PR each, in order; the gaps go first that later milestones need. Tick a milestone in the PR that lands it.

- [x] 1. The Island 1:1, spawns, survival, harvesting, crafting, progression (earlier PRs)
- [x] 2. Taming, riding, building, death, caves (earlier PRs)
- [x] 3. A model for every species (#2597)
- [x] 4. Weather and climate (#2598)
- [x] 5. Supply drops (#2599)
- [x] 6. Breeding (#2606)
- [x] 7. Boss arena engine feature and the Broodmother at the green obelisk
- [ ] 8. Metal tier: metal tools and structures, smithy, forge
- [ ] 9. Cooking pot and kibble for taming
- [ ] 10. Explorer notes
- [ ] 11. Megapithecus, the Dragon and the Overseer on the boss arena feature
