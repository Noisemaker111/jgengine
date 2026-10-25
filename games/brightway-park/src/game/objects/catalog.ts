/**
 * Everything the park can build, as data. A ride is its cycle, ratings, price and wear; a shop is
 * what it sells and to which need; scenery is the charm it spreads to rides nearby. `research`
 * names the lab topic that opens a kind: a kind without one is on the palette from day one.
 * The world declaration (`park.ts`) turns each entry into a kind, its actions and its totals.
 */

export type BuildCategory = "ride" | "stall" | "track" | "path" | "land" | "scenery" | "staff";

/** The ride families of the build palette and the research lab. */
export type RideGroup = "gentle" | "thrill" | "water" | "transport" | "coaster";

/** A guest need a shop fills: every one is a fullness meter on the guest (100 is fine). */
export type StallNeed = "hunger" | "thirst" | "souvenir" | "toilet" | "info" | "nausea";

/** A ride's own cycle, ratings, price and wear curve - content the shared ride sim reads as data. */
export interface RideData {
  group: RideGroup;
  /** Ratings on the 0-10 scale guests judge by: how much fun, how wild, how queasy. */
  excitement: number;
  intensity: number;
  nausea: number;
  rideSeconds: number;
  capacity: number;
  loadSeconds: number;
  unloadSeconds: number;
  /** Ticket a guest pays to board; the park sets the live price from this default. */
  price: number;
  /** Chance one completed cycle breaks the ride, and what the repair costs. */
  breakdown: { baseChance: number; wearChance: number; repairSeconds: number; repairCost: number; serviceCost: number };
}

export interface StallData {
  need: StallNeed;
  /** Default price; the park sets the live one. */
  price: number;
  /** What a guest thinks the item is worth: above this they say it is too expensive. */
  value: number;
  /** What one item costs to restock at midnight. */
  restock: number;
  stock: number;
  /** How much of the need one purchase fills. */
  fill: number;
}

/** A lab topic: what it costs to run and how long it takes, after the topic before it. */
export interface ResearchData {
  cost: number;
  seconds: number;
  after?: string;
}

export interface BuildableDef {
  id: string;
  label: string;
  blurb: string;
  category: BuildCategory;
  icon: string;
  cost: number;
  /** Running cost per park day (wages for staff posts). */
  upkeep: number;
  color: string;
  trim: string;
  /** Base appeal to the park; scenery nearby adds to a ride's. */
  appeal: number;
  /** Side of the square it covers, in metres. */
  footprint: number;
  research?: ResearchData;
  ride?: RideData;
  stall?: StallData;
  /** A hire: the post is the middle of this person's patrol area. */
  staff?: { role: StaffRole; cleaning: number; repair?: number; patrol: number };
  /** Scenery: how far its charm reaches, in metres, and how much it adds to each ride in reach. */
  theme?: { radius: number; bonus: number };
  /** A model from the engine's asset library instead of the park's own authored GLB. */
  libraryModel?: { id: string; height?: number };
}

/** What a hired person does on patrol. */
export type StaffRole = "handyman" | "mechanic" | "entertainer" | "security";

type RideRow = [id: string, label: string, icon: string, group: RideGroup, cost: number, upkeep: number, footprint: number,
  excitement: number, intensity: number, nausea: number, capacity: number, rideSeconds: number, price: number,
  research: ResearchData | null, blurb: string];

const COLORS: Record<RideGroup, [string, string]> = {
  gentle: ["#f06d9a", "#ffd24a"],
  thrill: ["#e2483d", "#2a2f3a"],
  water: ["#2f8fd0", "#eafff4"],
  transport: ["#2fb37a", "#fff2cc"],
  coaster: ["#3f7be0", "#ff5a3c"],
};

