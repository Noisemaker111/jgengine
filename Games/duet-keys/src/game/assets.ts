import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

export const assets: AssetCatalog = buildCatalog({ basePath: "/models", sources: ["kenney-mini-dungeon"] });

export const DUNGEON = {
  wall: "kenney-mini-dungeon/wall",
  floor: "kenney-mini-dungeon/floor",
  floorDetail: "kenney-mini-dungeon/floor-detail",
  dirt: "kenney-mini-dungeon/dirt",
  gate: "kenney-mini-dungeon/gate",
  trap: "kenney-mini-dungeon/trap",
  column: "kenney-mini-dungeon/column",
  stairs: "kenney-mini-dungeon/stairs",
  rocks: "kenney-mini-dungeon/rocks",
  stones: "kenney-mini-dungeon/stones",
  coin: "kenney-mini-dungeon/coin",
  humanHero: "kenney-mini-dungeon/character-human",
  orcHero: "kenney-mini-dungeon/character-orc",
} as const;

export const FLOOR_VARIANTS = [DUNGEON.floor, DUNGEON.floorDetail, DUNGEON.dirt] as const;
