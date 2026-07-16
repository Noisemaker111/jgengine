import {
  DIR_ORDER,
  DIR_VECTORS,
  addCell,
  cellKey,
  sameCell,
  yawToDir,
  type GridCoord,
  type GridDir,
} from "@jgengine/core/world/gridCell";

export type V2 = GridCoord;
export type Dir = GridDir;

export { DIR_VECTORS, DIR_ORDER, cellKey, sameCell, addCell, yawToDir };

export type HeroId = "lumen" | "anchor";

export const HERO_IDS: readonly HeroId[] = ["lumen", "anchor"];