/** Gentle 8, thrill 8, water 4, transport 3, coasters 5: twenty-eight rides. */
const RIDES: readonly RideRow[] = [
  ["ride_carousel", "Carousel", "🎠", "gentle", 1200, 40, 8, 3.2, 1.0, 0.6, 12, 14, 2, null, "Painted horses on a turning deck. Families love it."],
  ["ride_helter", "Helter Skelter", "🌀", "gentle", 900, 30, 8, 3.0, 2.0, 0.8, 6, 10, 1, null, "Climb the tower, slide round and round to the bottom."],
  ["ride_teacups", "Spinning Teacups", "☕", "gentle", 1400, 45, 8, 3.6, 2.6, 2.6, 12, 14, 2, { cost: 500, seconds: 50 }, "Giant cups on a spinning floor - more spin than it looks."],
  ["ride_maze", "Hedge Maze", "🌿", "gentle", 1600, 25, 12, 3.4, 0.5, 0.2, 16, 30, 1, { cost: 450, seconds: 50, after: "ride_teacups" }, "Green walls, a gazebo in the middle, and plenty of wrong turns."],
  ["ride_vintage", "Vintage Cars", "🚗", "gentle", 2400, 60, 12, 4.0, 1.2, 0.6, 8, 22, 2, { cost: 800, seconds: 70, after: "ride_maze" }, "Old motor cars around a little figure-eight road."],
  ["ride_ferris", "Ferris Wheel", "🎡", "gentle", 2600, 70, 12, 4.2, 0.9, 0.5, 16, 24, 2, { cost: 900, seconds: 80, after: "ride_vintage" }, "Slow, scenic and seen from every corner of the park."],
  ["ride_haunted", "Haunted House", "👻", "gentle", 3200, 80, 12, 4.8, 2.5, 1.0, 8, 20, 3, { cost: 1100, seconds: 90, after: "ride_ferris" }, "Crooked gables and creaking doors. Screams guaranteed."],
  ["ride_obs", "Observation Tower", "🗼", "gentle", 3800, 90, 8, 4.5, 0.8, 0.4, 20, 30, 3, { cost: 1300, seconds: 100, after: "ride_haunted" }, "A ring cabin rises up the mast for a view of the whole coast."],
  ["ride_bumper", "Dodgems", "🚙", "thrill", 2200, 60, 12, 4.4, 3.0, 1.5, 12, 16, 2, null, "Bumper cars under a striped roof. Pure chaos."],
  ["ride_swings", "Wave Swinger", "🎐", "thrill", 2800, 70, 12, 5.0, 4.2, 2.8, 16, 18, 3, { cost: 900, seconds: 70 }, "Chairs fly out on chains as the canopy spins and tilts."],
  ["ride_pirate", "Pirate Ship", "🏴‍☠️", "thrill", 3000, 75, 12, 5.4, 4.8, 3.6, 16, 20, 3, { cost: 1000, seconds: 80, after: "ride_swings" }, "A galleon swinging higher and higher on its frame."],
  ["ride_gokarts", "Go-Karts", "🏎️", "thrill", 3600, 90, 16, 5.6, 3.6, 1.2, 8, 30, 4, { cost: 1200, seconds: 90, after: "ride_pirate" }, "Race round a tyre-walled track. Everyone wants another go."],
  ["ride_simulator", "Motion Simulator", "🛸", "thrill", 3400, 100, 8, 4.8, 5.4, 6.2, 8, 18, 4, { cost: 1200, seconds: 90, after: "ride_gokarts" }, "A capsule that throws its riders through space."],
  ["ride_topspin", "Top Spin", "🔄", "thrill", 4200, 110, 8, 6.2, 7.2, 6.0, 12, 18, 4, { cost: 1500, seconds: 110, after: "ride_simulator" }, "A gondola flipped end over end on two arms."],
  ["ride_enterprise", "Enterprise", "🎆", "thrill", 4600, 120, 12, 6.4, 7.6, 6.8, 16, 20, 4, { cost: 1700, seconds: 120, after: "ride_topspin" }, "A wheel of pods spun until it stands upright."],
  ["ride_dropzone", "Drop Tower", "⬇️", "thrill", 5200, 130, 8, 6.8, 8.4, 4.0, 12, 14, 5, { cost: 2000, seconds: 140, after: "ride_enterprise" }, "Up the tower, a pause, then free-fall."],
  ["ride_boats", "Boat Hire", "🦢", "water", 1800, 40, 12, 3.8, 1.0, 0.8, 8, 30, 2, null, "Swan boats paddling round a little pond."],
  ["ride_logflume", "Log Flume", "🪵", "water", 5200, 120, 16, 5.8, 4.2, 2.0, 8, 30, 4, { cost: 1600, seconds: 120 }, "Logs along a raised trough, then the big splash."],
  ["ride_rapids", "River Rapids", "🌊", "water", 6000, 140, 16, 6.0, 4.6, 3.0, 12, 32, 4, { cost: 1900, seconds: 140, after: "ride_logflume" }, "Round boats bounced down a rocky channel."],
  ["ride_splash", "Splash Boats", "💦", "water", 6800, 150, 16, 6.6, 5.2, 2.4, 10, 28, 5, { cost: 2200, seconds: 160, after: "ride_rapids" }, "A tall lift hill and a drop that soaks the crowd."],
  ["ride_train", "Miniature Railway", "🚂", "transport", 3000, 60, 16, 3.6, 0.6, 0.4, 24, 40, 2, { cost: 800, seconds: 70 }, "A steam engine pulling carriages round the park's edge."],
  ["ride_chairlift", "Chairlift", "🚡", "transport", 3600, 70, 12, 4.0, 1.4, 0.6, 12, 34, 2, { cost: 1100, seconds: 90, after: "ride_train" }, "Chairs on a cable between two towers."],
  ["ride_monorail", "Monorail", "🚝", "transport", 5400, 110, 16, 4.2, 0.8, 0.4, 24, 40, 3, { cost: 1800, seconds: 130, after: "ride_chairlift" }, "A sleek train on a beam high above the paths."],
  ["ride_coaster", "Wooden Coaster", "🎢", "coaster", 2000, 50, 8, 0, 0, 0, 12, 20, 4, null, "Build it yourself: a station, then track piece by piece. Longer, steeper, faster - more thrill."],
  ["ride_junior", "Junior Coaster", "🐛", "coaster", 4500, 110, 16, 5.0, 4.0, 2.2, 12, 30, 4, { cost: 1500, seconds: 110 }, "A family coaster: low hills, gentle turns."],
  ["ride_mouse", "Wild Mouse", "🐭", "coaster", 6200, 140, 16, 6.4, 6.4, 4.4, 8, 32, 5, { cost: 2100, seconds: 150, after: "ride_junior" }, "Single cars whipped through tight switchbacks."],
  ["ride_looping", "Looping Coaster", "➰", "coaster", 9800, 220, 16, 7.6, 8.2, 6.0, 20, 36, 6, { cost: 3200, seconds: 200, after: "ride_mouse" }, "Steel track, a lift hill and a vertical loop."],
  ["ride_inverted", "Inverted Coaster", "🦇", "coaster", 12000, 260, 20, 8.0, 8.6, 6.4, 24, 40, 7, { cost: 4000, seconds: 240, after: "ride_looping" }, "Feet dangling under the track through a loop and a corkscrew."],
];

