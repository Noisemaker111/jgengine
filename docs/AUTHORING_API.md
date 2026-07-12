# Authoring with JGEngine

Start game code from the task-first authoring module:

```ts
import {
  defineGame,
  environment,
  terrain,
  building,
  selectSpawnPoint,
  seededRng,
} from "@jgengine/core/authoring";
```

Deep imports remain available for advanced systems, adapters, and engine development. They are not the default learning path.

## Define a game

```ts
export const game = defineGame({
  name: "Forest Arena",
  multiplayer: null,
  world: environment([
    terrain({ bounds: { w: 100, d: 100 }, height: 8 }),
    building({ count: 8 }),
  ]),
});
```

`defineGame` creates engine-owned scene and asset containers. Game authors do not construct those stores directly.

## Select a spawn point

```ts
const random = seededRng("wave-4");

const spawn = selectSpawnPoint({
  candidates: spawnPoints,
  avoid: playerPositions,
  random,
  distanceBias: "far",
  biasStrength: 2,
});
```

The call describes game intent. Weighted selection and random-roll mechanics remain inside the engine.

## When to use deep imports

Use domain imports when the authoring module does not expose the required primitive or when implementing reusable engine infrastructure. Examples:

```ts
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createObservableKeyedStore } from "@jgengine/core/store/observableKeyedStore";
```

These are infrastructure APIs. Ordinary game code should rarely need them.
