/**
 * Everything the haunt can build, as data. A ride is its cycle, its Fright / Thrill / Dread, its
 * scare yield and its wear; a stall is what it sells the living and to which need; a scare prop is
 * the jolt it gives anyone who walks into its reach; atmosphere is the dread it spreads to the rides
 * nearby. `research` names the séance that channels a kind: a kind without one is on the palette
 * from the first night. The world declaration (`park.ts`) turns each entry into a kind, its actions
 * and its totals.
 */

export type BuildCategory = "ride" | "stall" | "prop" | "track" | "path" | "land" | "scenery" | "staff";

/** The ride families of the build palette and the séance table. */
export type RideGroup = "eerie" | "frenzy" | "tide" | "drift" | "coaster";

/** A visitor need a stall fills: every one is a fullness meter on the visitor (100 is fine). */
export type StallNeed = "hunger" | "thirst" | "souvenir" | "toilet" | "info" | "nausea";

/**
 * A ride's own cycle, ratings, yield and wear - content the shared ride sim reads as data. The sim
 * names its three ratings excitement, intensity and nausea; the haunt reads them as Fright (what the
 * living came for), Thrill (how hard it shakes them) and Dread (the unease they carry out).
 */
export interface RideData {
  group: RideGroup;
  /** Fright, 0-10: how much of what they came for a rider gets. */
  excitement: number;
  /** Thrill, 0-10: how hard it throws them; a rider wants one that fits their courage. */
  intensity: number;
  /** Dread, 0-10: the unease that rattles their composure afterwards. */
  nausea: number;
  rideSeconds: number;
  capacity: number;
  loadSeconds: number;
  unloadSeconds: number;
  /** Scare yield: the nerve a rider spends to board, harvested as ectoplasm. The haunt tunes it live. */
  price: number;
  /** Chance one completed cycle jams the ride, and what the repair costs. */
  breakdown: { baseChance: number; wearChance: number; repairSeconds: number; repairCost: number; serviceCost: number };
}

export interface StallData {
  need: StallNeed;
  /** Default nerve it takes; the haunt sets the live one. */
  price: number;
  /** What a visitor thinks it is worth: above this they refuse. */
  value: number;
  /** What one item costs to restock at noon, while the living are away. */
  restock: number;
  stock: number;
  /** How much of the need one visit fills. */
  fill: number;
}

/**
 * A scare prop: anyone living inside `radius` metres when it is ready jumps. Each jolt spends
 * `fright` of their nerve and wrings ectoplasm out of it (more in a chain). Skeptics shrug off any
 * prop below the skeptic line (`SKEPTIC_LINE`). It is ready again `cooldown` seconds later.
 */
export interface ScareData {
  radius: number;
  fright: number;
  cooldown: number;
  /** A poltergeist counts it among the things worth smashing. */
  breakable?: boolean;
  /** A drowned sailor's fog. */
  fog?: boolean;
  /** A ghost child's toy. */
  toy?: boolean;
}

/** A séance: what it costs to channel and how long it takes, after the one before it. */
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
  /** Running cost per night (wages for staff posts). */
  upkeep: number;
  color: string;
  trim: string;
  /** Base appeal to the living; atmosphere nearby adds to a ride's. */
  appeal: number;
  /** Side of the square it covers, in metres. */
  footprint: number;
  research?: ResearchData;
  ride?: RideData;
  stall?: StallData;
  scare?: ScareData;
  /** A hire: the post is the middle of this one's patrol area. */
  staff?: { role: StaffRole; cleaning: number; repair?: number; patrol: number };
  /** Atmosphere: how far its dread reaches, in metres, and how much it adds to each ride in reach. */
  theme?: { radius: number; bonus: number };
  /** A model from the engine's asset library instead of the haunt's own authored GLB. */
  libraryModel?: { id: string; height?: number } | undefined;
}

/** What a hired spook does on patrol. */
export type StaffRole = "handyman" | "mechanic" | "entertainer" | "security";

/** Props weaker than this are a cheap trick to a skeptic. */
export const SKEPTIC_LINE = 5;

type RideRow = [id: string, label: string, icon: string, group: RideGroup, cost: number, upkeep: number, footprint: number,
  fright: number, thrill: number, dread: number, capacity: number, rideSeconds: number, price: number,
  research: ResearchData | null, blurb: string];