/** Repairs, servicing and the odds of a breakdown grow with the ride's size and wildness. */
function rideEntry(row: RideRow): BuildableDef {
  const [id, label, icon, group, cost, upkeep, footprint, excitement, intensity, nausea, capacity, rideSeconds, price, research, blurb] = row;
  const [color, trim] = COLORS[group];
  const wild = intensity / 10;
  return {
    id, label, blurb, icon, cost, upkeep, footprint, color, trim,
    category: "ride",
    appeal: Math.round((2 + excitement * 1.1) * 10) / 10,
    ...(research === null ? {} : { research }),
    ride: {
      group, excitement, intensity, nausea, capacity, rideSeconds, price,
      loadSeconds: Math.max(3, Math.round(capacity / 3)),
      unloadSeconds: Math.max(3, Math.round(capacity / 4)),
      breakdown: {
        baseChance: 0.01 + wild * 0.02,
        wearChance: 0.004 + wild * 0.008,
        repairSeconds: Math.round(16 + cost / 300),
        repairCost: Math.round(40 + cost * 0.04),
        serviceCost: Math.round(15 + cost * 0.012),
      },
    },
  };
}

type StallRow = [id: string, label: string, icon: string, need: StallNeed, cost: number, upkeep: number,
  price: number, value: number, restock: number, stock: number, fill: number, research: ResearchData | null, blurb: string, color: string];

