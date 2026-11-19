Fernwild frees the hands when the slot in hand is emptied by building, feeding or crafting

Engine seam: packages/core/src/combat/squadCombat.ts, packages/core/src/nav/navCrowd.ts

### Migrate

- createNavCrowd drops replanMs and clock, and createSquadCombat drops clock; replanBudget is the only re-plan limit, so a crowd replays the same on any machine

### Fixed

- Fernwild frees the hands when the slot in hand is emptied by building, feeding or crafting
- the game UI draws through WebGL2 when the browser has WebGPU but no usable adapter