const COLORS: Record<RideGroup, [string, string]> = {
  eerie: ["#6b4f9e", "#9ff5d8"],
  frenzy: ["#9e3a52", "#e8d9b0"],
  tide: ["#2f7f8a", "#c9fff0"],
  drift: ["#46607a", "#ffc46b"],
  coaster: ["#4a3a78", "#ff7a5c"],
};

/** Eerie 8, frenzy 8, tide 4, drift 3, coasters 5: twenty-eight rides. */
const RIDES: readonly RideRow[] = [
  ["ride_carousel", "Upside-Down Carousel", "🎠", "eerie", 1200, 40, 8, 3.2, 1.0, 0.6, 12, 14, 2, null, "The horses gallop on the ceiling and the riders hang beneath. The organ plays it backwards."],
  ["ride_helter", "Bell Tower Slide", "🔔", "eerie", 900, 30, 8, 3.0, 2.0, 0.8, 6, 10, 1, null, "Climb the drowned church's tower and spiral down while the bell tolls for somebody."],
  ["ride_teacups", "Séance Teacups", "🫖", "eerie", 1400, 45, 8, 3.6, 2.6, 2.6, 12, 14, 2, { cost: 500, seconds: 24 }, "Nobody turns the wheel. The cups spin anyway, faster when you ask them to stop."],
  ["ride_maze", "Hall of Wrong Mirrors", "🪞", "eerie", 1600, 25, 12, 3.4, 0.5, 0.2, 16, 30, 1, { cost: 450, seconds: 50, after: "ride_teacups" }, "Your reflection is always a second late. Sometimes it doesn't follow you out."],
  ["ride_vintage", "Hearse Rally", "⚰️", "eerie", 2400, 60, 12, 4.0, 1.2, 0.6, 8, 22, 2, { cost: 800, seconds: 70, after: "ride_maze" }, "Vintage hearses around a figure-eight. The passengers in the back never ask to stop."],
  ["ride_ferris", "The Wheel That Doesn't Stop", "🎡", "eerie", 2600, 70, 12, 4.2, 0.9, 0.5, 16, 24, 2, { cost: 900, seconds: 80, after: "ride_vintage" }, "It has turned since 1952. It lets you off when it decides you are ready."],
  ["ride_haunted", "Ghost Train", "🚃", "eerie", 2400, 70, 12, 4.8, 2.5, 1.0, 8, 20, 3, null, "Little carts rattle through the crooked house. They come out with the same number of seats, not always the same riders."],
  ["ride_obs", "Lighthouse of the Lost", "🗼", "eerie", 3800, 90, 8, 4.5, 0.8, 0.4, 20, 30, 3, { cost: 1300, seconds: 100, after: "ride_ferris" }, "A cabin creeps up the old lighthouse while its lamp searches the sea for a ship that sank."],
  ["ride_bumper", "Bumper Coffins", "🪦", "frenzy", 2200, 60, 12, 4.4, 3.0, 1.5, 12, 16, 2, { cost: 700, seconds: 30 }, "Lids rattle, coffins collide. The empty ones drive themselves."],
  ["ride_swings", "Wailing Swings", "🎐", "frenzy", 2800, 70, 12, 5.0, 4.2, 2.8, 16, 18, 3, { cost: 900, seconds: 70, after: "ride_bumper" }, "Chairs fly out on rusted chains while the canopy shrieks louder than the riders."],
  ["ride_pirate", "The Flying Dutchman", "🏴‍☠️", "frenzy", 3000, 75, 12, 5.4, 4.8, 3.6, 16, 20, 3, { cost: 1000, seconds: 80, after: "ride_swings" }, "A wrecked galleon swinging higher and higher. Its crew still rows."],
  ["ride_gokarts", "Phantom Grand Prix", "🏎️", "frenzy", 3600, 90, 16, 5.6, 3.6, 1.2, 8, 30, 4, { cost: 1200, seconds: 90, after: "ride_pirate" }, "Race the 1931 champion round his own track. He has never lost, and never stopped."],
  ["ride_simulator", "Possession Pod", "🛸", "frenzy", 3400, 100, 8, 4.8, 5.4, 6.2, 8, 18, 4, { cost: 1200, seconds: 90, after: "ride_gokarts" }, "A capsule that throws you around. Something else is holding the controls."],
  ["ride_topspin", "Head Spinner", "🔄", "frenzy", 4200, 110, 8, 6.2, 7.2, 6.0, 12, 18, 4, { cost: 1500, seconds: 110, after: "ride_simulator" }, "A gondola flipped end over end until the riders' heads keep spinning after it stops."],
  ["ride_enterprise", "Coven Wheel", "🌀", "frenzy", 4600, 120, 12, 6.4, 7.6, 6.8, 16, 20, 4, { cost: 1700, seconds: 120, after: "ride_topspin" }, "Thirteen pods whirled upright in a circle of candles."],
  ["ride_dropzone", "The Long Fall", "⬇️", "frenzy", 5200, 130, 8, 6.8, 8.4, 4.0, 12, 14, 5, { cost: 2000, seconds: 140, after: "ride_enterprise" }, "The old hotel's lift shaft. It goes up slowly. It remembers how it came down."],
  ["ride_boats", "Ferryman's Rowboats", "🛶", "tide", 1800, 40, 12, 3.8, 1.0, 0.8, 8, 30, 2, null, "Rowboats on a black pond. The ferryman rows; the fare is collected later."],
  ["ride_logflume", "Coffin Flume", "🪵", "tide", 5200, 120, 16, 5.8, 4.2, 2.0, 8, 30, 4, { cost: 1600, seconds: 120 }, "Coffins along a raised trough of cold seawater, then the big plunge."],
  ["ride_rapids", "Shipwreck Rapids", "🌊", "tide", 6000, 140, 16, 6.0, 4.6, 3.0, 12, 32, 4, { cost: 1900, seconds: 140, after: "ride_logflume" }, "Lifeboats bounced through the rocks that sank the Mary Ellen."],
  ["ride_splash", "Sea-Wraith Splash", "💦", "tide", 6800, 150, 16, 6.6, 5.2, 2.4, 10, 28, 5, { cost: 2200, seconds: 160, after: "ride_rapids" }, "A tall lift and a drop into the arms of whatever lives under the pier."],
  ["ride_train", "Midnight Express", "🚂", "drift", 3000, 60, 16, 3.6, 0.6, 0.4, 24, 40, 2, { cost: 800, seconds: 70 }, "The funeral railway still runs its last service round the edge of the park."],
  ["ride_chairlift", "Bat Lift", "🦇", "drift", 3600, 70, 12, 4.0, 1.4, 0.6, 12, 34, 2, { cost: 1100, seconds: 90, after: "ride_train" }, "Chairs on a cable between two towers. The bats sleep on the cable, mostly."],
  ["ride_monorail", "Spectral Monorail", "🚝", "drift", 5400, 110, 16, 4.2, 0.8, 0.4, 24, 40, 3, { cost: 1800, seconds: 130, after: "ride_chairlift" }, "A glowing train on a beam above the paths. It runs on no electricity at all."],
  ["ride_coaster", "Bone Coaster", "🎢", "coaster", 2000, 50, 8, 0, 0, 0, 12, 20, 4, null, "Build it yourself: a station, then track piece by piece. Longer, steeper, faster - more Fright."],
  ["ride_junior", "Little Terrors", "🐛", "coaster", 4500, 110, 16, 5.0, 4.0, 2.2, 12, 30, 4, { cost: 1500, seconds: 110 }, "A coaster for the small and brave: low hills, gentle turns, one thing waiting at the bottom."],
  ["ride_mouse", "Wild Rat", "🐀", "coaster", 6200, 140, 16, 6.4, 6.4, 4.4, 8, 32, 5, { cost: 2100, seconds: 150, after: "ride_junior" }, "Single cars whipped through switchbacks the way rats run the walls."],
  ["ride_looping", "Banshee Loop", "➰", "coaster", 9800, 220, 16, 7.6, 8.2, 6.0, 20, 36, 6, { cost: 3200, seconds: 200, after: "ride_mouse" }, "Steel track, a lift hill and a vertical loop timed to her scream."],
  ["ride_inverted", "Night Gaunt", "🦇", "coaster", 12000, 260, 20, 8.0, 8.6, 6.4, 24, 40, 7, { cost: 4000, seconds: 240, after: "ride_looping" }, "Feet dangling under the track through a loop and a corkscrew, like being carried off."],
];

