import type { BuildItemId } from "@llmville/game/build/catalog";
export interface BuildDimensions {
  width: number;
  depth: number;
}

export const DEFAULT_BUILD_FOOTPRINT = { width: 1, depth: 1 } as const satisfies BuildDimensions;

export const BUILD_ITEM_FOOTPRINTS: Partial<Record<BuildItemId, BuildDimensions>> = {
  beanbag_corner: { width: 2, depth: 2 },
};

export function getBuildItemFootprint(id: BuildItemId): BuildDimensions {
  return BUILD_ITEM_FOOTPRINTS[id] ?? DEFAULT_BUILD_FOOTPRINT;
}
