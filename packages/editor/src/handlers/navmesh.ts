import { bakeNavMesh, initNavBake, navBakeReady } from "@jgengine/navbake";
import { emitEditorConsole } from "../shell/consoleSink";
import type { HandlerTable } from "./context";

/** Start loading the recast module so the first bake request does not have to wait. */
export function warmNavBake(): void {
  initNavBake().catch((error: unknown) => {
    emitEditorConsole("error", "navbake", `recast failed to load: ${error instanceof Error ? error.message : String(error)}`);
  });
}

/** Bake caller-provided indexed geometry into a named document navigation mesh. */
export const navMeshHandlers: Pick<HandlerTable, "bakeNavMesh"> = {
  bakeNavMesh: (ctx, request) => {
    if (!navBakeReady()) {
      warmNavBake();
      return { ok: false, error: "bakeNavMesh: the recast baker is still loading; retry shortly" };
    }
    const { id, method: _method, ...geometry } = request;
    const data = bakeNavMesh(geometry);
    ctx.dispatchGuarded({ type: "setBake", bake: { kind: "nav", id, data } });
    return { ok: true, result: { id, polygons: data.polys.length } };
  },
};