/** Repairs, servicing and the odds of a jam grow with the ride's size and wildness. */
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
  ["stall_food", "Cursed Candy Floss", "🍭", "hunger", 600, 20, 4, 5, 2, 40, 70, null, "Spun from something pink. Every bite tastes of a birthday you never had.", "#c25a8e"],
  ["stall_drink", "Witch's Brew", "🧪", "thirst", 450, 15, 2, 3, 1, 50, 75, null, "Green, bubbling and cold as a crypt. Quenches thirst; asks nothing back. Yet.", "#3f9a7a"],
  ["fac_toilet", "Outhouse", "🚪", "toilet", 500, 20, 0, 1, 0, 200, 100, null, "Free, and the knocking from inside the next cubicle is probably fine.", "#4a5f78"],
  ["fac_info", "Fortune Teller", "🔮", "info", 650, 25, 2, 3, 1, 60, 100, null, "Madame Vesna tells lost visitors where to go. Mostly away.", "#6d4aa0"],
  ["stall_icecream", "Grave-Dirt Sundaes", "🍨", "hunger", 500, 18, 3, 4, 1, 40, 35, { cost: 300, seconds: 12 }, "Chocolate crumb, gummy worms, a little marble headstone on top.", "#8a6a8a"],
  ["stall_souvenir", "Cursed Curios", "🧿", "souvenir", 800, 25, 6, 8, 3, 30, 100, { cost: 400, seconds: 50, after: "stall_icecream" }, "Snow globes where it is always night, and a doll that follows you home.", "#7a4fb0"],
  ["fac_firstaid", "Smelling-Salts Tent", "💊", "nausea", 900, 40, 0, 1, 0, 200, 80, { cost: 500, seconds: 60, after: "stall_souvenir" }, "Somewhere to sit and stop shaking after one fright too many.", "#a04848"],
  ["stall_coffee", "Coffin Coffee", "☕", "thirst", 550, 18, 3, 4, 1, 50, 60, { cost: 350, seconds: 50, after: "fac_firstaid" }, "Black as the grave and served from one. Keeps the brave awake till dawn.", "#5a4030"],
  ["stall_pizza", "Toffee-Apple Barrow", "🍎", "hunger", 700, 22, 5, 6, 2, 40, 85, { cost: 450, seconds: 60, after: "stall_coffee" }, "Glossy red apples on sticks. Don't look at the core.", "#b83a3a"],
  ["stall_balloon", "Black Balloon Cart", "🎈", "souvenir", 400, 12, 3, 4, 1, 40, 60, { cost: 300, seconds: 40, after: "stall_pizza" }, "Balloons that bob against the wind. A ghost child's favourite thing.", "#2a2238"],
];

