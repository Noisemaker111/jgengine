import {
  isBuildItemId,
  isPlaceableBuildItem,
  type BuildDirection,
} from "@llmville/game/build/catalog";
import { resolveModelKeyBoundsXZ } from "@llmville/game/scene/modelPlacementBounds";
import type { RoomBounds, WorldPoint } from "@llmville/game/world/grid";

export function resolveBuildItemPlacementBounds(
  itemId: string,
  point: WorldPoint,
  direction: BuildDirection,
  y?: number,
): RoomBounds | null {
  if (!isBuildItemId(itemId) || !isPlaceableBuildItem(itemId)) {
    return null;
  }

  return resolveModelKeyBoundsXZ({
    modelKey: itemId,
    instancePosition: [point.x, y ?? 0, point.z],
    placementDirection: direction,
  });
}