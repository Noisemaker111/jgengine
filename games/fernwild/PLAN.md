# fernwild plan

Brief: ARK: Survival Evolved 1:1

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
## Suite score

What players must be able to do, proven by headless simulation in `bun test` (`jgengine suite fernwild`). This is the headline; the engine coverage table below only hints where the engine has a part.

| Area | Proven | Failing | Not simulatable | Missing | Cut |
| --- | --- | --- | --- | --- | --- |
| onboarding | 1/2 | 0 | 0 | 1 | 0 |
| failure | 1/1 | 0 | 0 | 0 | 0 |
| save | 0/1 | 0 | 0 | 1 | 0 |
| settings | 0/1 | 0 | 0 | 1 | 0 |
| menu | 0/1 | 0 | 0 | 1 | 0 |
| progression | 0/1 | 1 | 0 | 0 | 0 |
| content | 3/5 | 2 | 0 | 0 | 0 |
| survival | 3/9 | 0 | 0 | 6 | 0 |
| building | 1/3 | 0 | 0 | 2 | 0 |
| harvest | 2/3 | 0 | 0 | 1 | 0 |
| crafting | 1/6 | 0 | 0 | 5 | 0 |
| taming | 7/9 | 0 | 0 | 2 | 0 |
| creatures | 2/13 | 0 | 0 | 11 | 0 |
| breeding | 2/4 | 0 | 0 | 2 | 0 |
| spawns | 0/3 | 0 | 0 | 3 | 0 |
| boss | 0/3 | 0 | 0 | 3 | 0 |
| cave | 1/2 | 0 | 0 | 1 | 0 |
| **total** | **24/67** | 3 | 0 | 40 | 0 |

<details><summary>Every required entry</summary>

Genres: creature-survival. 24/67 proven · 3 failing · 40 missing.

