# LAWN ORDER

<!-- suite-score: written by `bun run gen` from proofs/suite-report.json -->
Game suite: **0/17 proven · 17 missing** · `jgengine suite ember-command`
<!-- /suite-score -->

An ant-colony RTS in a suburban backyard, seen from ant height. You are the red colony: haul cookie
crumbs, popsicle sugar and leaf pulp home, lay pheromone trails, dig chambers under the lawn, hatch
castes, and dig out the black ant nest across the garden hose, while the sprinkler, the lawnmower,
rain, nightfall and, at the end, a kid with a magnifying glass try to kill everyone. The folder and
package id stay `ember-command`. Runs on engine source; start it with
`bun --cwd=games/ember-command run dev` from the repository root. Direction and milestones: `PLAN.md`.

## Design checklist

Read from `src/game/{catalog,tuning,pheromone,hazards,yard,upgrades,hero,systems,ai,campaign}`. Numbers
are what the build does now.

- **Campaign — five missions on the engine's mission machine** (`@jgengine/core/mission`), each with
  the yard clocks it is about:
  1. **The Popsicle Claim** (build order; sprinkler). Dig a Barracks Chamber, hatch four Soldiers,
     march Marshal Mandible onto the dropped popsicle. Fails `muster_stalled`, `keep_fallen`, `mandible_fell`.
  2. **Crossing the Hose** (escort; sprinkler). The Marshal reaches the hose's far bank in 240 s;
     `mandible_waylaid`.
  3. **Mower Day** (timed defence; mower, rain). Hold the nest 150 s under black-ant raids;
     `watch_overrun`.
  4. **Raid the Black Queen** (night, sprinkler). March to the brood mound, then dig it out;
     `raid_stalled`, `mandible_fell`.
  5. **The Kid with the Magnifying Glass** (boss; the beam). Outlast 60 s in the shade, then dig out
     the black nest while the burning spot hunts the densest knot of red ants; `verdict_lost`.
  Each mission banks sugar and leaf into the granary stores that open the next one.
- **Core loop.** 250 sugar, 120 leaf, brood room 30. Workers forage crumbs (12 a trip, 600 per pile),
  the popsicle (18 a trip, 2400) or leaf piles (8 a trip, 500) and haul to the nest, a Barracks or a
  Granary. Castes: Worker (50 sugar, 7 s), Scout (40 + 10, 8 s, sight 22), Soldier (80 + 10, 14 s),
  Acid Spitter (70 + 20, 16 s, range 7), Tank Beetle (150 + 60, 24 s, siege ×2.5, needs a Nursery).
  Chambers: Barracks (140 + 60), Fungus Garden (60 + 30, +8 brood room), Nursery (120 + 80), Granary
  (70 + 40, drop-off), Acid Mound (90 + 40, turret).
- **Pheromone trails (the signature).** Laden foragers scent every step home; the Pheromone Line verb
  (P, 15 sugar) paints a trail up to 60 m from the selected ants or the nest. Red ants run up to 40%
  faster on scent and harvest 30% faster at a scented node. Scent halves every 90 s, six times faster
  in rain, and the sprinkler's jet washes it out where it lands.
- **The yard.** Sprinkler on the hose's end: 18 s of spray every 46 s, a sweeping jet that slows
  (×0.45) and batters (6/s). Lawnmower: a 9 s warning, then a deck that kills any ant in its lane every
  150 s. Rain every 210 s for 38 s (everyone ×0.8). Night from 165 to 230 s of each 240 s day (sight
  ×0.6). The beam: 42/s to anything it rests on, blurred 3.5 s of every 15, never through shade. The
  garden hose is a crawl (×0.35) except at its two crossings; patio stones are high ground (sight ×1.35).
- **Progression.** Brood room (supply) from the nest and Fungus Gardens; instincts researched in the
  Barracks (Mandibles and Chitin, three ranks each; Swarm or Turtle, a fork); the Marshal levels 1–5,
  each level offering an act (Ground Slam, Rally Scent, Acid Barrage, Chitin Ward) or a kept trait.
- **Failure states.** The red nest at 1600 health, the black nest at 1300. Black raids wait 30 s, then
  march every 42 s (raiders, majors, wasps), held at 22 fielded.
- **HUD.** Pantry strip (sugar, leaf, brood room, both nests, raid clock), the orders card, a yard strip
  naming the live hazards, a night wash, the lawn minimap, the Marshal's card and a 6×4 command board.
- **Save.** `persist: { mode: "manual" }` checkpoints the campaign track and stores at mission beats.
- **References.** *SimAnt* (red vs black, scent), *Pikmin 3* (the garden as a giant world), *Grounded*
  (backyard landmarks as geography), *Warcraft III* (a hero who matters, a command card).
- **Gap to target.** One lawn, wasps only as raiders, straight-line movement (the hose is slow ground,
  not a pathfinding obstacle).

Loop proof: to-skirmish (from a live match: pause, return to title, free skirmish, and the five soldiers
on the field are the arrival)

Placement lives in `src/editor.scene.json`: nests, food, the `garden_hose` and `mower_lane` paths, the
`patio_stone` volumes, the sprinkler, hose crossings and shade markers, and the campaign waypoints
(`campaign_popsicle`, `campaign_far_bank`, `campaign_brood_raid`). The backyard kinds are registered by
`src/game/world/yardKinds.draw.tsx`. Run `bun run check-types` and `bun run test` here after changes.
