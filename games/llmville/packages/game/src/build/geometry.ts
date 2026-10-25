import type { BuildItemId } from "@llmville/game/build/catalog";
export interface BuildFootprint {
  width: number;
  depth: number;
}

export const DEFAULT_BUILD_FOOTPRINT = { width: 1, depth: 1 } as const satisfies BuildFootprint;

export const BUILD_ITEM_FOOTPRINTS: Partial<Record<BuildItemId, BuildFootprint>> = {
  beanbag_corner: { width: 2, depth: 2 },
};

export function getBuildItemFootprint(id: BuildItemId): BuildFootprint {
  return BUILD_ITEM_FOOTPRINTS[id] ?? DEFAULT_BUILD_FOOTPRINT;
}
