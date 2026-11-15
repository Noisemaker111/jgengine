# LAWN ORDER plan

Brief: "Redesign ember-command into LAWN ORDER: an ant-colony RTS in a suburban backyard, seen from ant
scale. You command a red ant colony against a rival black-ant colony (and later wasps) across a lawn
that is a huge map: grass blades as forests, a garden hose as a river, patio stones as plateaus, a
dropped popsicle as a rich resource node. Workers haul crumbs/sugar/leaf pulp; the queen lays eggs into
castes; pheromone trails boost movement and gathering. The nest expands underground (nursery, fungus
garden, granary, barracks). The sprinkler sweeps on a timer, the lawnmower crosses a lane, rain storms,
nightfall. Five missions ending on the Kid with the Magnifying Glass. Bright, saturated, giant-scale
nature; ants with readable caste silhouettes and team colours. Just do it, be really creative."

The folder and package id stay `ember-command`; every player-facing name is LAWN ORDER.

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
## Suite score

What players must be able to do, proven by headless simulation in `bun test` (`jgengine suite ember-command`). This is the headline; the engine coverage table below only hints where the engine has a part.

| Area | Proven | Failing | Not simulatable | Missing | Cut |
| --- | --- | --- | --- | --- | --- |
| onboarding | 0/2 | 0 | 0 | 2 | 0 |
| failure | 0/1 | 0 | 0 | 1 | 0 |
| save | 0/1 | 0 | 0 | 1 | 0 |
| settings | 0/1 | 0 | 0 | 1 | 0 |
| menu | 0/1 | 0 | 0 | 1 | 0 |
| progression | 0/1 | 0 | 0 | 1 | 0 |
| content | 0/5 | 0 | 0 | 5 | 0 |
| strategy | 0/5 | 0 | 0 | 5 | 0 |
| **total** | **0/17** | 0 | 0 | 17 | 0 |

<details><summary>Every required entry</summary>

Genres: strategy. 0/17 proven · 17 missing.

| Entry | Status | What the player does | Detail |
| --- | --- | --- | --- |
| `onboarding.first-goal` | missing | A new game shows a first goal, and the first player action toward it advances it. |  |
| `onboarding.find-features` | missing | A player following the game's own guidance reaches the first use of every core feature. |  |
| `failure.lose-and-recover` | missing | The player can fail (die, lose the run, go broke) and the game puts them back into play at a stated cost. |  |
| `save.continue` | missing | Progress made by playing survives saving and continuing. |  |
| `settings.controls` | missing | The player opens settings and a change (a binding, volume, sensitivity) takes effect. |  |
| `menu.start-and-credits` | missing | The main menu starts a game and shows the credits. |  |
| `progression.runway` | missing | Something new unlocks steadily across the first five hours, up to the progression cap. | no content sheet (proofs/content.ts) |
| `content.item-source` | missing | Every item can be obtained by playing. | no content sheet (proofs/content.ts) |
| `content.item-use` | missing | Every item does something: crafts, equips, eats, places, feeds, sells or summons. | no content sheet (proofs/content.ts) |
| `content.recipes-reachable` | missing | Every recipe and source can actually be used: its inputs, station and unlock are all obtainable. | no content sheet (proofs/content.ts) |
| `content.placeables-place` | missing | Every item that says it can be placed can be placed. | no content sheet (proofs/content.ts) |
| `content.weapons-have-ammo` | missing | Every weapon that fires has obtainable ammo, or needs none. | no content sheet (proofs/content.ts) |
| `strategy.select-order` | missing | Select units and order them somewhere. |  |
| `strategy.produce-units` | missing | Spend resources to produce new units. |  |
| `strategy.gather-economy` | missing | Gather or capture resources over time. |  |
| `strategy.win-lose-condition` | missing | The match is won or lost by a stated condition. |  |
| `strategy.fog-scout` | missing | Unexplored areas are hidden until scouted. |  |

</details>
<!-- /suite-score -->

## Direction

- **Player promise.** You are the mind of a red ant colony on a lawn that is a continent. Every second
  you choose between feeding the queen, fighting the black ants, and getting out of the way of things
  that do not know you exist (the sprinkler, the mower, the kid).
