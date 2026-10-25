import type { LibraryGroup } from "@jgengine/assets/catalogs/materialLibrary";

/** One flat stand-in colour per group, used only by the material sheet's `?sheet=flat` to show what a placeable lacks. */
export const MATERIAL_SHEET_FLAT: Record<LibraryGroup, string> = {
  asphalt: "#55575a", concrete: "#9a9a96", stucco: "#c9c2b4", brick: "#8d5b48", tile: "#a9a49b",
  metal: "#8e949a", wood: "#7d5a3c", foliage: "#5c7a3d", ground: "#8a7a5c", fabric: "#a8a49c",
  stone: "#b5b2ac", glass: "#a9c4c9", water: "#37555e", facade: "#8a6a58",
};
