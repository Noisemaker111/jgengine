# fernwild plan (Wildwire)

Brief: Wildwire, an ARK-style survival game where every creature is a robot: a lone technician on a feral machine island drains, uploads, rigs and forges wild machines.

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
## Suite score

What players must be able to do, proven by headless simulation in `bun test` (`jgengine suite fernwild`). This is the headline; the engine coverage table below only hints where the engine has a part.

| Area | Proven | Failing | Not simulatable | Missing | Cut |
| --- | --- | --- | --- | --- | --- |
| onboarding | 2/2 | 0 | 0 | 0 | 0 |
| failure | 1/1 | 0 | 0 | 0 | 0 |
| save | 1/1 | 0 | 0 | 0 | 0 |
| settings | 1/1 | 0 | 0 | 0 | 0 |
| menu | 1/1 | 0 | 0 | 0 | 0 |
| progression | 1/1 | 0 | 0 | 0 | 0 |
| content | 5/5 | 0 | 0 | 0 | 0 |
| survival | 9/9 | 0 | 0 | 0 | 0 |
| building | 3/3 | 0 | 0 | 0 | 0 |
| harvest | 3/3 | 0 | 0 | 0 | 0 |
| crafting | 6/6 | 0 | 0 | 0 | 0 |
| taming | 9/9 | 0 | 0 | 0 | 0 |
| creatures | 13/13 | 0 | 0 | 0 | 0 |
| breeding | 4/4 | 0 | 0 | 0 | 0 |
| spawns | 3/3 | 0 | 0 | 0 | 0 |
| boss | 3/3 | 0 | 0 | 0 | 0 |
| cave | 2/2 | 0 | 0 | 0 | 0 |
| **total** | **67/67** | 0 | 0 | 0 | 0 |

<details><summary>Every required entry</summary>

Genres: creature-survival. 67/67 proven.

