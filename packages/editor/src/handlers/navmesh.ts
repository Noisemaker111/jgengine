import { bakeAuthoredNavMesh, initNavBake, navBakeReady } from "@jgengine/navbake";
import { navAuthoringFromDocument } from "@jgengine/core/nav/navAuthoring";
import { emitEditorConsole } from "../shell/consoleSink";
import type { HandlerTable } from "./context";

/** Start loading the recast module so the first bake request does not have to wait. */
export function warmNavBake(): void {
  initNavBake().catch((error: unknown) => {
    emitEditorConsole("error", "navbake", `recast failed to load: ${error instanceof Error ? error.message : String(error)}`);
  });
}

/**
 * Bake the document's authored nav areas, plus any caller-provided indexed geometry, into a named
 * document navigation mesh. Authored `nav_link` paths are not baked in: the runtime resolves them
 * onto whichever bake it routes on, so moving a link needs no re-bake.
 */
export const navMeshHandlers: Pick<HandlerTable, "bakeNavMesh"> = {
  bakeNavMesh: (ctx, request) => {
    if (!navBakeReady()) {
      warmNavBake();
      return { ok: false, error: "bakeNavMesh: the recast baker is still loading; retry shortly" };
    }
    const { id, method: _method, positions, indices, ...agent } = request;
    if ((positions === undefined) !== (indices === undefined)) {
      return { ok: false, error: "bakeNavMesh: pass positions and indices together, or neither to bake the authored nav areas" };
    }
    const authored = navAuthoringFromDocument(ctx.session.getState().document);
    if (positions === undefined && !authored.areas.some((area) => area.mode === "walkable")) {
      return { ok: false, error: "bakeNavMesh: no geometry passed and no walkable nav_area authored to bake" };
    }
    const data = bakeAuthoredNavMesh({
      ...agent,
      areas: authored.areas,
      ...(positions === undefined || indices === undefined ? {} : { positions, indices }),
    });
    ctx.dispatchGuarded({ type: "setBake", bake: { kind: "nav", id, data } });
    return {
      ok: true,
      result: { id, polygons: data.polys.length, areas: authored.areas.length, links: authored.links.length, issues: authored.issues },
    };
  },
};
