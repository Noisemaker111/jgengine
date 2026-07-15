export type BuildCategory = "ride" | "stall" | "track" | "path" | "scenery" | "staff";

export type StallNeed = "hunger" | "thirst" | "souvenir";

export interface BuildableDef {
  id: string;
  label: string;
  blurb: string;
  category: BuildCategory;
  icon: string;
  cost: number;
  upkeep: number;
  color: string;
  trim: string;
  requires?: string;
  appeal: number;
  footprint: number;
  ride?: { thrill: number; rideSeconds: number; capacity: number };
  stall?: { need: StallNeed; price: number; restock: number; stock: number };
  staff?: { cleaning: number };
  isEntrance?: boolean;
}

export const BUILDABLES: Record<string, BuildableDef> = {
  ride_carousel: {
    id: "ride_carousel",
    label: "Carousel",
    blurb: "Gentle spinner. Reliable crowd-pleaser for a young park.",
    category: "ride",
    icon: "🎠",
    cost: 850,
    upkeep: 22,
    color: "#f06d9a",
    trim: "#ffd24a",
    appeal: 4,
    footprint: 8,
    ride: { thrill: 4, rideSeconds: 6, capacity: 6 },
  },
  ride_coaster: {
    id: "ride_coaster",
    label: "Coaster Station",
    blurb: "Anchor a coaster, then lay track pieces beside it. Longer track, bigger thrill.",
    category: "ride",
    icon: "🎢",
    cost: 1400,
    upkeep: 45,
    color: "#3f7be0",
    trim: "#ff5a3c",
    appeal: 6,
    footprint: 8,
    ride: { thrill: 8, rideSeconds: 9, capacity: 8 },
  },
  ride_ferris: {
    id: "ride_ferris",
    label: "Ferris Wheel",
    blurb: "Slow, scenic, and visible from every corner of the park.",
    category: "ride",
    icon: "🎡",
    cost: 2200,
    upkeep: 60,
    color: "#33b1c9",
    trim: "#ffe066",
    requires: "tier_ferris",
    appeal: 9,
    footprint: 10,
    ride: { thrill: 6, rideSeconds: 12, capacity: 12 },
  },
  ride_dropzone: {
    id: "ride_dropzone",
    label: "Drop Tower",
    blurb: "Screaming free-fall. Pure thrill, steep upkeep.",
    category: "ride",
    icon: "🗼",
    cost: 3400,
    upkeep: 95,
    color: "#e2483d",
    trim: "#2a2f3a",
    requires: "tier_dropzone",
    appeal: 13,
    footprint: 8,
    ride: { thrill: 14, rideSeconds: 8, capacity: 8 },
  },
  stall_food: {
    id: "stall_food",
    label: "Burger Stall",
    blurb: "Feeds hungry guests. Restocked daily from park funds.",
    category: "stall",
    icon: "🍔",
    cost: 420,
    upkeep: 14,
    color: "#e8622a",
    trim: "#fff2cc",
    appeal: 2,
    footprint: 4,
    stall: { need: "hunger", price: 14, restock: 5, stock: 40 },
  },
  stall_drink: {
    id: "stall_drink",
    label: "Drinks Kiosk",
    blurb: "Cold drinks for thirsty crowds on a hot day.",
    category: "stall",
    icon: "🥤",
    cost: 360,
    upkeep: 11,
    color: "#2fb37a",
    trim: "#eafff4",
    requires: "tier_fountain",
    appeal: 2,
    footprint: 4,
    stall: { need: "thirst", price: 9, restock: 3, stock: 50 },
  },
  stall_souvenir: {
    id: "stall_souvenir",
    label: "Souvenir Shop",
    blurb: "High-margin trinkets guests grab on the way out.",
    category: "stall",
    icon: "🎁",
    cost: 560,
    upkeep: 16,
    color: "#8a5cd0",
    trim: "#ffe9a8",
    requires: "tier_ferris",
    appeal: 3,
    footprint: 4,
    stall: { need: "souvenir", price: 24, restock: 8, stock: 30 },
  },
  track_piece: {
    id: "track_piece",
    label: "Track Piece",
    blurb: "Snaps next to the coaster station or existing track. Every piece adds thrill.",
    category: "track",
    icon: "〰️",
    cost: 130,
    upkeep: 4,
    color: "#ff5a3c",
    trim: "#c9ccd6",
    appeal: 1,
    footprint: 4,
  },
  path_walk: {
    id: "path_walk",
    label: "Path",
    blurb: "Paved walkway. Cheap, tidy, and nudges guest satisfaction.",
    category: "path",
    icon: "▫️",
    cost: 8,
    upkeep: 0,
    color: "#c8bfa6",
    trim: "#a89e82",
    appeal: 0.4,
    footprint: 4,
  },
  deco_tree: {
    id: "deco_tree",
    label: "Tree",
    blurb: "Shade and greenery. Small beauty boost.",
    category: "scenery",
    icon: "🌳",
    cost: 45,
    upkeep: 0,
    color: "#3f8f3a",
    trim: "#6b4a2a",
    appeal: 1.2,
    footprint: 4,
  },
  deco_flowerbed: {
    id: "deco_flowerbed",
    label: "Flower Bed",
    blurb: "A splash of color that lifts nearby guests.",
    category: "scenery",
    icon: "🌷",
    cost: 30,
    upkeep: 0,
    color: "#e85fa0",
    trim: "#3f8f3a",
    requires: "tier_flowers",
    appeal: 1.4,
    footprint: 4,
  },
  deco_lamp: {
    id: "deco_lamp",
    label: "Lamp Post",
    blurb: "Keeps paths cheerful after dusk.",
    category: "scenery",
    icon: "🏮",
    cost: 35,
    upkeep: 0,
    color: "#3a3f4c",
    trim: "#ffd24a",
    requires: "tier_flowers",
    appeal: 0.8,
    footprint: 4,
  },
  deco_fountain: {
    id: "deco_fountain",
    label: "Fountain",
    blurb: "A grand centerpiece that raises the whole park's charm.",
    category: "scenery",
    icon: "⛲",
    cost: 340,
    upkeep: 6,
    color: "#7fbfe0",
    trim: "#c9ccd6",
    requires: "tier_fountain",
    appeal: 4,
    footprint: 8,
  },
  deco_topiary: {
    id: "deco_topiary",
    label: "Grand Topiary",
    blurb: "Sculpted hedges for a headline garden.",
    category: "scenery",
    icon: "🌿",
    cost: 260,
    upkeep: 3,
    color: "#2f7a34",
    trim: "#8fd06a",
    requires: "tier_gardens",
    appeal: 3.4,
    footprint: 4,
  },
  staff_janitor: {
    id: "staff_janitor",
    label: "Janitor Post",
    blurb: "A cleaning crew that keeps litter down and guests happy.",
    category: "staff",
    icon: "🧹",
    cost: 300,
    upkeep: 28,
    color: "#2b6db0",
    trim: "#ffd24a",
    requires: "tier_janitor",
    appeal: 0,
    footprint: 4,
    staff: { cleaning: 26 },
  },
};

export const BUILD_IDS: readonly string[] = Object.keys(BUILDABLES);

export function buildableDef(id: string): BuildableDef {
  const def = BUILDABLES[id];
  if (def === undefined) throw new Error(`loopline: unknown buildable "${id}"`);
  return def;
}

export const CATEGORY_ORDER: readonly BuildCategory[] = [
  "ride",
  "track",
  "stall",
  "scenery",
  "path",
  "staff",
];

export const CATEGORY_LABEL: Record<BuildCategory, string> = {
  ride: "Rides",
  track: "Coaster",
  stall: "Shops",
  scenery: "Scenery",
  path: "Paths",
  staff: "Staff",
};

export const CATEGORY_ICON: Record<BuildCategory, string> = {
  ride: "🎢",
  track: "〰️",
  stall: "🍔",
  scenery: "🌳",
  path: "▫️",
  staff: "🧹",
};