| Entry | Status | What the player does | Detail |
| --- | --- | --- | --- |
| `onboarding.first-goal` | proven | A new game shows a first goal, and the first player action toward it advances it. | proofs/sim/first-goal.proof.ts |
| `onboarding.find-features` | proven | A player following the game's own guidance reaches the first use of every core feature. | proofs/sim/find-features.proof.ts |
| `failure.lose-and-recover` | proven | The player can fail (die, lose the run, go broke) and the game puts them back into play at a stated cost. | proofs/sim/body-recover.proof.ts |
| `save.continue` | proven | Progress made by playing survives saving and continuing. | proofs/sim/save-continue.proof.ts |
| `settings.controls` | proven | The player opens settings and a change (a binding, volume, sensitivity) takes effect. | proofs/sim/rebind-inventory.proof.ts |
| `menu.start-and-credits` | proven | The main menu starts a game and shows the credits. | proofs/sim/menu-credits.proof.ts |
| `progression.runway` | proven | Something new unlocks steadily across the first five hours, up to the progression cap. | content check |
| `content.item-source` | proven | Every item can be obtained by playing. | content check |
| `content.item-use` | proven | Every item does something: crafts, equips, eats, places, feeds, sells or summons. | content check |
| `content.recipes-reachable` | proven | Every recipe and source can actually be used: its inputs, station and unlock are all obtainable. | content check |
| `content.placeables-place` | proven | Every item that says it can be placed can be placed. | content check |
| `content.weapons-have-ammo` | proven | Every weapon that fires has obtainable ammo, or needs none. | content check |
| `survival.vitals-drain` | proven | Hunger and thirst fall over time and hurt the player at zero. | proofs/sim/vitals-drain.proof.ts |
| `survival.eat-drink` | proven | Eating and drinking restore the meters. | proofs/sim/eat-drink.proof.ts |
| `survival.temperature` | proven | Climate pushes body temperature; clothing, fire or shelter counter it. | proofs/sim/temperature.proof.ts |
| `survival.oxygen-swim` | proven | Swimming under water drains breath; surfacing refills it. | proofs/sim/dive-breath.proof.ts |
| `survival.food-spoils` | proven | Carried food spoils over time into something else. | proofs/sim/food-spoils.proof.ts |
| `survival.respawn-point` | proven | A placed bed or bag becomes where the player wakes after death. | proofs/sim/respawn-point.proof.ts |
| `survival.storage-place` | proven | A storage container can be placed and holds items. | proofs/sim/storage-place.proof.ts |
| `survival.encumbrance` | proven | Carrying more slows the player, and past the limit they cannot move. | proofs/sim/encumbrance.proof.ts |
| `survival.farm` | proven | Plant a seed in a plot; with water and fertilizer it grows a harvest. | proofs/sim/farm.proof.ts |
| `building.place-snap` | proven | Building pieces place, snap to each other and stand. | proofs/sim/build-snap.proof.ts |
| `building.shelter` | proven | A built enclosure shelters the player from weather and cold. | proofs/sim/shelter.proof.ts |
| `building.tiers-durability` | proven | Stronger building tiers resist attacks a weaker tier does not. | proofs/sim/build-tiers.proof.ts |
| `harvest.tool-bias` | proven | The tool used changes what a tree, rock or body yields, and how much. | proofs/sim/tool-bias.proof.ts |
| `harvest.node-respawn` | proven | Depleted trees, rocks and bushes come back after a while. | proofs/sim/node-respawn.proof.ts |
| `harvest.carcass` | proven | A killed creature's body yields meat and hide by tool. | proofs/sim/carcass-harvest.proof.ts |
| `crafting.station-tiers` | proven | Placed stations craft recipes the bare inventory cannot. | proofs/sim/station-tiers.proof.ts |
| `crafting.unlock-spend` | proven | Level-ups give points the player spends to learn recipes. | proofs/sim/craft-learn.proof.ts |
| `crafting.refine-tier` | proven | Raw ore smelts at a fuelled station into a material that opens a stronger tier of tools and building. | proofs/sim/refine-tier.proof.ts |
| `crafting.fuel` | proven | A station that burns consumes fuel and stops when it runs out. | proofs/sim/station-fuel.proof.ts |
| `crafting.preserve` | proven | A preserving container slows spoilage. | proofs/sim/preserve.proof.ts |
| `crafting.tool-wear` | proven | Tools and weapons wear with use, break, and can be repaired with materials. | proofs/sim/tool-wear.proof.ts |
| `taming.knockout-melee` | proven | Knock a creature out by hitting it, feed it, and it becomes yours. | proofs/sim/tame-knockout.proof.ts |
| `taming.ranged-knockout` | proven | Knock a creature out from range with sedative ammo, without standing in its reach. | proofs/sim/tame-ranged.proof.ts |
| `taming.keep-under` | proven | Keep an unconscious creature under with a sedative while it eats. | proofs/sim/tame-keep-under.proof.ts |
| `taming.wake-loses` | proven | An unconscious creature stays out until its torpor, and any sedative still taking effect, wears off; then it wakes up wild and the taming progress is lost. | proofs/sim/tame-wake.proof.ts |
| `taming.preferred-food` | proven | Each species ranks its foods; its favourite tames it several times faster and cleaner than ordinary food. | proofs/sim/tame-favourite.proof.ts |
| `taming.crafted-bait` | proven | A cooked taming food, made from eggs and crops at a station, is the best food for creatures of its tier. | proofs/sim/tame-firmware.proof.ts |
| `taming.passive-feed` | proven | Some creatures tame awake, by offering food without being hit. | proofs/sim/tame-passive.proof.ts |
| `taming.trap` | proven | A trap or snare holds a creature still for taming. | proofs/sim/bola.proof.ts |
| `taming.effectiveness` | proven | A cleaner tame gives a better creature. | proofs/sim/tame-clean.proof.ts |
| `creatures.follow-stay` | proven | Order a tame to follow, stay or guard. | proofs/sim/follow-stay.proof.ts |
| `creatures.fight-alongside` | proven | Tames attack what threatens the player. | proofs/sim/fight-alongside.proof.ts |
| `creatures.work.gather` | proven | Species have gather roles: a tame gathers its specialty resource far faster than the player's best tool. | proofs/sim/tame-gather.proof.ts |
| `creatures.work.haul` | proven | A tame carries weight so the player can haul more. | proofs/sim/tame-haul.proof.ts |
| `creatures.work.lighter-loads` | proven | A specialist tame carries its specialty resource at reduced weight. | proofs/sim/tame-lighter-loads.proof.ts |
| `creatures.work.airlift` | proven | A flying tame picks up a smaller creature or survivor and carries it. | proofs/sim/airlift.proof.ts |
| `creatures.feed-starve` | proven | Tames eat from their own inventory or a shared trough; an unfed tame starves and dies. | proofs/sim/tame-hunger.proof.ts |
| `creatures.guard-base` | proven | Tames left at the base defend it. | proofs/sim/guard-base.proof.ts |
| `creatures.behavior-modes` | proven | Set a tame passive, neutral or aggressive, and it fights accordingly. | proofs/sim/behavior-modes.proof.ts |
| `creatures.level-up` | proven | Tames gain experience and the player spends their levels on stats. | proofs/sim/tame-level-up.proof.ts |
| `creatures.ride.ground` | proven | Saddle a tame and ride it, steering and attacking from its back. | proofs/sim/ride-ground.proof.ts |
| `creatures.ride.fly` | proven | Ride a flying tame: take off, climb, cross terrain that blocks walking, and land. | proofs/sim/ride-fly.proof.ts |
| `creatures.ride.swim` | proven | Ride a swimming tame through water. | proofs/sim/ride-swim.proof.ts |
| `breeding.pair-mate` | proven | Put a male and a female tame together and they produce an egg or a baby. | proofs/sim/breed-mate.proof.ts |
| `breeding.incubate` | proven | An egg hatches only kept at the right temperature. | proofs/sim/breed-incubate.proof.ts |
| `breeding.raise-imprint` | proven | Feed and care for a baby; care raises its quality as it grows. | proofs/sim/breed-imprint.proof.ts |
| `breeding.inherit-mutate` | proven | Offspring inherit their parents' stats, with a chance of mutation. | proofs/sim/breed-inherit.proof.ts |
| `spawns.biome-weighted` | proven | Each region spawns its own creatures in its own mix. | proofs/sim/biome-spawns.proof.ts |
| `spawns.danger-by-distance` | proven | Danger rises the further the player travels from the start. | proofs/sim/danger-distance.proof.ts |
| `spawns.respawn-population` | proven | Killed or tamed creatures are replaced over time. | proofs/sim/respawn-population.proof.ts |
| `boss.summon-arena-reward` | proven | Gather the offering, summon the boss at its altar, win the fight, take the reward. | proofs/sim/boss-reward.proof.ts |
| `boss.phases` | proven | A boss changes how it fights as it is hurt. | proofs/sim/boss-phases.proof.ts |
| `boss.unlocks-progression` | proven | Beating a boss unlocks something no other source gives. | proofs/sim/boss-reward.proof.ts |
| `cave.artifact-run` | proven | Enter a cave, survive it, and take the artifact from its end. | proofs/sim/cave-artifact.proof.ts |
| `cave.hazards` | proven | Caves hold their own dangers: stronger creatures, cold, poison or dark. | proofs/sim/cave-hazards.proof.ts |

