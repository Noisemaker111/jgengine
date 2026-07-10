import { useGameStore } from "@jgengine/react";
import type { MarkerSet } from "@jgengine/core/world/markers";
import { MARKERS_STORE_KEY } from "../run/storeKeys";

export function useCanyonMarkers(): MarkerSet | undefined {
  return useGameStore((ctx) => ctx.game.store.get(MARKERS_STORE_KEY) as MarkerSet | undefined);
}
