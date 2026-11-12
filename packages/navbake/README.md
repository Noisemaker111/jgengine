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

## Authored areas and links

A scene authors its navigation in the editor: `nav_area` box volumes (`meta.mode` `walkable` adds floor at the box's centre height, `blocked` removes the surface on and under it; `meta.area` stamps an area id) and `nav_link` paths (first point leaves, last point lands; `meta.linkKind` `door`/`ladder`/`jump`/`link`, `meta.bidirectional`, `meta.cost`, `-1` pricing by kind). `bakeAuthoredNavMesh` bakes the areas, with any scene triangles, into one mesh that already honours them; the editor's `bakeNavMesh` verb does this when called without geometry. Links stay authored and resolve at runtime:

```ts
import { bakeAuthoredNavMesh } from "@jgengine/navbake";
import { createNavRuntime, navAuthoringFromDocument, navLinksFromDocument, navMeshFromBake } from "@jgengine/core/world";

const { areas } = navAuthoringFromDocument(document);
const mesh = bakeAuthoredNavMesh({ areas, positions, indices, agentRadius: 0.4, agentHeight: 1.8, maxSlope: 45, maxClimb: 0.4 });
const nav = createNavRuntime({ mesh: navMeshFromBake(document.bakes)!, links: navLinksFromDocument(document) });
nav.plan(from, to)?.links; // the links the route crosses, with their authored id and kind
```
