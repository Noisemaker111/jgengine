# ARK survival kit (example)

A worked example that composes the JGengine **survival-game primitives** into one open-world,
creature-taming loop — the shape of an ARK: Survival Evolved-style game, built entirely on engine
API. It is the *first adopter* for the primitives it exercises, and a runnable smoke test that they
fit together.

```sh
bun -e 'import { runArkSurvivalKitDemo } from "./src/index.ts"; console.log(runArkSurvivalKitDemo())'
```

Each exported function drives one seam:

| Function | Primitive | Import |
| --- | --- | --- |
| `spawnAndTame` | wild level → stat scaling, capture bonus levels, domestic leveling | `@jgengine/core/stats/spawnLevelStats` |
| `fieldCompanion` | tamed companion allegiance, commands, per-tick intent | `@jgengine/core/scene/companion` |
| `breedLineage` | stat inheritance, mutations, imprinting, incubation, maturation | `@jgengine/core/game/breeding` |
| `harvestAndWeigh` | tool-gated harvest nodes + carry-weight encumbrance | `@jgengine/core/world/resourceNode`, `@jgengine/core/inventory/encumbrance` |
| `unlockEngram` | spendable unlock-point (engram) economy | `@jgengine/core/economy/unlockPoints` |
| `runTribes` | shared-ownership tribe/group with ranks, assets, alliances | `@jgengine/core/game/tribe` |
| `runPopulation` | ambient per-region population director with respawn queue | `@jgengine/core/ai/populationDirector` |
| `snapBase` | named-socket modular build snapping + footprint occupancy | `@jgengine/core/world/buildSockets` |

## Not a template

This composes published engine primitives; it hardcodes no world geometry. A real game authors its
world (spawn regions, resource placement, biomes, structures) in `editor.scene.json` and drives
these same seams from its own runtime. See the repository `CLAUDE.md` product invariants.