const STALLS: readonly StallRow[] = [
  ["stall_food", "Burger Stall", "🍔", "hunger", 600, 20, 4, 5, 2, 40, 70, null, "Hot burgers for hungry guests. Restocked at midnight.", "#e8622a"],
  ["stall_drink", "Drinks Kiosk", "🥤", "thirst", 450, 15, 2, 3, 1, 50, 75, null, "Cold drinks for thirsty crowds.", "#2fb37a"],
  ["fac_toilet", "Toilets", "🚻", "toilet", 500, 20, 0, 1, 0, 200, 100, null, "Free, and badly missed when there aren't any.", "#4a8fc0"],
  ["fac_info", "Information Kiosk", "ℹ️", "info", 650, 25, 2, 3, 1, 60, 100, null, "Park maps for lost guests.", "#3a6fb0"],
  ["stall_icecream", "Ice Cream Cart", "🍦", "hunger", 500, 18, 3, 4, 1, 40, 35, { cost: 300, seconds: 40 }, "A sweet treat on a hot day.", "#f5a3c7"],
  ["stall_souvenir", "Souvenir Shop", "🎁", "souvenir", 800, 25, 6, 8, 3, 30, 100, { cost: 400, seconds: 50, after: "stall_icecream" }, "Trinkets guests grab on the way out.", "#8a5cd0"],
  ["fac_firstaid", "First Aid", "⛑️", "nausea", 900, 40, 0, 1, 0, 200, 80, { cost: 500, seconds: 60, after: "stall_souvenir" }, "Somewhere to sit down after one coaster too many.", "#e04848"],
  ["stall_coffee", "Coffee Kiosk", "☕", "thirst", 550, 18, 3, 4, 1, 50, 60, { cost: 350, seconds: 50, after: "fac_firstaid" }, "Hot coffee: keeps the grown-ups going.", "#8a5a3c"],
  ["stall_pizza", "Pizza Stall", "🍕", "hunger", 700, 22, 5, 6, 2, 40, 85, { cost: 450, seconds: 60, after: "stall_coffee" }, "Slices that fill a guest up.", "#e8a02a"],
  ["stall_balloon", "Balloon Cart", "🎈", "souvenir", 400, 12, 3, 4, 1, 40, 60, { cost: 300, seconds: 40, after: "stall_pizza" }, "Balloons bobbing over the crowd.", "#e85fa0"],
];

function stallEntry(row: StallRow): BuildableDef {
  const [id, label, icon, need, cost, upkeep, price, value, restock, stock, fill, research, blurb, color] = row;
  return {
    id, label, icon, cost, upkeep, blurb, color,
    trim: "#fff2cc",
    category: "stall",
    appeal: 1.5,
    footprint: 4,
    ...(research === null ? {} : { research }),
    stall: { need, price, value, restock, stock, fill },
  };
}

type SceneryRow = [id: string, label: string, icon: string, cost: number, footprint: number, radius: number, bonus: number,
  library: BuildableDef["libraryModel"] | null, research: ResearchData | null, blurb: string];

const NATURE = "quaternius-stylized-nature";
const CITY = "kaykit-city-builder";

/** A ride's charm from scenery in reach caps at this many points of appeal. */
export const THEME_CAP = 6;

