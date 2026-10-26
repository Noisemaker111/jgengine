# @jgengine/core

Genre-agnostic TypeScript game engine SDK — runtime, state store, entity scene, combat, movement, inventory, economy, quests, multiplayer primitives. Each feature is one folder: model files (`hudLayout.ts`) have zero dependencies, and the feature's React view (`kitHud.view.tsx`) and three.js draw (`WorldHud.draw.tsx`) files sit beside them, needing the optional peers `react`, `three` and `@jgengine/react`/`@jgengine/shell`.

Import modules by path:

```ts
import { createGameRuntime } from "@jgengine/core/runtime/gameRuntime";
```

The renderer-free world layer includes a Gerstner `waterSurface` (`world/water`) and a seeded `generateBuilding` kit (`world/buildings`), whose wave math and building component vocabulary were shaped from **[achrefelouafi](https://github.com/achrefelouafi)**'s MIT [OceanThreejs](https://github.com/achrefelouafi/OceanThreejs) and [BuildingGeneratorThreeJS](https://github.com/achrefelouafi/BuildingGeneratorThreeJS) — see [CREDITS.md](../../CREDITS.md).

Part of [JGengine](https://github.com/Noisemaker111/jgengine). Apache-2.0.
