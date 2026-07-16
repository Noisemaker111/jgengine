import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: ["kenney-mini-dungeon", "kaykit-dungeon", "kaykit-adventurers"],
});

export const DUNGEON = {
  wall: "kaykit-dungeon/pillar.gltf",
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
  humanHero: "kaykit-adventurers/Mage",
  orcHero: "kaykit-adventurers/Barbarian",
} as const;

export const FLOOR_VARIANTS = [DUNGEON.floor, DUNGEON.floorDetail, DUNGEON.dirt] as const;
