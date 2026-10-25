/**
 * Placeable decor + furniture for the Store (single "Decor" tab).
 * 3D assets reuse existing GLB paths via worldModelCatalog aliases.
 */

export const DECOR_CATALOG = [
  {
    id: "neon_sign",
    label: "Neon Sign",
    description: "Custom glow tubing for your lab logo. Investors notice the vibe before the pitch deck.",
    price: 140,
    tags: ["wall", "neon", "branding"],
  },
  {
    id: "llmville_banner",
    label: "LLMville Banner",
    description: "A fabric drop with the city skyline print. Makes a garage feel like a campus.",
    price: 110,
    tags: ["wall", "branding"],
  },
  {
    id: "holo_poster",
    label: "Holo Poster",
    description: "Animated benchmark leaderboard on a slim stand. Flex metrics without saying a word.",
    price: 120,
    tags: ["display", "benchmarks"],
  },
  {
    id: "motivational_poster",
    label: "Move Fast Poster",
    description: "Giant letters that say ship. Morale buff for anyone walking past the rack row.",
    price: 75,
    tags: ["wall", "poster"],
  },
  {
    id: "ethernet_art_display",
    label: "Cable Art Panel",
    description: "Rainbow patch cables arranged like modern art. Surprisingly calming during outages.",
    price: 95,
    tags: ["wall", "geek"],
  },
  {
    id: "potted_plant",
    label: "Desk Plant",
    description: "A stubborn succulent in ceramic. Adds oxygen and the illusion of work-life balance.",
    price: 95,
    tags: ["plant", "cozy"],
  },
  {
    id: "office_plant_large",
    label: "Floor Plant",
    description: "Tall leafy friend for the corner. Hides empty pizza boxes during stream demos.",
    price: 165,
    tags: ["plant", "large"],
  },
  {
    id: "fiber_optic_tree",
    label: "Fiber Tree",
    description: "Blinking fiber strands in a planter. Cyberpunk bonsai for the inference lounge.",
    price: 185,
    tags: ["plant", "light"],
  },
  {
    id: "cable_tidy_bin",
    label: "Cable Tidy Bin",
    description: "Labeled bin for spare Cat6 and guilt. Cleaner floor, fewer trip hazards.",
    price: 55,
    tags: ["utility", "organization"],
  },
  {
    id: "beanbag_corner",
    label: "Beanbag Corner",
    description: "Soft seating for late-night tuning sessions and accidental naps between epochs.",
    price: 160,
    tags: ["seating", "cozy"],
  },
  {
    id: "folding_chair",
    label: "Folding Chair",
    description: "Metal frame, burnt-orange seat. The universal symbol of a startup that ships.",
    price: 45,
    tags: ["seating", "budget"],
  },
  {
    id: "rug_corner",
    label: "Corner Rug",
    description: "Low pile, hides scuffs, defines the chill zone away from spinning fans.",
    price: 130,
    tags: ["floor", "cozy"],
  },
  {
    id: "yoga_mat_corner",
    label: "Stretch Mat",
    description: "Foam mat for wrist stretches between deploys. Your tendons will thank you.",
    price: 40,
    tags: ["floor", "wellness"],
  },
  {
    id: "coffee_cart",
    label: "Coffee Cart",
    description: "Rolling espresso station with mug hooks. Caffeine delivery for the operator team.",
    price: 210,
    tags: ["utility", "coffee"],
  },
  {
    id: "snack_fridge",
    label: "Snack Fridge",
    description: "Mini fridge humming next to the racks. Cold drinks and labeled meal prep boxes.",
    price: 240,
    tags: ["utility", "kitchen"],
  },
  {
    id: "energy_drink_crate",
    label: "Energy Drink Crate",
    description: "Stacked cans in a wire crate. Emergency inference fuel, not a lifestyle choice.",
    price: 65,
    tags: ["utility", "snacks"],
  },
  {
    id: "side_table",
    label: "Side Table",
    description: "Round top, steel legs. Holds notebooks, adapters, and one very important mug.",
    price: 85,
    tags: ["furniture", "table"],
  },
  {
    id: "whiteboard_wall",
    label: "Whiteboard Wall",
    description: "Full-height board for architecture sketches, loss curves, and alignment doodles.",
    price: 180,
    tags: ["wall", "planning"],
  },
  {
    id: "monitor_stand",
    label: "Monitor Riser",
    description: "Raises the battle station to eye level. Ergonomics count when you live in tab twelve.",
    price: 70,
    tags: ["desk", "ergonomic"],
  },
  {
    id: "bookshelf_unit",
    label: "Bookshelf",
    description: "Wood shelves with textbooks, spare boxes, and a few trophies you haven't earned yet.",
    price: 195,
    tags: ["storage", "wall"],
  },
  {
    id: "trophy_shelf",
    label: "Trophy Shelf",
    description: "Narrow ledge for hackathon mugs and a dusty participation ribbon. Room to grow.",
    price: 125,
    tags: ["display", "shelf"],
  },
  {
    id: "server_plushie",
    label: "Server Plushie",
    description: "Chibi rack mascot with fan-blade arms. Morale item for the team Slack channel.",
    price: 50,
    tags: ["novelty", "cozy"],
  },
  {
    id: "wall_clock",
    label: "Wall Clock",
    description: "Analog clock that ticks loud enough to hear over coil whine. Time is money.",
    price: 60,
    tags: ["wall", "utility"],
  },
  {
    id: "desk_lamp",
    label: "Desk Lamp",
    description: "Articulated arm with warm LED. For reading datasheets when the overhead lights buzz.",
    price: 90,
    tags: ["lighting", "desk"],
  },
] as const;

export type DecorCatalogItem = (typeof DECOR_CATALOG)[number];

export type DecorBuildItemId = DecorCatalogItem["id"];

export const DECOR_BUILD_ITEM_ID_VALUES = DECOR_CATALOG.map((item) => item.id) as [
  DecorBuildItemId,
  DecorBuildItemId,
  ...DecorBuildItemId[],
];
