import { bakeNavMesh } from "@jgengine/navbake";
import type { HandlerTable } from "./context";

/** Bake caller-provided indexed geometry into a named document navigation mesh. */
export const navMeshHandlers: Pick<HandlerTable, "bakeNavMesh"> = {
  bakeNavMesh: (ctx, request) => {
    const data = bakeNavMesh(request);
    ctx.dispatchGuarded({ type: "setBake", bake: { kind: "nav", id: request.id, data } });
    return { ok: true, result: { id: request.id, polygons: data.polys.length } };
  },
};
