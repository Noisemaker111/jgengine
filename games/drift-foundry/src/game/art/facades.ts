import { defineBuildingKit } from "@jgengine/core/world/buildingKit";

/**
 * Salvage-yard facades: the generator's walls, windows, doors and roofs stay, while the parts that
 * make a block read as apartments (awnings, window AC units, clotheslines, shutters, shop signs and
 * roof clutter) are dropped outright. `omit` draws nothing, so these kinds cost no draw calls either.
 */
export const SALVAGE_FACADE_KIT = defineBuildingKit({
  id: "salvage-yard-facade",
  parts: {},
  omit: ["awning", "airConditioner", "clothesline", "shutter", "storeSign", "roofProp"],
});
