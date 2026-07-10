export const PALM_TRUNK = "palm_trunk";
export const PALM_FROND = "palm_frond";
export const CRATE = "crate";
export const ROCK = "rock";
export const BOAT_HULL = "boat_hull";

export const PROP_CATALOG_IDS = [PALM_TRUNK, PALM_FROND, CRATE, ROCK, BOAT_HULL] as const;

export type PropCatalogId = (typeof PROP_CATALOG_IDS)[number];

export const PROP_OBJECT_STYLES: Record<PropCatalogId, { color: string; opacity?: number }> = {
  [PALM_TRUNK]: { color: "#7a5230" },
  [PALM_FROND]: { color: "#4a7c59" },
  [CRATE]: { color: "#c98a4b" },
  [ROCK]: { color: "#8f8168" },
  [BOAT_HULL]: { color: "#e76f51" },
};
