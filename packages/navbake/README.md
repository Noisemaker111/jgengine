# @jgengine/navbake

Deterministic navigation-mesh baking for authored JGengine geometry, backed by [recast-navigation](https://github.com/isaac-mason/recast-navigation-js).

```ts
import { bakeNavMesh, initNavBake } from "@jgengine/navbake";
import { createNavMeshQuery } from "@jgengine/core/nav/navMesh";

await initNavBake();
const mesh = bakeNavMesh({ positions, indices, agentRadius: 0.4, agentHeight: 1.8, maxSlope: 45, maxClimb: 0.4 });
```

Walkable triangles wind counter-clockwise seen from above (three.js front faces up). The result is plain `NavMeshData`: store it as an editor `nav` bake and route on it with `@jgengine/core/nav/navMesh`.