const SCENERY: readonly SceneryRow[] = [
  ["deco_tree", "Oak Tree", "🌳", 40, 4, 10, 0.5, { id: `${NATURE}/CommonTree_1`, height: 6 }, null, "Shade and greenery for the rides around it."],
  ["deco_pine", "Pine Tree", "🌲", 40, 4, 10, 0.5, { id: `${NATURE}/Pine_2`, height: 7 }, null, "A tall pine to frame a ride."],
  ["deco_bush", "Flowering Bush", "🌺", 25, 4, 8, 0.35, { id: `${NATURE}/Bush_Common_Flowers`, height: 1.4 }, null, "Low colour along the queue lines."],
  ["deco_flowerbed", "Flower Bed", "🌷", 30, 4, 8, 0.45, null, null, "A splash of colour that lifts nearby rides."],
  ["deco_rock", "Boulder", "🪨", 20, 4, 8, 0.25, { id: `${NATURE}/Rock_Medium_1`, height: 1.6 }, null, "Natural rock for a rugged corner."],
  ["deco_bench", "Bench", "🪑", 60, 4, 8, 0.3, { id: `${CITY}/bench`, height: 1 }, null, "Somewhere for tired guests to sit."],
  ["deco_lamp", "Lamp Post", "💡", 50, 4, 8, 0.3, { id: `${CITY}/streetlight`, height: 4.2 }, null, "Keeps paths cheerful after dusk."],
  ["deco_bin", "Litter Bin", "🗑️", 45, 4, 8, 0.1, { id: `${CITY}/trash_A`, height: 1.1 }, null, "Guests drop less litter when there's a bin nearby."],
  ["deco_hedge", "Hedge", "🟩", 35, 4, 8, 0.3, null, null, "A clipped hedge segment; tiles end to end."],
  ["deco_fountain", "Fountain", "⛲", 600, 8, 16, 1.6, null, null, "A grand centrepiece that charms every ride around it."],
  ["deco_topiary", "Topiary", "🌿", 300, 4, 12, 1.0, null, { cost: 300, seconds: 40 }, "Sculpted hedges for a headline garden."],
  ["deco_statue", "Statue", "🗿", 900, 4, 16, 2.0, null, { cost: 600, seconds: 70, after: "deco_topiary" }, "A stone hero on a plinth."],
  ["deco_arch", "Themed Arch", "🎪", 700, 4, 14, 1.4, null, { cost: 500, seconds: 60, after: "deco_statue" }, "A bulb-lit arch over a ride's queue."],
  ["deco_flagpole", "Flagpole", "🚩", 120, 4, 10, 0.6, null, { cost: 200, seconds: 30, after: "deco_arch" }, "Pennants high over the park."],
];

function sceneryEntry(row: SceneryRow): BuildableDef {
  const [id, label, icon, cost, footprint, radius, bonus, library, research, blurb] = row;
  return {
    id, label, icon, cost, footprint, blurb,
    category: "scenery",
    upkeep: cost >= 300 ? Math.round(cost / 60) : 0,
    color: "#3f8f3a",
    trim: "#6b4a2a",
    appeal: Math.round(bonus * 10) / 10,
    theme: { radius, bonus },
    ...(library === null ? {} : { libraryModel: library }),
    ...(research === null ? {} : { research }),
  };
}

