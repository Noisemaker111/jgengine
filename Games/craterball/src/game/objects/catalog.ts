import { BANNER_CYAN, BANNER_MAGENTA, STAND_BLOCK, TOWER_FLOOD, WALL_SEGMENT } from "../world/dressing";

export interface ObjectCatalogEntry {
  id: string;
  label: string;
  zone: "wall" | "tower" | "stand" | "banner";
}

export const objectCatalog: Readonly<Record<string, ObjectCatalogEntry>> = {
  [WALL_SEGMENT]: { id: WALL_SEGMENT, label: "Basalt Wall Segment", zone: "wall" },
  [TOWER_FLOOD]: { id: TOWER_FLOOD, label: "Floodlight Tower", zone: "tower" },
  [STAND_BLOCK]: { id: STAND_BLOCK, label: "Crowd Stand Block", zone: "stand" },
  [BANNER_CYAN]: { id: BANNER_CYAN, label: "Cyan Team Banner", zone: "banner" },
  [BANNER_MAGENTA]: { id: BANNER_MAGENTA, label: "Magenta Team Banner", zone: "banner" },
};