</details>
<!-- /suite-score -->

## Design brief

Premise: a century ago an automated colony was abandoned with its fabricators running. Robots kept
printing, repairing and rewriting each other; the island became a wild machine ecosystem with evolved
instincts. You wash up as a lone technician with a multitool and a pocket of fuses.

- Core loop: hit a tree, a rock or a bush, see "+3 Thatch", fill the bag, craft the next tool that gathers faster.
- Session loop: reach the next upload or build: a Mowbot by minute 5, a campfire and a gel ration by 10, a thatch hut by 15, a rigged Craneback by 20.
- Long loop: levels and schematic points open the recipes; uploaded bots level 88 times; forging stacks stats and rolls glitches over generations; caves give the data shards; the Hivemind at the green obelisk is the gate; Signal Storms (from night 6) push you to roof your base.
- Second 0: you wake on the south beach with nothing but the Stone Pick and Torch schematics known.
- Onboarding: the Technician's path, top left, one step at a time with a star on the map at its target.
- Pace: something new every 5 minutes.
- Longest cycle: 60 minutes, a day and night; a storm night every few nights.
- Minutes to see everything: 1500

### Machine systems (Wildwire's mapping)

| Genre beat | Wildwire | Where |
| --- | --- | --- |
| Torpor | Discharge: club hits, slingshot stones, EMP arrows drain a bot's battery; drain spikes keep it flat | `data/taming.ts`, `knockoutTaming.ts` |
| Taming food | Firmware cores (5 tiers) and biogel/berries; a sloppy upload leaves a quirk | `data/firmware.ts`, `data/bots.ts` `rollQuirk` |
| Breeding | Forging: cores cure at temperature, newbuilds mix stats, a fresh mutation rolls a glitch | `breeding.ts`, `data/bots.ts` `GLITCHES` |
| Creature food | Charge: drains faster in rain (rust) and hard sun (heat), refuels from inventory | `tameHunger.ts`, `data/bots.ts` `chargeDrain` |
| Night | Signal Storms: wild bots Overclocked, exposed bots may revert | `creatures.ts` `tickStorm`, `data/bots.ts` |
| Stances | Behaviour chips: Follow, Guard Zone, Passive, Escort, Aggressive | `data/bots.ts` `CHIPS` |
| Temperaments | Passive, Skittish, Territorial, Aggressive, Pack, Ambush, Retaliator; eye glow shows which | `data/bots.ts` |
| Targeting | loudest, brightest, richest, weakest, machines, attacker, biggest, scored into the core creature driver's `focus` | `creatures.ts` `wildMind` |
| Saddles | Rigs | `data/species.ts` |
| Meat, hide | Biogel, salvage | `data/items.ts` |