const OTHER: readonly BuildableDef[] = [
  {
    id: "track_piece", label: "Track Piece", category: "track", icon: "〰️", cost: 120, upkeep: 3, color: "#ff5a3c", trim: "#c9ccd6", appeal: 0.2, footprint: 4,
    blurb: "Snaps next to the coaster station or existing track. Every piece adds to the ride.",
  },
  {
    id: "path_walk", label: "Path", category: "path", icon: "▫️", cost: 10, upkeep: 0, color: "#c8bfa6", trim: "#a89e82", appeal: 0, footprint: 4,
    blurb: "Paved walkway from the gate. Shops open when a path runs past them. Click and drag to lay a line.",
  },
  {
    id: "path_queue", label: "Queue Line", category: "path", icon: "🚧", cost: 12, upkeep: 0, color: "#5b7fa6", trim: "#d8e2ee", appeal: 0, footprint: 4,
    blurb: "A railed queue from the path to a ride's entrance. Guests wait on it and put up with longer lines. Drag to lay.",
  },
  {
    id: "ride_entrance", label: "Ride Entrance", category: "path", icon: "🚪", cost: 100, upkeep: 0, color: "#2fb37a", trim: "#fff2cc", appeal: 0, footprint: 4,
    blurb: "Put it against a ride, with a path or queue line leading to it. A ride without one stays shut.",
  },
  {
    id: "ride_exit", label: "Ride Exit", category: "path", icon: "↗️", cost: 60, upkeep: 0, color: "#e2483d", trim: "#fff2cc", appeal: 0, footprint: 4,
    blurb: "Put it against a ride, opening onto a path. A ride without one stays shut.",
  },
  {
    id: "staff_janitor", label: "Handyman", category: "staff", icon: "🧹", cost: 300, upkeep: 60, color: "#2b6db0", trim: "#ffd24a", appeal: 0, footprint: 4,
    blurb: "Hire a handyman: sweeps litter and empties bins inside the patrol area around the post.", staff: { role: "handyman", cleaning: 26, patrol: 18 },
  },
  {
    id: "staff_mechanic", label: "Mechanic", category: "staff", icon: "🔧", cost: 500, upkeep: 90, color: "#4a5568", trim: "#ffb03a", appeal: 0, footprint: 4,
    blurb: "Hire a mechanic: inspects and services worn rides in the patrol area, and every repair goes quicker.", staff: { role: "mechanic", cleaning: 0, repair: 0.35, patrol: 22 },
    research: { cost: 600, seconds: 60 },
  },
  {
    id: "staff_entertainer", label: "Entertainer", category: "staff", icon: "🤡", cost: 400, upkeep: 70, color: "#d0508a", trim: "#ffd24a", appeal: 0, footprint: 4,
    blurb: "Hire an entertainer: guests in the patrol area cheer up and their wait in line feels shorter.", staff: { role: "entertainer", cleaning: 0, patrol: 16 },
  },
  {
    id: "staff_security", label: "Security Guard", category: "staff", icon: "👮", cost: 350, upkeep: 65, color: "#2c3e66", trim: "#c9ccd6", appeal: 0, footprint: 4,
    blurb: "Hire a guard: unhappy guests in the patrol area stop kicking over bins and trashing the paths.", staff: { role: "security", cleaning: 0, patrol: 20 },
  },
];

export const BUILDABLES: Record<string, BuildableDef> = Object.fromEntries(
  [...RIDES.map(rideEntry), ...STALLS.map(stallEntry), ...SCENERY.map(sceneryEntry), ...OTHER].map((def) => [def.id, def]),
);

export const BUILD_IDS: readonly string[] = Object.keys(BUILDABLES);

for (const def of Object.values(BUILDABLES)) {
  const after = def.research?.after;
  if (after !== undefined && BUILDABLES[after] === undefined) {
    throw new Error(`brightway-park: "${def.id}" researches after unknown "${after}"`);
  }
}

export function buildableDef(id: string): BuildableDef {
  const def = BUILDABLES[id];
  if (def === undefined) throw new Error(`brightway-park: unknown buildable "${id}"`);
  return def;
}

export const RIDE_GROUPS: readonly RideGroup[] = ["gentle", "thrill", "water", "transport", "coaster"];

export const RIDE_GROUP_LABEL: Record<RideGroup, string> = {
  gentle: "Gentle",
  thrill: "Thrill",
  water: "Water",
  transport: "Transport",
  coaster: "Coasters",
};

export const CATEGORY_ORDER: readonly BuildCategory[] = ["ride", "track", "stall", "scenery", "path", "land", "staff"];

export const CATEGORY_LABEL: Record<BuildCategory, string> = {
  ride: "Rides",
  track: "Coaster",
  stall: "Shops",
  scenery: "Scenery",
  path: "Paths",
  land: "Land",
  staff: "Staff",
};

export const CATEGORY_ICON: Record<BuildCategory, string> = {
  ride: "🎢",
  track: "〰️",
  stall: "🍔",
  scenery: "🌳",
  path: "▫️",
  land: "⛰️",
  staff: "🧹",
};
