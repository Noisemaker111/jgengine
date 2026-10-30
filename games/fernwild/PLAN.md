# fernwild plan

Brief: ARK: Survival Evolved 1:1

## Design brief

- Core loop: hit a tree, a rock or a bush, see "+3 Thatch", fill the bag, craft the next tool that gathers faster.
- Session loop: reach the next tame or build: a dodo by minute 5, a campfire and cooked meat by 10, a thatch hut by 15, a saddled phiomia by 20.
- Long loop: levels and engram points open 79 engrams (stone, thatch, wood, stone building, saddles, narcotics, the club); tames level 88 times past taming; breeding stacks stats over generations; caves give the three artifacts; the Broodmother at the green obelisk is the gate.
- Second 0: you wake on the south beach with nothing but the Stone Pick and Torch engrams known, because ARK starts you with bare hands so the first tree teaches the whole game.
- Onboarding: the Survivor's path, top left, one step at a time with a star on the map at its target; it teaches each system by doing it once, and locks nothing after the first craft.
- Pace: something new every 5 minutes.
- Longest cycle: 60 minutes, ARK's day and night.
- Minutes to see everything: 1500

### First 10 minutes

- 0:00 wake on the beach with nothing; teaches moving, looking and punching a tree for thatch and wood
- 0:30 teaches E on the ground: stones, then fiber and berries from bushes
- 1:00 the first level from gathering; unlocks the Stone Pick craft and teaches I, engrams and crafting
- 2:00 unlocks the Stone Hatchet engram; teaches spending engram points and which tool takes what
- 3:00 food and water fall; teaches drinking at the shore and eating berries
- 4:30 a dodo on the beach; teaches the knock-out tame: punch it out, berries in its inventory, it is yours
- 5:30 level up; teaches spending a stat point and unlocks the campfire and spear engrams
- 7:00 teaches hunting a dodo or lystro, carving meat by tool and cooking it on the campfire
- 8:30 unlocks thatch building: a foundation, a doorframe, walls, a ceiling and a door, shelter from rain and cold
- 9:30 teaches the next goal: the Phiomia Saddle at level 5 and a phiomia knocked out with fists or a club

### Start state

| Probe | At most |
| --- | --- |
| itemsSeen | 0 |
| taught | 0 |
| tamesSeen | 0 |
| engramsSeen | 2 |

### Content budget

| Kind | Count |
| --- | --- |
| items | 116 |
| species | 58 |
| engrams | 79 |
| notes | 21 |
| tames | 55 |

### Systems

| System | Probe |
| --- | --- |
| harvesting | gathered |
| crafting | crafted |
| progression | xp |
| survival | drinks |
| taming | tamed |

### Fernwild against ARK, beat by beat

What each of ARK's beats is, what Fernwild did when this plan was written (played from a new game for 20 minutes), and what changed.