| Entry | Status | What the player does | Detail |
| --- | --- | --- | --- |
| `onboarding.first-goal` | proven | A new game shows a first goal, and the first player action toward it advances it. | proofs/sim/first-goal.proof.ts |
| `onboarding.find-features` | missing | A player following the game's own guidance reaches the first use of every core feature. |  |
| `failure.lose-and-recover` | proven | The player can fail (die, lose the run, go broke) and the game puts them back into play at a stated cost. | proofs/sim/body-recover.proof.ts |
| `save.continue` | missing | Progress made by playing survives saving and continuing. |  |
| `settings.controls` | missing | The player opens settings and a change (a binding, volume, sensitivity) takes effect. |  |
| `menu.start-and-credits` | missing | The main menu starts a game and shows the credits. |  |
| `progression.runway` | FAILING | Something new unlocks steadily across the first five hours, up to the progression cap. | the last unlock is at level 60 of a cap of 105 |
| `content.item-source` | proven | Every item can be obtained by playing. | content check |
| `content.item-use` | FAILING | Every item does something: crafts, equips, eats, places, feeds, sells or summons. | no use for metal, obsidian, crystal, oil, artifact_skylord, artifact_devourer, artifact_pack, artifact_immune, artifact_strong, element, spider_flag, broodmother_trophy_gamma and 4 more |
| `content.recipes-reachable` | proven | Every recipe and source can actually be used: its inputs, station and unlock are all obtainable. | content check |
| `content.placeables-place` | FAILING | Every item that says it can be placed can be placed. | says it places but the placement catalog has none: storage_box, hide_sleeping_bag |
| `content.weapons-have-ammo` | proven | Every weapon that fires has obtainable ammo, or needs none. | content check |
| `survival.vitals-drain` | proven | Hunger and thirst fall over time and hurt the player at zero. | proofs/sim/vitals-drain.proof.ts |
| `survival.eat-drink` | proven | Eating and drinking restore the meters. | proofs/sim/eat-drink.proof.ts |
| `survival.temperature` | missing | Climate pushes body temperature; clothing, fire or shelter counter it. |  |
| `survival.oxygen-swim` | missing | Swimming under water drains breath; surfacing refills it. |  |
| `survival.food-spoils` | proven | Carried food spoils over time into something else. | proofs/sim/food-spoils.proof.ts |
| `survival.respawn-point` | missing | A placed bed or bag becomes where the player wakes after death. |  |
| `survival.storage-place` | missing | A storage container can be placed and holds items. |  |
| `survival.encumbrance` | missing | Carrying more slows the player, and past the limit they cannot move. |  |
| `survival.farm` | missing | Plant a seed in a plot; with water and fertilizer it grows a harvest. |  |
| `building.place-snap` | proven | Building pieces place, snap to each other and stand. | proofs/sim/build-snap.proof.ts |
| `building.shelter` | missing | A built enclosure shelters the player from weather and cold. |  |
| `building.tiers-durability` | missing | Stronger building tiers resist attacks a weaker tier does not. |  |
| `harvest.tool-bias` | proven | The tool used changes what a tree, rock or body yields, and how much. | proofs/sim/tool-bias.proof.ts |
| `harvest.node-respawn` | missing | Depleted trees, rocks and bushes come back after a while. |  |
| `harvest.carcass` | proven | A killed creature's body yields meat and hide by tool. | proofs/sim/carcass-harvest.proof.ts |
| `crafting.station-tiers` | missing | Placed stations craft recipes the bare inventory cannot. |  |
| `crafting.unlock-spend` | proven | Level-ups give points the player spends to learn recipes. | proofs/sim/craft-learn.proof.ts |
| `crafting.refine-tier` | missing | Raw ore smelts at a fuelled station into a material that opens a stronger tier of tools and building. |  |
| `crafting.fuel` | missing | A station that burns consumes fuel and stops when it runs out. |  |
| `crafting.preserve` | missing | A preserving container slows spoilage. |  |
| `crafting.tool-wear` | missing | Tools and weapons wear with use, break, and can be repaired with materials. |  |
| `taming.knockout-melee` | proven | Knock a creature out by hitting it, feed it, and it becomes yours. | proofs/sim/tame-knockout.proof.ts |
| `taming.ranged-knockout` | proven | Knock a creature out from range with sedative ammo, without standing in its reach. | proofs/sim/tame-ranged.proof.ts |
| `taming.keep-under` | proven | Keep an unconscious creature under with a sedative while it eats. | proofs/sim/tame-keep-under.proof.ts |
| `taming.wake-loses` | proven | If an unconscious creature's torpor runs out it wakes up wild, and the taming progress is lost. | proofs/sim/tame-wake.proof.ts |
| `taming.preferred-food` | proven | Each species ranks its foods; its favourite tames it several times faster and cleaner than ordinary food. | proofs/sim/tame-favourite.proof.ts |
| `taming.crafted-bait` | proven | A cooked taming food, made from eggs and crops at a station, is the best food for creatures of its tier. | proofs/sim/tame-kibble.proof.ts |
| `taming.passive-feed` | missing | Some creatures tame awake, by offering food without being hit. |  |
| `taming.trap` | missing | A trap or snare holds a creature still for taming. |  |
| `taming.effectiveness` | proven | A cleaner tame gives a better creature. | proofs/sim/tame-clean.proof.ts |
| `creatures.follow-stay` | missing | Order a tame to follow, stay or guard. |  |
| `creatures.fight-alongside` | missing | Tames attack what threatens the player. |  |
| `creatures.work.gather` | missing | Species have gather roles: a tame gathers its specialty resource far faster than the player's best tool. |  |
| `creatures.work.haul` | missing | A tame carries weight so the player can haul more. |  |
| `creatures.work.lighter-loads` | missing | A specialist tame carries its specialty resource at reduced weight. |  |
| `creatures.work.airlift` | missing | A flying tame picks up a smaller creature or survivor and carries it. |  |
| `creatures.feed-starve` | missing | Tames eat from their own inventory or a shared trough; an unfed tame starves and dies. |  |
| `creatures.guard-base` | missing | Tames left at the base defend it. |  |
| `creatures.behavior-modes` | missing | Set a tame passive, neutral or aggressive, and it fights accordingly. |  |
| `creatures.level-up` | proven | Tames gain experience and the player spends their levels on stats. | proofs/sim/tame-level-up.proof.ts |
| `creatures.ride.ground` | proven | Saddle a tame and ride it, steering and attacking from its back. | proofs/sim/ride-ground.proof.ts |
| `creatures.ride.fly` | missing | Ride a flying tame: take off, climb, cross terrain that blocks walking, and land. |  |
| `creatures.ride.swim` | missing | Ride a swimming tame through water. |  |
| `breeding.pair-mate` | proven | Put a male and a female tame together and they produce an egg or a baby. | proofs/sim/breed-mate.proof.ts |
| `breeding.incubate` | proven | An egg hatches only kept at the right temperature. | proofs/sim/breed-incubate.proof.ts |
| `breeding.raise-imprint` | missing | Feed and care for a baby; care raises its quality as it grows. |  |
| `breeding.inherit-mutate` | missing | Offspring inherit their parents' stats, with a chance of mutation. |  |
| `spawns.biome-weighted` | missing | Each region spawns its own creatures in its own mix. |  |
| `spawns.danger-by-distance` | missing | Danger rises the further the player travels from the start. |  |
| `spawns.respawn-population` | missing | Killed or tamed creatures are replaced over time. |  |
| `boss.summon-arena-reward` | missing | Gather the offering, summon the boss at its altar, win the fight, take the reward. |  |
| `boss.phases` | missing | A boss changes how it fights as it is hurt. |  |
| `boss.unlocks-progression` | missing | Beating a boss unlocks something no other source gives. |  |
| `cave.artifact-run` | proven | Enter a cave, survive it, and take the artifact from its end. | proofs/sim/cave-artifact.proof.ts |
| `cave.hazards` | missing | Caves hold their own dangers: stronger creatures, cold, poison or dark. |  |