### Roster status

Proven in play by `src/game/machines.test.ts`, `rootServer.test.ts`, `creatures.test.ts` and `base.test.ts` unless noted.

| Bot | Built | Not yet |
| --- | --- | --- |
| Mowbot | passive first upload; Harvest chip trims bushes into fiber around its post | |
| Ticklet | pack, stamina-drain bite; uploaded and following, rides your shoulder and patches you up | |
| Craneback | skittish forklift mount with forks, heavy carry; uploaded and near you, its crane lifts the build ghost higher and further | |
| Bulldozaur | tracked dozer with canopy and hazard bumper; ridden, its blade bulk-harvests wood and stone | |
| Lodestone | pack buff, magnetic disarm into its own inventory | |
| Mirrorcat | ambush, targets the weakest; ridden, hunters cannot see you | |
| Watchwing | skittish flyer mount; perches still by day; Guard Zone sentry pings hostiles | |
| Arcwire | amphibious: spawns in the rivers and swims them; chain lightning, doubled in water; swimmer mount; on Guard Zone powers stations | |
| Klepto | steals a stack, blinks 30 m and makes that spot its nest, drawn as a growing heap of loot; down it to get it back | |
| Rootkit | trunk-and-canopy body on root legs; dormant until chopping nearby, then the forest stands up | |
| Thermite Beetle | metal-ore gatherer mount with a drill that smelts ore into ingots as it cuts; wild, lies burrowed until you cross its ground | |
| Homer | flyer mount, airlift; flies its cargo to the nearest storage box | |
| Echo Mimic | copies the last trick used near it and turns it on you | |
| Choir Drone | aura: other wild bots near hit harder; the highest-level singer conducts and shields the ring (hits on the others land at a quarter); the Root Server's firewall | |
| Lampjaw | water-only: spawns and stays in deep water off the beaches; ambush, drawn to light, glowing lure antenna | |
| Hoover Leviathan | vacuum whale: panelled tank hull on tracks, ribbed hose, slatted nozzle head, tail fluke; uploaded, a walking base you climb aboard and ride | building on its back |
| Scrapper Rex | hunts other machines first, grows on every wreck | |
| The Hivemind | boss at the green obelisk; later phases puppet (freeze) your bots in her lair | turning puppets hostile |
| The Root Server | boots at the bottom of the Lava Cave, shock pulse, Choir firewall by phase; destroying it ends the storms | its own arena dressing |

### First 10 minutes

- 0:00 wake on the beach with nothing; teaches moving, looking and punching a tree for thatch and wood
- 0:30 teaches E on the ground: stones, then fiber and berries from bushes
- 1:00 the first level from gathering; unlocks the Stone Pick craft and teaches I, engrams and crafting
- 2:00 unlocks the Stone Hatchet engram; teaches spending engram points and which tool takes what
- 3:00 food and water fall; teaches drinking at the shore and eating berries
- 4:30 a mowbot on the beach; teaches the knock-out tame: punch it out, berries in its inventory, it is yours
- 5:30 level up; teaches spending a stat point and unlocks the campfire and spear engrams
- 7:00 teaches hunting a mowbot or lystro, carving meat by tool and cooking it on the campfire
- 8:30 unlocks thatch building: a foundation, a doorframe, walls, a ceiling and a door, shelter from rain and cold
- 9:30 teaches the next goal: the Craneback Saddle at level 5 and a craneback knocked out with fists or a club

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

