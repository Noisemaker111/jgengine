# @jgengine/simulations

Physical models a game can adopt that no game in this repo runs yet, each held to published references by its tests and the comparison scripts in `scripts/reference/`:

- `fracture/*`: rock fracture into convex cells, fragment size distributions, and a fracture generator.
- `physics/boat*`: displacement and planing hulls, propellers, resistance, seakeeping, windage and manoeuvring.
- `physics/flowTube`: flow corridors that push bodies along a path.
- `granular/granularExperiments`: the reference experiments behind the granular model in core.

When a game adopts one and a second game needs it too, it moves into `@jgengine/core` (see AGENTS.md). Import by path:

```ts
import { createBoatDynamics } from "@jgengine/simulations/physics/boatDynamics";
```

Not on npm yet: it publishes once the package name is set up for trusted publishing.

Part of [JGengine](https://github.com/Noisemaker111/jgengine). Apache-2.0.