- **Pillars.** (1) Nature is the third army: the yard's clocks hurt both sides and reshape every fight.
  (2) Scent is strategy: pheromone trails are a resource you lay, spend and lose to water. (3) A caste
  reads from its silhouette at RTS height.
- **Anti-pillars.** No tech tree of 40 buildings; no micro-heavy spell lists; no realism lecture: ants
  are heroic and a little silly.
- **Falsifier.** If a player can win a skirmish while ignoring the sprinkler, the mower and trails, the
  yard is decoration, not design.
- **Out.** A second map, multiplayer, wasps as a playable side, a tunnel (underground) view.
- **Done scenario.** A new player opens the title, claims the popsicle, crosses the hose, survives Mower
  Day, raids the black queen at night and beats the magnifying glass from the shade of the clover.

## Design brief

- **Core loop (30 s).** Workers haul crumbs, popsicle sugar and leaf pulp home and scent the route; the
  queen turns it into eggs; the colony walks faster on its own trails.
- **Session loop (one sitting).** One campaign mission or a free skirmish: dig chambers, raise castes,
  survive raids and the yard's clocks, dig out the black nest.
- **Long loop (hours).** The five-mission campaign carries granary stores and the Marshal's kit between
  battles; the skirmish runs every yard clock against escalating raids.
- **Second 0:** three workers, five soldiers and Marshal Mandible beside the red nest, cookie crumbs and
  two leaf piles in reach: the first verb is "send the workers to food", the oldest RTS verb there is.
- **Onboarding:** the opening notice names the first click and the pheromone key; mission I teaches the
  dig → hatch → march order.
- **Pace:** something new about every two minutes (sprinkler, first raid, mower warning, rain, night).
- **Longest cycle:** a day, 240 s (night at 165–230 s); the mower every 150 s; rain every 210 s.
- **Minutes to see everything:** about 45 (the campaign).

### First 10 minutes

- 0:00 — select the workers, right-click the crumbs: foraging and the scent they lay home.
- 0:30 — dig a Barracks Chamber (B); the first black raid scouts the lawn.
- 1:20 — the sprinkler wakes (skirmish and mission I/II/IV): the jet slows and washes the trail.
- 2:00 — hatch Soldiers; paint a Pheromone Line (P) to the popsicle and watch foragers speed up.
- 3:30 — the mower warning: clear the lane at z = 20 or lose everyone in it.
- 4:30 — dig a Nursery, hatch a Tank Beetle; dig a Granary near the popsicle.
- 6:00 — rain: everyone wades, the scent fades fast; the hose crossings decide where fights happen.
- 8:00 — nightfall: antennae shrink; Scouts and the patio stones (high ground) bring the sight back.
- 9:30 — instinct research (Swarm or Turtle) and the push on the black nest.

### Start state

- 250 sugar, 120 leaf, brood room 30, no chambers but the nest, every yard clock at zero.

### Content budget

- 5 red castes (worker, scout, soldier, spitter, tank beetle) + the Marshal; 3 enemy kinds (black
  raider, black major, paper wasp); 6 chambers; 3 food kinds; 5 hazards; 5 missions; 4 Marshal acts,
  8 kit picks; 4 backyard studios (hose, mower lane, patio stone, shade spots).

### Systems

- Economy — `hud.sugar`, `hud.leaf` rise while workers forage.
- Pheromone — `session.trails.version` climbs; scented cells around hauling routes.
- Hazards — `hud.hazards` (sprinkler/mower/rain/night/beam) change on their clocks.
- Production — `hud.producing`, `hud.building`; castes gated by `missingChamber`.
- Campaign — `hud.campaign` phase, objective and stores.

## Features

- RTS selection, orders, formations — shell pointer + `game/commands.ts`, `game/formations.ts`.
- Unit pursuit and combat — `@jgengine/core/ai/pursuit`, `scene.entity.effect`.
- Foraging — `@jgengine/core/world/resourceNode` (per-node budget and haul from `catalog.ts`).
- Hatching and digging — `@jgengine/core/work/unitTraining`, `@jgengine/core/gameplay` work queues.
- Black-ant director — `@jgengine/core/waves/*`, `ai/director/*`, `sensor/perception`; skirmish rival
  personalities are data in `ai/personality.ts` (interval, field cap, raid book, aim, wasp tempo).