</details>
<!-- /suite-score -->

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

## Built from the parts

The root mechanism under most of what is left: a body holds meters (vitals), sources give it doses
(now, or over seconds, up to a cap), a dose table says what each source gives each kind of receiver,
and a meter crossing a line raises a flag that a rule acts on. Knockout taming is exactly that: a
club, a dart or a narcotic doses torpor; torpor full raises `unconscious`; while out, each food from
the species' dose table doses affinity, belly and ineffectiveness; affinity full raises `tamed`.
A shield potion, a sim's meal and a gas cloud are the same shape. Each entry below names its parts;
build it from them, and add what a part lacks to that part, with a test.

| Entry | Built from |
| --- | --- |
| taming.wake-loses | torpor flag clears: the game zeroes affinity (done in `knockoutTaming.ts`) |
| taming.effectiveness | ineffectiveness meter; hits and meals dose it; effectiveness 1/(1+x) (done) |
| taming.passive-feed | the same diet dose table, offered by the player to an awake creature that raises a `hungry` flag |
| taming.trap | a `held` meter dosed by a bola or trap, draining; the flag sets movement speed to 0 (Modifiers) |
| creatures.feed-starve | a tame's food vital drains; it eats from its inventory through the same diet table; empty food drains health (vitals `whenEmpty`) |
| survival.oxygen-swim | an oxygen vital drained while under water (`extra` rate), `whenEmpty` drains health |
| cave.hazards | an area doses who stands in it (gas: oxygen down; heat: health down) |
| survival.temperature | `bodyTemperature` gives drain rates into the vitals tick |
| creatures.work.gather | a tame's attack is a tool profile (`resourceNode` biases) per species, data only |
| creatures.work.lighter-loads | a carrier x item weight multiplier, the same per-receiver table shape, read by `carryLoad` |
| survival.encumbrance | `inventory/encumbrance` over carried weight into a speed modifier |
| crafting.fuel / refine-tier | `crafting/production` with a fuel meter drained while running |
| crafting.preserve | spoilage rate x a container multiplier (Modifiers) |
| crafting.tool-wear | `item/durability` |
| survival.farm | `crafting/crop` growth Phases plus a water meter |
| spawns.* | `populationDirector`, Placement, Table per biome, a Ladder of level by distance |
| boss.phases | `thresholdTracker` over the boss's health |
| creatures.ride.fly | `flight/freeFlight` with stamina as a vital drained while flying |
| creatures.work.airlift | riding's seat relation with a creature as the passenger |