function stallEntry(row: StallRow): BuildableDef {
  const [id, label, icon, need, cost, upkeep, price, value, restock, stock, fill, research, blurb, color] = row;
  return {
    id, label, icon, cost, upkeep, blurb, color,
    trim: "#e8d9b0",
    category: "stall",
    appeal: 1.5,
    footprint: 4,
    ...(research === null ? {} : { research }),
    stall: { need, price, value, restock, stock, fill },
  };
}

type PropRow = [id: string, label: string, icon: string, cost: number, scare: ScareData,
  library: BuildableDef["libraryModel"] | null, research: ResearchData | null, blurb: string];

const FANTASY = "quaternius-fantasy-props";

/** Scare props: cheap jolts and proper frights. Skeptics ignore anything below `SKEPTIC_LINE`. */
const PROPS: readonly PropRow[] = [
  ["prop_portrait", "Moving Portrait", "🖼️", 180, { radius: 6, fright: 2, cooldown: 7 }, null, null, "Great-Aunt Agatha's eyes follow you. Then her head does."],
  ["prop_coldspot", "Cold Spot", "❄️", 140, { radius: 5, fright: 2, cooldown: 5 }, null, null, "A patch of path where your breath turns to frost and something brushes past."],
  ["prop_coffin", "Jack-in-the-Coffin", "⚰️", 260, { radius: 6, fright: 4, cooldown: 9, toy: true }, null, null, "Wind the handle, hear the tune, wait for it... A ghost child's favourite toy."],
  ["prop_fogger", "Fog Cauldron", "🌫️", 320, { radius: 8, fright: 3, cooldown: 8, fog: true }, { id: `${FANTASY}/Cauldron`, height: 1.3 }, null, "Belches sea fog across the paths. Things move inside it. A drowned sailor's comfort."],
  ["prop_shelf", "Crockery Shelf", "🍽️", 220, { radius: 6, fright: 3, cooldown: 8, breakable: true }, { id: `${FANTASY}/Shelf_Small_Bottles`, height: 2 }, null, "Plates fly off one by one. A poltergeist cannot resist it."],
  ["prop_flicker", "Flickering Lamp", "💡", 360, { radius: 9, fright: 5, cooldown: 10 }, null, { cost: 350, seconds: 30 }, "Lights the path... until it doesn't. Every time it comes back on, something is closer."],
  ["prop_vase", "Possessed Vase", "🏺", 420, { radius: 7, fright: 5, cooldown: 11, breakable: true }, { id: `${FANTASY}/Vase_4`, height: 1.2 }, { cost: 400, seconds: 50, after: "prop_flicker" }, "Floats, wobbles, shatters, and is back on its plinth by the next group."],
  ["prop_candles", "Candelabra of Whispers", "🕯️", 560, { radius: 9, fright: 7, cooldown: 12 }, { id: `${FANTASY}/CandleStick_Stand`, height: 2 }, { cost: 600, seconds: 70, after: "prop_vase" }, "Each candle whispers one visitor's name. The skeptics hear theirs too."],
];