- Colony traits between battles — game-local `game/colony.ts` over `@jgengine/core/store/defineStore`.
- Missions — `@jgengine/core/mission` (`defendMission`, `escortMission`), `run/sessionLoop`.
- Fog — `@jgengine/core/map/fog`, scaled by night and patio high ground.
- Pheromone trails — game-local `game/pheromone.ts` [partial: one adopter].
- Yard hazards — game-local `game/hazards.ts` + `world/YardHazards.draw.tsx` [partial: one adopter].
- Backyard studios — `@jgengine/core/scene/sceneKinds` + `sceneKindRenderers` registry, kinds registered
  by `world/yardKinds.draw.tsx`.
- Rain — `@jgengine/core/weather/WeatherLayer.draw`.
- Procedural bodies — `scene.renderEntity` + `world/bugMeshes.ts` (no ant models exist in the catalog).
- Plants — Quaternius stylized nature via `@jgengine/assets` scatter models.
- HUD and menus — Rune (`@jgengine/core/ui/rune`), garden-journal theme in `ui/theme.ts`.

## Gaps

- Pheromone grid (lay, decay, wash, speed factor) — a generic `packages/core/src/fields/scentField/`
  (decaying scalar grid with deposit/paint/wash) once a second game wants trails or heat maps.
- Timed hazard clocks (sweeping jet, lane sweeper, hunting beam) — `packages/core/src/hazards/` when a
  second adopter appears.
- Tube and paver studios — a generic `tube` path studio and `slab` volume studio in
  `packages/core/src/scene/` would replace `yardKinds.draw.tsx`.
- A second lawn map: resolved by the engine scene set (`@jgengine/core/editor/sceneSet`); LAWN ORDER is
  its second adopter.

## Milestones

- [x] 1. Re-theme: castes, chambers, sugar/leaf, popsicle, procedural bodies, backyard scene.
- [x] 2. Pheromone trails: hauling scent, the Pheromone Line verb, speed and harvest bonuses.
- [x] 3. Yard hazards: sprinkler, mower, rain, night, magnifying-glass beam; HUD yard strip and night wash.
- [x] 4. Campaign: The Popsicle Claim, Crossing the Hose, Mower Day, Raid the Black Queen, The Kid with
  the Magnifying Glass.
- [x] 5. Paper wasp nest on the far fence sends sorties at foragers (skirmish, missions IV-V); scouts mark enemies.
- [x] 6. A second lawn: the Front Yard on the engine scene set, with skirmish and mission VI.
- [x] 7. Depth: the Colony sheet (campaign map, royal jelly, queen traits and caste research), three
  skirmish rival personalities, and one more hazard mission per lawn (The Downpour, Noon Heat).

## Handoff

- Done (committed): the LAWN ORDER redesign, depth rounds, readable ants, nav-grid routes, the wasp
  nest, the Front Yard (second lawn on the engine scene set), and this round: the front-yard column
  capture (popsicle melted flat so ants stop sinking into it), three skirmish rivals (Swarm, Diggers,
  Wasp-Friends, or a roll), the Colony sheet as the campaign map with royal jelly, queen traits and
  caste research, and two hazard missions: IV The Downpour (storm clock) and VIII Noon Heat.
- Evidence: 224 game tests incl. the mid-skill balance sim (all eight missions won; Downpour 132 s / 3
  lost, Noon Heat 138 s / 12 lost, the beam finale still ~22 lost), rival and colony sims. JPEG shots
  in `shots/`: `colony-map.jpg`, `backyard-storm.jpg`, `frontyard-noon.jpg`, `frontyard-driveway.jpg`,
  `backyard-boss.jpg` (draft software renders).
- Next: rain reads only through the HUD cloud wash and strip in software captures (check the
  WeatherLayer on a GPU); `drive --rpc sim_advance` barely advances a mission's clock in captures, so
  mid-mission shots need a longer advance; the Downpour is on the easy side for mission IV.
