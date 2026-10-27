# Red Frontier

A crew, a lander and red dust to the horizon. Mine it, grow food, hold off what comes out of the craters. First generated from the idea: "frontier colony on mars". Start it with `bun --cwd=games/red-frontier run dev` from the repository root.

## Design checklist

Every word, cost and model below lives in `src/game/idea.ts`; the headquarters, nodes, camps and starter plan live in `src/editor.scene.json`.

- **Core loop.** Select crew (click, drag, or F) and right click: a node to gather, a raider to fight, ground to walk.
  Gatherers haul to the nearest store; rations, ore, ice pay for buildings placed on the grid with the number keys and a right click.
- **Progression.**
  - Buildings: Habitat, Greenhouse, Cargo depot, Defense turret, Terraformer.
  - Houses add beds; a free bed and food to spare bring a new crewmate every 25s.
  - Raids every 75s, bigger each time, tougher kinds from the second and fourth.
  - A 5-beat story from Director Okafor, won by building the terraformer.
- **Failure states.** Food runs out and everyone weakens; the last crewmate falls and the run ends with a result card and a retry.
- **Minute 5 -> hour 5.** At 5:00 a dozen crew work three kinds of node with a house, farm and turret up; later it is how many gather versus guard, and when to save for the terraformer.
- **References it is chasing.**
  - *RimWorld* - feel: a few named colonists, raids that test the base.
  - *Age of Empires* - commands: drag-select, right click to gather or fight, drop-off buildings.
  - *Banished* - pressure: food against growth.
- **Gap to target.** No colonist needs or moods, no walls, no tech tree, no pathfinding round buildings.

Loop proof: red-frontier-loop
