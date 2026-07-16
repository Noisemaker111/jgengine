import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: ["kaykit-dungeon", "kaykit-adventurers"],
});

export const DUNGEON = {
  wall: "kaykit-dungeon/pillar",
  floor: "kaykit-dungeon/floor_tile_small",
  floorDetail: "kaykit-dungeon/floor_tile_small_broken_A",
  dirt: "kaykit-dungeon/floor_tile_small_broken_B",
  plate: "kaykit-dungeon/floor_tile_small_decorated",
  gate: "kaykit-dungeon/barrier_half",
  trap: "kaykit-dungeon/floor_tile_big_spikes",
  column: "kaykit-dungeon/torch_mounted",
  stairs: "kaykit-dungeon/stairs",
  torch: "kaykit-dungeon/torch",
  trunk: "kaykit-dungeon/trunk_small_A",
  coin: "kaykit-dungeon/coin",
  humanHero: "kaykit-adventurers/Mage",
  orcHero: "kaykit-adventurers/Barbarian",
} as const;

export const FLOOR_VARIANTS = [DUNGEON.floor, DUNGEON.floorDetail, DUNGEON.dirt] as const;
