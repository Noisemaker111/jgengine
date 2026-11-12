import { registerSceneKind } from "../scene/sceneKinds";
import { NAV_AREA_KIND, NAV_AREA_SCHEMA, NAV_LINK_KIND, NAV_LINK_SCHEMA } from "./navAuthoring";

let registered = false;

/**
 * Register `nav_area` (a box volume) and `nav_link` (a two-point path) as editor scene kinds: both
 * get a `+ Add` entry under "Navigation" and an inspector from their schema. Idempotent. @internal
 */
export function registerNavAuthoringKinds(): void {
  if (registered) return;
  registered = true;
  registerSceneKind({
    kind: NAV_AREA_KIND,
    target: "volume",
    label: "Nav area",
    addCategory: "Navigation",
    accent: "#f87171",
    schema: NAV_AREA_SCHEMA,
    note: (_object, params) =>
      params["mode"] === "walkable"
        ? "Adds walkable floor at the box's centre height to the nav bake."
        : "Removes the walkable surface under and on this box from the nav bake.",
  });
  registerSceneKind({
    kind: NAV_LINK_KIND,
    target: "path",
    label: "Nav link",
    pathShape: "line",
    addCategory: "Navigation",
    accent: "#a78bfa",
    schema: NAV_LINK_SCHEMA,
    note: (object) => ((object.points?.length ?? 0) < 2 ? "Draw from where the agent leaves to where it lands." : "Leaves at the first point, lands at the last."),
  });
}