### History: Fernwild against ARK, beat by beat

What each of ARK's beats is, what Fernwild did when this plan was written (played from a new game for 20 minutes), and what changed.

| ARK beat | Fernwild before | Now |
| --- | --- | --- |
| Punch thatch and wood, E for stones, fiber and berries | Same, but "Harvest Stones" showed over trees, so E looked like it would pick up a trunk | E names only what you aim at; a trunk hides the stones only when it is nearer and nearer the middle of your view |
| XP, engram points, tiers | ARK's XP table and engram levels | Same; the Survivor's path walks you through spending them |
| Hunger, thirst, temperature, stamina | All four, plus weight | Raw meat now spoils in 10 minutes, cooked in 20, into spoiled meat (the narcotic's base), as in ARK |
| Knock-out taming: narcotics, berries, effectiveness, imprinting | Worked only through the `cheat` command in the proofs; a club landed half its torpor, so a lodestone took 18 hits | Taming is played for real from zero: punch a mowbot out, feed it berries; club a craneback, keep it under with narcotics from the mortar. A club hit lands its full torpor (9 hits for a level-1 lodestone) |
| Survivor and tame stat levelling | Both, with ARK's per-point gains | Same |
| Creature roles | 58 species with ARK's temperaments; the beach rolled lodestones, dilophosaurs and bulldozaurs at level 30 beside the spawn | The start beach holds mowbots, craneback, lystros and sirenhorns; wild levels cap at 5 near the start and climb a level every 50 m out, so danger rises with distance |
| Base building and defense | Thatch, wood and stone tiers with snapping | Same; the first hut is a Survivor's path step |
| Biomes and danger by distance | The biomes were there, the danger was not | Level cap by distance (above) |
| Explorer notes, obelisks, boss gate | Obelisks and the Hivemind; no notes | 21 explorer notes at caves, obelisks and summits, read with E for XP; a Dossier tab lists species met, species tamed and notes read; the map marks unread notes, obelisks, caves and tames |
| The map | A small map only during the tutorial, with no ground on it | Always on: the island baked from its real ground, your goal starred, notes, obelisks, cave mouths and tames marked |
| The first hour | No guide past the first craft | The Survivor's path runs 23 steps from the first tree to the Hivemind |

Still short of ARK: no bolas, slingshot or tranq arrows, no firmware, no wild dino raids on the base at night, and no flyers to tame on the path.

## Built from the parts

The root mechanism under most of what is left: a body holds meters (vitals), sources give it doses
(now, or over seconds, up to a cap), a dose table says what each source gives each kind of receiver,
and a meter crossing a line raises a flag that a rule acts on. Knockout taming is exactly that: a
club, a dart or a narcotic doses torpor; torpor full raises `unconscious`; while out, each food from
the species' dose table doses affinity, belly and ineffectiveness; affinity full raises `tamed`.
A shield potion, a sim's meal and a gas cloud are the same shape. Each entry below names its parts;
build it from them, and add what a part lacks to that part, with a test.

Build order, one PR each: feed-starve; oxygen and swimming; cave hazards (an area doses who stands in
it); traps and bolas (a `held` meter, with tranq arrows and darts moved onto dose lists); passive
taming; gather and lighter loads; flying; fuel, preserve and tool wear; farming; boss phases; spawns.

| Entry | Built from |
| --- | --- |
| taming.wake-loses | torpor drains at its rate, narcotic doses still landing keep it up; the flag clears only when all of it wears off, then affinity is zeroed (done, timed by the proof) |
| taming.effectiveness | ineffectiveness meter; hits and meals dose it; effectiveness 1/(1+x) (done) |
| taming.passive-feed | `AWAKE_TAMES` (ARK's passive tames) in the same taming body: E hands it the first food it likes while its belly is empty, affinity builds awake, any hit scares the tame away (done, `knockoutTaming.offer`) |
| taming.trap | a `held` meter in the creature's body, dosed by a bola, draining a second a second; while it holds the creature stays still. Every weapon hit is now a dose list (club and tranq torpor, bola hold) (done) |
| creatures.feed-starve | a tame's food vital drains; core `eatWhileRoom` feeds it from its inventory through the `TAME_DIET` dose table; empty food starves it to death; a baby is the same meter at a faster pace (done, `tameHunger.ts`) |
| survival.oxygen-swim | core swim `dive` (crouch down, jump up, telemetry `diveDepth`); oxygen drained by an `extra` rate while the head is under, `whenEmpty` drowns (done) |
| cave.hazards | core `areaEffectField`, one source per hostile cave carrying vital rates and a temperature shift; the survivor tick adds them (done: swamp gas, lava heat, snow cold) |
| survival.temperature | `bodyTemperature` gives drain rates into the vitals tick |
| creatures.work.gather | a species' bite is a tool profile (`TAME_GATHER` in `data/tameWork.ts`); a ridden bite with nothing alive in front works the tree, rock or bush there, into the mount's own inventory, and stops at its weight limit (done) |
| creatures.work.lighter-loads | `LIGHTER_LOADS`, species x item weight share, read by the tame's `inventory/encumbrance` load: a loaded tame slows and stops at its weight stat (done) |
| survival.encumbrance | `inventory/encumbrance` over carried weight into a speed modifier |
| crafting.fuel | a campfire or pot is a fuel vital in a `FUEL` dose table (wood 30 s, thatch 7.5 s, sparkpowder 60 s); E puts one on; empty, the station cooks nothing and warms nobody, and queued work waits where it stopped (done, `base.ts`) |
| crafting.refine-tier | the same fuel meter on a forge, ore in, metal out |
| crafting.preserve | spoilage rate x a container multiplier (Modifiers) |
| crafting.tool-wear | `item/durability` |
| survival.farm | `crafting/crop` growth Phases plus a water meter |
| spawns.* | `populationDirector`, Placement, Table per biome, a Ladder of level by distance |
| boss.phases | `thresholdTracker` over the boss's health |
| creatures.ride.fly | core hover flight gated by `canFly` (a ridden flyer with stamina); flight speed defaults to the mount's own walk speed, set to its `FLYERS` speed in the air; stamina drains while airborne and at zero it drops (done) |
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
- boss fight — the Hivemind summoned at an obelisk with artifacts, an arena, Hive Drone minions, rewards
- metal tier — metal tools and structures, smithy, forge
- cooking — cooking pot, firmware for taming
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
| boss fight — the Hivemind summoned at an obelisk with artifacts, an arena, Hive Drone minions, rewards | `summoned-encounter` · `import { createSummonedEncounter } from "./engine-local/summonedEncounter/summonedEncounter"`<br>`phase-ladder` · `import { advancePhase } from "@jgengine/core/ai/phaseLadder"` | covered |
| metal tier — metal tools and structures, smithy, forge | `mood` · `import { createMoodReader } from "@jgengine/core/agents/mood"`<br>`resolve` · `import { tierAt } from "@jgengine/core/gameplay"` | partial |
| cooking — cooking pot, firmware for taming | `dose-table` · `import { createDoseTable } from "@jgengine/core/stats/doseTable"`<br>`remains-field` · `import { createRemainsField } from "./engine-local/remains/remains"` | covered |
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
- [x] 7. Boss arena engine feature and the Hivemind at the green obelisk
- [ ] 8. Metal tier: metal tools and structures, smithy, forge
- [x] 9. Cooking pot and firmware for taming (#2972)
- [x] 10. Explorer notes, the dossier and the island map
- [ ] 11. Megapithecus, the Dragon and the Overseer on the boss arena feature
- [x] 12. The south beach as ARK draws it: pale sand with pebbles and driftwood, palms near the water, a jungle wall of trees, ferns, bushes and waist-high grass (#2687)
- [x] 13. The inland as ARK draws it: rolling hills, cliffs and gullied mountains, waist-high grass through the jungle and plains (#2687)
- [x] 14. Rock as ARK draws it: rounded boulders with cracks and stacked ledges instead of flat low-poly facets (#2687)
- [x] 15. Clothes drawn on the survivor's body (#2811)
- [x] 16. Survivor creation and the spawn screen: name, four bodies, height, and seven beaches graded Easy to Hard on the island map; death wakes you on the beach you chose

## Handoff

Branch `worktree-agent-a4f17f89a076b4bef`. All 169 game tests pass, including the 67/67 suite (about 14 minutes here;
`bun run test` can hit its 900 s guard on a busy machine, `bun test --preload ./scripts/three-preload.ts games/fernwild`
runs it unguarded).

Done: rename to Wildwire (ids, items, text, docs); machine instincts (`data/bots.ts`); procedural robot bodies
(`data/robotBodies.ts`) with machine anatomy (treads, grilles, canopies, hazard bumpers, rack lights, seams) and
motion (spinning rotors and saws, rolling wheels, swaying antennae, pulsing eyes); core creature-driver
`focus`/`lightOf`; tricks, storms (HUD banner and sky veil), quirks, glitches, charge wear; behaviour chips and the
Harvest chip; helpers (Ticklet on the shoulder, Arcwire power, Watchwing sentry, Homer courier, Mirrorcat cloak);
Choir conductors; Thermite burrowing; nocturnal Watchwings; the Hivemind's puppet signal; the Root Server boss;
rusted fabricators with cable vines (`fabricator` markers in editor.scene.json, `machineRuins.ts`).

Screenshots: in-game capture works now that Rune's first-frame marks use the page clock (rebuilt jg-ui) and
software capture Chrome gets SwiftShader WebGPU. On a container without a GPU, run with
`CHROME_PATH=/opt/pw-browsers/chromium JG_CAPTURE_GL=swiftshader JG_BROKER=0` and `--cold`. Review flows:
`bun run drive fernwild --flow wildwire-machines` (roster on the beach), `wildwire-upload` (jacked into a
Mowbot) and `wildwire-storm` (a Signal Storm night).

Engine parts added on this branch: the creature driver's terrain modes (`CreatureBody.terrain` land / amphibious /
water, `waterSurface` config); `createCarrierField` (`@jgengine/core/movement/carrier`); per-region seeded streams in
the population director; `SceneEntity.glow` (emissive parts follow a runtime value); `ocean()` `depthRange` and
`shore { width, waves }` passed to the shell Ocean; the orbit camera re-seats its boom when a rig override changes
its framing (`orbitReframe`); scatter clearance tagged `meta.flatten: false` clears foliage without levelling ground.
All tested in core.

Building on carriers: base building (`engine-local/basebuilding`) has moving frames. `setFrame(id, pose, deck)` poses
a carrier each tick; its deck is ground, and pieces planned there (or snapped/floored onto pieces that are) are stored
in the frame, so list/get/solids/raycast/snaps follow it; `removeFrame` drops what it carried. `base.ts` poses every
uploaded platform bot (`carrierFrames`), so a foundation and walls on a Hoover's back walk and turn with it and fall
when it dies. A rider standing on a foundation rides; one up on a ceiling (above the deck's stand tolerance) does not.

Forest glades: the 98 jungle, eastern forest, redwood and swamp spawn markers carry `clearance: 18, flatten: false`
(set through the editor CLI), so a glade opens round each herd without changing the terrain.

Hivemind frenzy: her last phase (`turn: true`) turns puppeted bots on the technician until the signal lets go.

Water and readability: Lampjaws are 2.6 m bodies swimming 0.9 m under (per-profile `swimDepth`), so head and lure
stand clear; `world/WaterLife.tsx` lights each lure with a violet point light and spreading ripple rings, and draws
Arcwire lightning (`arcFlashes`) from the eel to every body it arced into. The sea has a darker deep tone, narrower
bright shelf and a shore foam line. Land bots under 1.2 m wear a temperament beacon and livery (`readable()` in
`robotBodies.ts`). Riding a carrier swaps the camera to a pulled-back orbit rig. Review flow: `wildwire-water`.

Proof robustness: herd spawns and director rolls come from each zone's own stream, so adding a zone no longer
shifts another proof's dice; the taming proofs clear the beach's herds before they start. A zone that genuinely
changes what stands near the start (a level-6 herd 90 m out) still shows in the danger proof, by design.

Next: base building is still game-local (`engine-local/basebuilding`, one adopter); a second adopter moves it and its
moving frames to core. Riders on upper floors of a deck hut; a rim-light option in the entity model draw for
silhouettes at dusk; an in-game shot of a deck hut walking.