function propEntry(row: PropRow): BuildableDef {
  const [id, label, icon, cost, scare, library, research, blurb] = row;
  return {
    id, label, icon, cost, blurb,
    category: "prop",
    upkeep: Math.round(cost / 30),
    color: "#5fd4b8",
    trim: "#2a2238",
    appeal: Math.round(scare.fright * 0.2 * 10) / 10,
    footprint: 4,
    scare,
    // A prop leaves a little dread behind, which lifts the rides around it like atmosphere does.
    theme: { radius: scare.radius, bonus: Math.round(scare.fright * 0.08 * 10) / 10 },
    ...(library === null ? {} : { libraryModel: library }),
    ...(research === null ? {} : { research }),
  };
}

type SceneryRow = [id: string, label: string, icon: string, cost: number, footprint: number, radius: number, bonus: number,
  library: BuildableDef["libraryModel"] | null, research: ResearchData | null, blurb: string];

const NATURE = "quaternius-stylized-nature";
const CITY = "kaykit-city-builder";

/** A ride's dread from atmosphere in reach caps at this many points of appeal. */
export const THEME_CAP = 6;

const SCENERY: readonly SceneryRow[] = [
  ["deco_tree", "Dead Oak", "🌳", 40, 4, 10, 0.5, { id: `${NATURE}/DeadTree_1`, height: 6 }, null, "Bare black branches against the moon. The rides around it feel colder."],
  ["deco_pine", "Twisted Tree", "🌲", 40, 4, 10, 0.5, { id: `${NATURE}/TwistedTree_1`, height: 6 }, null, "It grew this way on purpose."],
  ["deco_bush", "Toadstool Ring", "🍄", 25, 4, 8, 0.35, { id: `${NATURE}/Mushroom_Common`, height: 1.2 }, null, "Step inside and lose an hour. Low dread along the queue lines."],
  ["deco_gravestone", "Gravestone", "🪦", 30, 4, 8, 0.45, null, null, "Names worn smooth. A pale bride counts them."],
  ["deco_rock", "Standing Stone", "🪨", 20, 4, 8, 0.25, { id: `${NATURE}/Rock_Medium_1`, height: 1.6 }, null, "Older than the park. Older than the town."],
  ["deco_bench", "Mourner's Bench", "🪑", 60, 4, 8, 0.3, { id: `${CITY}/bench`, height: 1 }, null, "Somewhere for the living to sit. Someone always sits beside them."],
  ["deco_lamp", "Gas Lantern", "🏮", 50, 4, 8, 0.3, null, null, "A warm amber pool on the path. The lighthouse keeper tends them."],
  ["deco_bin", "Rubbish Barrel", "🛢️", 45, 4, 8, 0.1, { id: `${FANTASY}/Barrel`, height: 1.1 }, null, "The living drop less litter when there's a barrel nearby."],
  ["deco_fence", "Wrought-Iron Fence", "⛓️", 35, 4, 8, 0.3, null, null, "Spiked railings; tiles end to end."],
  ["deco_bones", "Bone Pile", "💀", 70, 4, 8, 0.4, { id: "quaternius-low-poly-desert-assets/Bones", height: 0.7 }, null, "Not from the gift shop."],
  ["deco_pumpkins", "Pumpkin Lanterns", "🎃", 90, 4, 10, 0.5, { id: "quaternius-low-poly-food-pack/Pumpkin", height: 0.9 }, null, "Carved grins that glow by themselves."],
  ["deco_fountain", "Weeping Fountain", "⛲", 600, 8, 16, 1.6, null, null, "A grand centrepiece that cries black water and chills every ride around it."],
  ["deco_topiary", "Thorn Topiary", "🌿", 300, 4, 12, 1.0, null, { cost: 300, seconds: 12 }, "Hedges clipped into shapes that weren't there yesterday."],
  ["deco_statue", "Weeping Statue", "🗿", 900, 4, 16, 2.0, null, { cost: 600, seconds: 70, after: "deco_topiary" }, "Don't blink."],
  ["deco_arch", "Skull Arch", "☠️", 700, 4, 14, 1.4, null, { cost: 500, seconds: 60, after: "deco_statue" }, "A lantern-lit arch of bone over a ride's queue."],
  ["deco_flagpole", "Tattered Pennant", "🚩", 120, 4, 10, 0.6, null, { cost: 200, seconds: 30, after: "deco_arch" }, "Rags of the old fair's flag, flying against the wind."],
];