## Features

<!-- Every feature the brief implies, one per line, a few words each (the words before ` — ` are looked up). Then check each with `jgengine has "<feature>"`. -->

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

<!-- written from the Features list by hand; check each row with `jgengine has "<feature>"` -->

| Feature | Engine | Engine hint |
| --- | --- | --- |
| island terrain — The Island surveyed 1:1: coast, peaks, ridges, rivers, biomes, obelisks, caves | `terrain-coast` · `import { withCoast } from "@jgengine/core/terrain/terrain"` | covered |
| creature spawns — ARK's spawn zones, species and weights per biome | `spawn-instance-restore` · `import { restoreSpawnInstance } from "@jgengine/core/stats/spawnLevelStats"`<br>`spawn-instance-snapshot` · `import { snapshotSpawnInstance } from "@jgengine/core/stats/spawnLevelStats"` | covered |
| survival stats — food, water, stamina, oxygen, temperature, weight | `decay-meter` · `import { decayMeterMoodles } from "@jgengine/core/gameplay"` | covered |
| harvesting — trees, bushes, rocks by tool, ARK's yields | `scatter-harvest` · `import { createScatterHarvest } from "@jgengine/core/harvest/scatterHarvest"`<br>`resource-node` · `import { createResourceNodeField } from "@jgengine/core/world/resourceNode"` | covered |
| crafting — engrams, recipes, a crafting queue | `recipe-catalog-validation` · `import { validateRecipeCatalog } from "@jgengine/core/crafting/recipeCatalog"` | covered |
| progression — ARK's XP table, stat points, engram points | `content-progression-validation` · `import { validateContentProgression } from "@jgengine/core/game/contentValidation"`<br>`progression-curve` · `import { evalCurve } from "@jgengine/core/gameplay"` | covered |
| taming — knock-out taming, torpor, narcotics, taming effectiveness | `survival-vitals` · `import { createVitals } from "@jgengine/core/stats/vitals"`<br>`dose-table` · `import { createDoseTable } from "@jgengine/core/stats/doseTable"` | covered |
| riding — saddles, mounted steering and attacks | `riding` · `import { Riding } from "@jgengine/core/scene/riding"`<br>`ride-choice` · `import { createRideChooser } from "@jgengine/core/gameplay"` | covered |
| base building — thatch, wood and stone tiers with snap sockets | `base-building` · `import { createBaseBuilding } from "./engine-local/basebuilding/baseBuilding"`<br>`base-structures-draw` · `import { BaseStructures } from "./engine-local/basebuilding/BaseStructures.draw"` | covered |
| death — a body and beam to recover your items | `death-system` · `import { createDeathSystem } from "@jgengine/core/combat"`<br>`on-death-drops` · `import { OnDeathSpec } from "@jgengine/core/combat"` | covered |
| cave — artifact caves with pedestals | `cave-draw` · `import { Cave } from "./engine-local/cave/Cave.draw"`<br>`cave-layout` · `import { caveLayout } from "./engine-local/cave/caveLayout"` | covered |
| weather — biome climate, day and night, rain, snow, storms | `authored-weather` · `import { createAuthoredWeather } from "@jgengine/core/weather/authoredWeather"`<br>`authored-weather-rendering` · `import { AuthoredWeatherLayer } from "@jgengine/core/weather/AuthoredWeatherLayer.draw"` | covered |
| airdrop — supply drops: coloured crates by place and level | `paced-schedule` · `import { createPacedSchedule } from "@jgengine/core/time/pacedSchedule"`<br>`motion-track` · `import { createMotionTrack } from "@jgengine/core/movement/motionTrack"`<br>`weighted-pick` · `import { pickWeighted } from "@jgengine/core/random/pick"`<br>`remains-field` · `import { createRemainsField } from "./engine-local/remains/remains"` | covered |
| breeding — mating, eggs, incubation, imprinting, mutations | `breeding` · `import { createBreedingField } from "@jgengine/core/breeding/breeding"`<br>`value-inheritance` · `import { inheritValues } from "@jgengine/core/inheritance/inheritance"`<br>`resolve` · `import { tierAt } from "@jgengine/core/threshold/thresholds"` | covered |
| boss fight — the Broodmother summoned at an obelisk with artifacts, an arena, Araneo minions, rewards | `summoned-encounter` · `import { createSummonedEncounter } from "./engine-local/summonedEncounter/summonedEncounter"`<br>`phase-ladder` · `import { advancePhase } from "@jgengine/core/ai/phaseLadder"` | covered |
| metal tier — metal tools and structures, smithy, forge | `mood` · `import { createMoodReader } from "@jgengine/core/agents/mood"`<br>`resolve` · `import { tierAt } from "@jgengine/core/gameplay"` | partial |
| cooking — cooking pot, kibble for taming | `dose-table` · `import { createDoseTable } from "@jgengine/core/stats/doseTable"`<br>`remains-field` · `import { createRemainsField } from "./engine-local/remains/remains"` | covered |
| explorer notes — notes across the island and the experience they give | `editor-material-controls` · `import { materialAuthoringNotes } from "@jgengine/editor/materialControls"`<br>`damage-type-unknown` · `import { UnknownDamageTypeError } from "@jgengine/core/combat"` | partial |
| more bosses — Megapithecus and the Dragon, the Overseer in the Tek cave | `summoned-encounter` · `import { createSummonedEncounter } from "./engine-local/summonedEncounter/summonedEncounter"`<br>`phase-ladder` · `import { createPhaseClock } from "@jgengine/core/ai/phaseLadder"` | partial |

