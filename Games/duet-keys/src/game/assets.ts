import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/** KayKit dungeon + adventurers — never Kenney. */
export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: ["kaykit-dungeon", "kaykit-adventurers"],
});

const DUN = "kaykit-dungeon";
const CHAR = "kaykit-adventurers";

export const DUNGEON = {
  wall: `${DUN}/wall`,
  floor: `${DUN}/floor_tile_large`,
  floorDetail: `${DUN}/floor_tile_small_decorated`,
  dirt: `${DUN}/floor_dirt_large`,
  gate: `${DUN}/wall_gated`,
  trap: `${DUN}/floor_tile_big_spikes`,
  column: `${DUN}/pillar`,
  stairs: `${DUN}/stairs`,
  rocks: `${DUN}/barrel_large`,
  stones: `${DUN}/box_large`,
  coin: `${DUN}/coin`,
  humanHero: `${CHAR}/Mage`,
  orcHero: `${CHAR}/Barbarian`,
  chest: `${DUN}/chest`,
  torch: `${DUN}/torch_lit`,
} as const;

export const FLOOR_VARIANTS = [DUNGEON.floor, DUNGEON.floorDetail, DUNGEON.dirt] as const;