| ARK beat | Fernwild before | Now |
| --- | --- | --- |
| Punch thatch and wood, E for stones, fiber and berries | Same, but "Harvest Stones" showed over trees, so E looked like it would pick up a trunk | E names only what you aim at; a trunk hides the stones only when it is nearer and nearer the middle of your view |
| XP, engram points, tiers | ARK's XP table and engram levels | Same; the Survivor's path walks you through spending them |
| Hunger, thirst, temperature, stamina | All four, plus weight | Raw meat now spoils in 10 minutes, cooked in 20, into spoiled meat (the narcotic's base), as in ARK |
| Knock-out taming: narcotics, berries, effectiveness, imprinting | Worked only through the `cheat` command in the proofs; a club landed half its torpor, so a raptor took 18 hits | Taming is played for real from zero: punch a dodo out, feed it berries; club a phiomia, keep it under with narcotics from the mortar. A club hit lands its full torpor (9 hits for a level-1 raptor) |
| Survivor and tame stat levelling | Both, with ARK's per-point gains | Same |
| Creature roles | 58 species with ARK's temperaments; the beach rolled raptors, dilophosaurs and trikes at level 30 beside the spawn | The start beach holds dodos, phiomia, lystros and parasaurs; wild levels cap at 5 near the start and climb a level every 50 m out, so danger rises with distance |
| Base building and defense | Thatch, wood and stone tiers with snapping | Same; the first hut is a Survivor's path step |
| Biomes and danger by distance | The biomes were there, the danger was not | Level cap by distance (above) |
| Explorer notes, obelisks, boss gate | Obelisks and the Broodmother; no notes | 21 explorer notes at caves, obelisks and summits, read with E for XP; a Dossier tab lists species met, species tamed and notes read; the map marks unread notes, obelisks, caves and tames |
| The map | A small map only during the tutorial, with no ground on it | Always on: the island baked from its real ground, your goal starred, notes, obelisks, cave mouths and tames marked |
| The first hour | No guide past the first craft | The Survivor's path runs 23 steps from the first tree to the Broodmother |

Still short of ARK: no bolas, slingshot or tranq arrows, no kibble, no wild dino raids on the base at night, and no flyers to tame on the path.

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
| taming — knock-out taming, torpor, narcotics, taming effectiveness | `subdual-feeding` · `import { createSubdualFeeding } from "@jgengine/core/subdual/subdualFeeding"` | covered |
| riding — saddles, mounted steering and attacks | `riding` · `import { Riding } from "@jgengine/core/scene/riding"`<br>`ride-choice` · `import { createRideChooser } from "@jgengine/core/gameplay"` | covered |
| base building — thatch, wood and stone tiers with snap sockets | `base-building` · `import { createBaseBuilding } from "@jgengine/core/basebuilding/baseBuilding"`<br>`base-structures-draw` · `import { BaseStructures } from "@jgengine/core/basebuilding/BaseStructures.draw"` | covered |
| death — a body and beam to recover your items | `death-system` · `import { createDeathSystem } from "@jgengine/core/combat"`<br>`on-death-drops` · `import { OnDeathSpec } from "@jgengine/core/combat"` | covered |
| cave — artifact caves with pedestals | `cave-draw` · `import { Cave } from "@jgengine/core/cave/Cave.draw"`<br>`cave-layout` · `import { caveLayout } from "@jgengine/core/cave/caveLayout"` | covered |
| weather — biome climate, day and night, rain, snow, storms | `authored-weather` · `import { createAuthoredWeather } from "@jgengine/core/weather/authoredWeather"`<br>`authored-weather-rendering` · `import { AuthoredWeatherLayer } from "@jgengine/core/weather/AuthoredWeatherLayer.draw"` | covered |
| airdrop — supply drops: coloured crates by place and level | `paced-schedule` · `import { createPacedSchedule } from "@jgengine/core/time/pacedSchedule"`<br>`motion-track` · `import { createMotionTrack } from "@jgengine/core/movement/motionTrack"`<br>`weighted-pick` · `import { pickWeighted } from "@jgengine/core/random/pick"`<br>`remains-field` · `import { createRemainsField } from "@jgengine/core/remains/remains"` | covered |
| breeding — mating, eggs, incubation, imprinting, mutations | `breeding` · `import { createBreedingField } from "@jgengine/core/breeding/breeding"`<br>`value-inheritance` · `import { inheritValues } from "@jgengine/core/inheritance/inheritance"`<br>`resolve` · `import { tierAt } from "@jgengine/core/threshold/thresholds"` | covered |
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
- [x] 10. Explorer notes, the dossier and the island map
- [ ] 11. Megapithecus, the Dragon and the Overseer on the boss arena feature
- [x] 12. The south beach as ARK draws it: pale sand with pebbles and driftwood, palms near the water, a jungle wall of trees, ferns, bushes and waist-high grass (#2687)
- [x] 13. The inland as ARK draws it: rolling hills, cliffs and gullied mountains, waist-high grass through the jungle and plains (#2687)
- [x] 14. Rock as ARK draws it: rounded boulders with cracks and stacked ledges instead of flat low-poly facets (#2687)
- [x] 15. Clothes drawn on the survivor's body (#2811)
- [x] 16. Survivor creation and the spawn screen: name, four bodies, height, and seven beaches graded Easy to Hard on the island map; death wakes you on the beach you chose