function sceneryEntry(row: SceneryRow): BuildableDef {
  const [id, label, icon, cost, footprint, radius, bonus, library, research, blurb] = row;
  return {
    id, label, icon, cost, footprint, blurb,
    category: "scenery",
    upkeep: cost >= 300 ? Math.round(cost / 60) : 0,
    color: "#3a4a44",
    trim: "#4a3a30",
    appeal: Math.round(bonus * 10) / 10,
    theme: { radius, bonus },
    ...(library === null ? {} : { libraryModel: library }),
    ...(research === null ? {} : { research }),
  };
}

const OTHER: readonly BuildableDef[] = [
  {
    id: "track_piece", label: "Bone Track", category: "track", icon: "〰️", cost: 120, upkeep: 3, color: "#e8d9b0", trim: "#6b4f9e", appeal: 0.2, footprint: 4,
    blurb: "Snaps next to the coaster station or existing track. Every piece adds to the ride.",
  },
  {
    id: "path_walk", label: "Cobbled Path", category: "path", icon: "▫️", cost: 10, upkeep: 0, color: "#6a6478", trim: "#4a4458", appeal: 0, footprint: 4,
    blurb: "Old cobbles from the gate. Stalls open when a path runs past them. Click and drag to lay a line.",
  },
  {
    id: "path_queue", label: "Queue Line", category: "path", icon: "🚧", cost: 12, upkeep: 0, color: "#4a5f78", trim: "#c9d2e0", appeal: 0, footprint: 4,
    blurb: "A railed queue from the path to a ride's entrance. The living wait on it and put up with longer lines. Drag to lay.",
  },
  {
    id: "ride_entrance", label: "Ride Entrance", category: "path", icon: "🚪", cost: 100, upkeep: 0, color: "#3f9a7a", trim: "#e8d9b0", appeal: 0, footprint: 4,
    blurb: "Put it against a ride, with a path or queue line leading to it. A ride without one stays shut.",
  },
  {
    id: "ride_exit", label: "Ride Exit", category: "path", icon: "↗️", cost: 60, upkeep: 0, color: "#9e3a52", trim: "#e8d9b0", appeal: 0, footprint: 4,
    blurb: "Put it against a ride, opening onto a path. A ride without one stays shut.",
  },
  {
    id: "staff_janitor", label: "Ghoul Groundskeeper", category: "staff", icon: "🧟", cost: 300, upkeep: 60, color: "#4f6b4a", trim: "#ffc46b", appeal: 0, footprint: 4,
    blurb: "Raise a ghoul: it sweeps the living's litter and empties barrels inside the patrol area around its grave.", staff: { role: "handyman", cleaning: 26, patrol: 18 },
  },
  {
    id: "staff_mechanic", label: "Gremlin Tinker", category: "staff", icon: "🔧", cost: 500, upkeep: 90, color: "#5a6a3a", trim: "#ffb03a", appeal: 0, footprint: 4,
    blurb: "Bind a gremlin: it un-jams rides that seize up, and tinkers with worn rides in its patrol area.", staff: { role: "mechanic", cleaning: 0, repair: 0.35, patrol: 22 },
  },
  {
    id: "staff_entertainer", label: "Phantom Barker", category: "staff", icon: "🎩", cost: 400, upkeep: 70, color: "#6b4f9e", trim: "#ffc46b", appeal: 0, footprint: 4,
    blurb: "Summon a barker: the living in its patrol area cheer up and their wait in line feels shorter.", staff: { role: "entertainer", cleaning: 0, patrol: 16 },
  },
  {
    id: "staff_security", label: "Gargoyle Sentry", category: "staff", icon: "🗿", cost: 350, upkeep: 65, color: "#5a5868", trim: "#c9ccd6", appeal: 0, footprint: 4,
    blurb: "Wake a gargoyle: unhappy visitors in its patrol area stop smashing barrels, and ghost hunters' cameras fail when it watches.", staff: { role: "security", cleaning: 0, patrol: 20 },
  },
];

