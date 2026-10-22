# @jgengine/navbake

Deterministic navigation-mesh baking for authored JGengine geometry, backed by [recast-navigation](https://github.com/isaac-mason/recast-navigation-js).

```ts
import { bakeNavMesh, initNavBake } from "@jgengine/navbake";
import { createNavRuntime, createNavCrowd, navMeshFromBake } from "@jgengine/core/world";

await initNavBake();
const mesh = bakeNavMesh({ positions, indices, agentRadius: 0.4, agentHeight: 1.8, maxSlope: 45, maxClimb: 0.4 });

// The editor stores that mesh as a `nav` bake on the scene document; runtime reads it back.
const nav = createNavRuntime({ mesh: navMeshFromBake(document.bakes)!, links: [{ id: "ladder", kind: "ladder", from, to }] });
nav.applyMesh(bakeNavMesh({ ...edited, agentRadius: 0.4, agentHeight: 1.8, maxSlope: 45, maxClimb: 0.4 }));
const crowd = createNavCrowd({ nav });
```

Walkable triangles wind counter-clockwise seen from above (three.js front faces up). The result is plain `NavMeshData`: store it as an editor `nav` bake and consume it with `createNavRuntime` (`@jgengine/core/nav/navRuntime`), which resolves authored off-mesh links and keeps polygon identity across re-bakes so only the routes over changed geometry need re-planning.
