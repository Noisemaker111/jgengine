import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { MarkerSet } from "@jgengine/core/world/markers";

export const MARKERS_STORE_KEY = "orbitKartMarkers";

export function readMarkers(ctx: GameContext): MarkerSet | undefined {
  return ctx.game.store.get(MARKERS_STORE_KEY) as MarkerSet | undefined;
}
