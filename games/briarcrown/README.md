# Briarcrown

Found a hamlet. Feed it, house it, grow it into a castle town. First generated from the idea: "medieval castle builder". Start it with `bun --cwd=games/briarcrown run dev` from the repository root.

## Design checklist

Every word, cost and model below lives in `src/game/idea.ts`; places live in `src/editor.scene.json`.

- **Core loop.** Pick a building (number keys or the build bar) and click the ground to place it on the grid around the lord's hall.
  Cottages house 4, Manors house 10 villagers; farmsteads employ 2 and make food, lumber camps employ 2 and make wood, quarrys employ 3 and make stone, guildhalls employ 4 and make gold.
  Every villager eats food (3 a minute) and pays 1.2 gold a minute; run out of food and every other workplace stops.
- **Progression.**
  - Tiers: Hamlet (0 people) -> Town (22 people) -> Castle town (50 people); each unlocks buildings.
  - Every building upgrades to level 3 (U): homes house more, workplaces make more.
  - A 5-beat story from Steward Aldric, ending when the castle keep is raised; play goes on after it.
- **Failure states.** No game over: a realm that runs out of food stalls (every workplace but food stops) until it is fed again. Placement is refused with a reason (no free workers, not unlocked, cannot afford, ground taken).
- **Minute 5 -> hour 5.** At 5:00 there are a few homes, a farm and a lumber source and the next tier is in sight; later the economy is about balancing food against workers while saving for the castle keep.
- **References it is chasing.**
  - *Manor Lords* - feel: homes and workplaces placed by hand on open ground, people walking between them.
  - *Banished* - pressure: every new hand eats; food is the limit on growth.
  - *Anno 1800* - progression: tiers of residents that unlock the next buildings.
- **Gap to target.** Buildings snap to a square grid with no roads, no adjacency bonuses and no seasons; walkers wander instead of commuting.

Loop proof: briarcrown-loop