## Gaps

<!-- written from the Features list by hand; check each row with `jgengine has "<feature>"` -->

- metal tier — metal tools and structures, smithy, forge: only part ships (mood); extend that owner or confirm it covers the feature.
- explorer notes — notes across the island and the experience they give: only part ships (editor-material-controls); extend that owner or confirm it covers the feature.
- more bosses — Megapithecus and the Dragon, the Overseer in the Tek cave: only part ships (summoned-encounter); extend that owner or confirm it covers the feature.

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
- [x] 9. Cooking pot and kibble for taming (#2972)
- [x] 10. Explorer notes, the dossier and the island map
- [ ] 11. Megapithecus, the Dragon and the Overseer on the boss arena feature
- [x] 12. The south beach as ARK draws it: pale sand with pebbles and driftwood, palms near the water, a jungle wall of trees, ferns, bushes and waist-high grass (#2687)
- [x] 13. The inland as ARK draws it: rolling hills, cliffs and gullied mountains, waist-high grass through the jungle and plains (#2687)
- [x] 14. Rock as ARK draws it: rounded boulders with cracks and stacked ledges instead of flat low-poly facets (#2687)
- [x] 15. Clothes drawn on the survivor's body (#2811)
- [x] 16. Survivor creation and the spawn screen: name, four bodies, height, and seven beaches graded Easy to Hard on the island map; death wakes you on the beach you chose
