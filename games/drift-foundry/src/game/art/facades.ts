import { defineBuildingKit } from "@jgengine/core/buildings/buildingKit";

/**
 * In-store kiosks: the generator's walls, windows, doors, roofs, awnings, shop signs and roll-down
 * shutters stay (the pharmacy, the key-cutting booth and the café counters, closing for the night),
 * while the parts that make a block read as an apartment street (windows, window AC units, clotheslines and
 * roof clutter) are dropped outright. `omit` draws nothing, so these kinds cost no draw calls either.
 */
export const STORE_KIOSK_KIT = defineBuildingKit({
  id: "store-kiosk-facade",
  parts: {},
  omit: ["airConditioner", "clothesline", "roofProp", "window"],
});