export const BUILDABLES: Record<string, BuildableDef> = Object.fromEntries(
  [...RIDES.map(rideEntry), ...STALLS.map(stallEntry), ...PROPS.map(propEntry), ...SCENERY.map(sceneryEntry), ...OTHER].map((def) => [def.id, def]),
);

export const BUILD_IDS: readonly string[] = Object.keys(BUILDABLES);

for (const def of Object.values(BUILDABLES)) {
  const after = def.research?.after;
  if (after !== undefined && BUILDABLES[after] === undefined) {
    throw new Error(`hauntworks: "${def.id}" is channelled after unknown "${after}"`);
  }
}

/** The buildable `id` names, or undefined for an id the haunt does not know (an old save, a typo). */
export function findBuildable(id: string): BuildableDef | undefined {
  return BUILDABLES[id];
}

export function buildableDef(id: string): BuildableDef {
  const def = findBuildable(id);
  if (def === undefined) throw new Error(`hauntworks: unknown buildable "${id}"`);
  return def;
}

export const RIDE_GROUPS: readonly RideGroup[] = ["eerie", "frenzy", "tide", "drift", "coaster"];

export const RIDE_GROUP_LABEL: Record<RideGroup, string> = {
  eerie: "Eerie",
  frenzy: "Frenzy",
  tide: "Pier & Tide",
  drift: "Drifting",
  coaster: "Screamers",
};

export const CATEGORY_ORDER: readonly BuildCategory[] = ["ride", "track", "prop", "stall", "scenery", "path", "land", "staff"];

export const CATEGORY_LABEL: Record<BuildCategory, string> = {
  ride: "Rides",
  track: "Coaster",
  prop: "Scares",
  stall: "Stalls",
  scenery: "Gloom",
  path: "Paths",
  land: "Land",
  staff: "Spooks",
};

export const CATEGORY_ICON: Record<BuildCategory, string> = {
  ride: "🎢",
  track: "〰️",
  prop: "👻",
  stall: "🍭",
  scenery: "🪦",
  path: "▫️",
  land: "⛰️",
  staff: "🧟",
};

/** How a ride's three numbers read to the player. */
export function rideRatingsLine(ride: Pick<RideData, "excitement" | "intensity" | "nausea">): string {
  return `Fright ${ride.excitement.toFixed(1)} · Thrill ${ride.intensity.toFixed(1)} · Dread ${ride.nausea.toFixed(1)}`;
}
