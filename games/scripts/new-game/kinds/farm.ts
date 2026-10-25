/**
 * Farm: a cozy life sim. Plant plots by your cottage, crops grow on the in-world clock, fish at the
 * water with a timing bar, sell at the stall, spend at the village market on seeds, a better rod and
 * more land, help the villagers with their requests and sleep to end the day. Themes are plain data
 * rows; the idea's words pick one. New themes are new rows here.
 */
import type { ModelRef, WorldWord } from "../template/common/src/game/ideaShape";
import type { Idea } from "../template/farm/src/game/kindShape";
import { cluster, forest, grove, lake, patch, trail, wilds, town, type Dressing, type TownLook } from "../world/dress";
import type { Layout, Spot } from "../world/layout";
import { beats, flowAssertText, nameFor, pickTheme } from "./shared";
import type { Flow, KindModule } from "./types";

type Theme = Omit<Idea, "kind" | "id" | "spec" | "name" | "pitch" | "beats" | "world" | "guide"> & {
  words: readonly string[];
  names: readonly string[];
  /** Beat titles and pitches, one per request; goals come from the theme's own crops and water. */
  story: readonly { title: string; pitch: string }[];
  world: Omit<WorldWord, "sky"> & { haze: number };
  dressing: Dressing;
  townLook: TownLook;
  /** How big the water is: a bay for a fishing village, a pond for a valley. */
  waterRadius: number;
  /** Coins to earn for the festival. */
  festival: number;
};

const NATURE = "/models/quaternius-stylized-nature";
const VILLAGE = "/models/quaternius-medieval-village";
const LR = "/models/lantern-reach";

const crop = (id: string, label: string, seed: number, hours: number, price: number, unlock: number, sprout: ModelRef, ripe: ModelRef, yieldCount = 1) => ({ id, label, seed, hours, price, yield: yieldCount, unlock, sprout, ripe });

const SPROUT: ModelRef = { model: `${NATURE}/Grass_Common_Short.glb`, height: 0.35, tint: "#b6e07a" };
const SPROUT_2: ModelRef = { model: `${NATURE}/Clover_2.glb`, height: 0.35 };

const UPGRADES: Idea["upgrades"] = [
  { id: "rod", label: "Fishing rod", does: "wider green, quicker bites", cost: 60, levels: 3 },
  { id: "land", label: "More land", does: "clears another row of plots", cost: 80, levels: 3 },
];

const THEMES: readonly Theme[] = [
  {
    words: ["fishing", "fish", "fisher", "fisherman", "sea", "coast", "coastal", "harbor", "harbour", "boat", "boats", "pier", "dock", "bay", "shore", "beach", "lake", "seaside"],
    names: ["Saltwick", "Gull Harbor", "Little Tidewell", "Driftwood Cove"],
    tagline: "Grow a garden, cast a line, and settle into the slow life by the sea.",
    kit: "paper",
    look: "cinematic",
    mood: "golden",
    accent: "#e9a24d",
    ground: { material: "grass", low: "#5d7a3a", high: "#9aa863" },
    currency: { id: "coins", label: "Coins", start: 30 },
    hero: { model: `${LR}/players/ranger.glb`, height: 1.8, label: "You" },
    home: { label: "Cottage", model: { model: `${LR}/settlements/settlement-3.glb`, height: 7 } },
    stall: { label: "Fish cart", model: { model: `${VILLAGE}/Prop_Wagon.glb`, height: 1.8 } },
    market: { label: "Harbor market", town: "the harbor", model: { model: `${LR}/settlements/market-cobbles.glb` }, opens: 6, closes: 20 },
    water: { label: "Bay", spot: "Fishing rock" },
    crops: [
      crop("turnip", "Turnip", 4, 5, 11, 0, SPROUT, { model: `${NATURE}/Plant_1.glb`, height: 0.8 }),
      crop("cabbage", "Cabbage", 8, 9, 22, 40, SPROUT_2, { model: `${NATURE}/Bush_Common.glb`, height: 1 }),
      crop("sunflower", "Sunflower", 14, 14, 40, 90, SPROUT_2, { model: `${NATURE}/Flower_4_Group.glb`, height: 1.3 }),
      crop("berry", "Sea berry", 20, 20, 30, 150, SPROUT, { model: `${NATURE}/Bush_Common_Flowers.glb`, height: 0.9 }, 3),
    ],
    fish: [
      { id: "sardine", label: "Sardine", price: 7, weight: 5, after: 0, drift: 0 },
      { id: "mackerel", label: "Mackerel", price: 13, weight: 3, after: 1, drift: 0.05 },
      { id: "seabass", label: "Sea bass", price: 28, weight: 2, after: 3, drift: 0.12 },
      { id: "whiskers", label: "Old Whiskers", price: 110, weight: 0.4, after: 6, drift: 0.28 },
    ],
    upgrades: UPGRADES,
    plots: { start: 6, total: 12, perRow: 3 },
    villagers: [
      { id: "nell", name: "Nell", title: "Harbor keeper", line: "Tide's kind today. The bay always gives back what you put into it.", model: { model: `${LR}/players/mage_classic.glb`, height: 1.75 } },
      { id: "bram", name: "Old Bram", title: "Fisherman", line: "Watch the green, not the float. And never chase Old Whiskers on an empty stomach.", model: { model: `${LR}/players/barbarian.glb`, height: 1.8 } },
      { id: "ivy", name: "Ivy", title: "Market cook", line: "Bring me anything fresh and I'll find a pot for it.", model: { model: `${LR}/players/rogue_hooded.glb`, height: 1.7 } },
    ],
    animals: [
      { model: `${LR}/creatures/chicken_cow.glb`, height: 0.7 },
      { model: `${LR}/creatures/alpaca.glb`, height: 1.5 },
    ],
    story: [
      { title: "A fresh start", pitch: "Your grandmother's cottage is yours now. Nell left turnip seed by the door." },
      { title: "Something for the pot", pitch: "Old Bram swears the bay is full this season. Try the fishing rocks." },
      { title: "Open for business", pitch: "Ivy wants fresh food for the harbor stalls. Sell at your cart." },
      { title: "Bigger harvests", pitch: "Nell thinks the old field could grow cabbage again. Seeds are at the market." },
      { title: "The tide festival", pitch: "The village puts on a festival when a farm thrives. Make yours the talk of the harbor." },
    ],
    scenery: [
      { model: `${VILLAGE}/Prop_Crate.glb`, height: 0.9 },
      { model: "industrial/barrel", height: 1 },
      { model: `${VILLAGE}/Prop_WoodenFence_Single.glb`, height: 1.2 },
      { model: "industrial/wooden-crate", height: 0.8 },
      { model: `${NATURE}/Rock_Medium_2.glb`, height: 0.8 },
      { model: `${NATURE}/Rock_Medium_3.glb`, height: 1.2 },
    ],
    world: {
      relief: 2.5,
      frequency: 0.011,
      waterLevel: -40,
      haze: 0.3,
      scatter: {
        tree: { model: `${NATURE}/CommonTree_1.glb`, height: 9 },
        tree2: { model: `${NATURE}/CommonTree_3.glb`, height: 8 },
        pine: { model: `${NATURE}/Pine_2.glb`, height: 10 },
        bush: { model: `${NATURE}/Bush_Common.glb`, height: 1.1 },
        flower: { model: `${NATURE}/Flower_3_Group.glb`, height: 0.5 },
        grass: { model: `${NATURE}/Grass_Common_Tall.glb`, height: 0.7 },
        rock: { model: `${NATURE}/Rock_Medium_1.glb`, height: 1.5 },
        rock2: { model: `${NATURE}/Rock_Medium_2.glb`, height: 1.1 },
      },
    },
    dressing: {
      forest: [{ item: "tree", weight: 3 }, { item: "tree2", weight: 2 }, { item: "pine", weight: 2 }],
      brush: [{ item: "bush", weight: 2 }, { item: "flower", weight: 3 }, { item: "grass", weight: 2 }],
      rocks: [{ item: "rock", weight: 2 }, { item: "rock2", weight: 2 }],
      grass: { base: "#557236", tip: "#a6b264", height: 0.36 },
      water: { color: "#1f5f78", shallow: "#5aa8a8" },
      trail: { surface: "dirt", color: "#8a7350", width: 3 },
    },
    townLook: "coastal",
    waterRadius: 34,
    festival: 400,
  },
  {
    words: ["farm", "farming", "farmer", "valley", "crops", "crop", "harvest", "ranch", "homestead", "garden", "gardening", "orchard", "fields", "cows", "chickens", "barn", "stardew", "countryside"],
    names: ["Willowbrook", "Honeyvale", "Thistle Hollow", "Meadowmere"],
    tagline: "Till the soil, raise a harvest and make the valley home.",
    kit: "parchment",
    look: "cinematic",
    mood: "golden",
    accent: "#d9a441",
    ground: { material: "grass", low: "#56763a", high: "#a4ae66" },
    currency: { id: "coins", label: "Coins", start: 30 },
    hero: { model: `${LR}/players/druid.glb`, height: 1.8, label: "You" },
    home: { label: "Farmhouse", model: { model: `${LR}/settlements/settlement-5.glb`, height: 7 } },
    stall: { label: "Produce cart", model: { model: `${VILLAGE}/Prop_Wagon.glb`, height: 1.8 } },
    market: { label: "Valley market", town: "the village", model: { model: `${LR}/settlements/market-cobbles.glb` }, opens: 6, closes: 20 },
    water: { label: "Pond", spot: "Pond bank" },
    crops: [
      crop("parsnip", "Parsnip", 4, 5, 12, 0, SPROUT, { model: `${NATURE}/Plant_1.glb`, height: 0.8 }),
      crop("wheat", "Wheat", 6, 8, 9, 0, SPROUT_2, { model: `${NATURE}/Grass_Common_Tall.glb`, height: 1.1, tint: "#e2c26a" }, 3),
      crop("pumpkin", "Pumpkin", 16, 16, 55, 80, SPROUT_2, { model: `${NATURE}/Bush_Common_Flowers.glb`, height: 0.9 }),
      crop("sunflower", "Sunflower", 12, 12, 34, 120, SPROUT, { model: `${NATURE}/Flower_4_Group.glb`, height: 1.3 }),
    ],
    fish: [
      { id: "minnow", label: "Minnow", price: 5, weight: 5, after: 0, drift: 0 },
      { id: "perch", label: "Perch", price: 12, weight: 3, after: 1, drift: 0.05 },
      { id: "trout", label: "Rainbow trout", price: 26, weight: 2, after: 3, drift: 0.12 },
      { id: "pike", label: "Old Pike", price: 95, weight: 0.4, after: 6, drift: 0.28 },
    ],
    upgrades: UPGRADES,
    plots: { start: 6, total: 12, perRow: 3 },
    villagers: [
      { id: "rosa", name: "Rosa", title: "Mayor", line: "The valley's been quiet since your uncle left. It's good to see the fields worked again.", model: { model: `${LR}/players/mage_classic.glb`, height: 1.75 } },
      { id: "tom", name: "Tom", title: "Miller", line: "Wheat, parsnips, pumpkins - I'll grind or sell anything you grow.", model: { model: `${LR}/players/barbarian.glb`, height: 1.8 } },
      { id: "wren", name: "Wren", title: "Angler", line: "The pond's older than the village. Some say the pike in it is too.", model: { model: `${LR}/players/rogue_hooded.glb`, height: 1.7 } },
    ],
    animals: [
      { model: `${LR}/creatures/chicken_cow.glb`, height: 0.7 },
      { model: `${LR}/creatures/bull.glb`, height: 1.6 },
      { model: `${LR}/creatures/alpaca.glb`, height: 1.5 },
    ],
    story: [
      { title: "Back on the farm", pitch: "Rosa left you parsnip seed. The first row is already tilled." },
      { title: "A quiet afternoon", pitch: "Wren says the pond bites best when you're patient. Give it a try." },
      { title: "Market day", pitch: "Tom will take anything fresh. Sell at your produce cart." },
      { title: "Pumpkin season", pitch: "Rosa wants pumpkins for the fair. Buy seed at the valley market." },
      { title: "The harvest fair", pitch: "Every autumn the valley crowns its best farm. Make it yours." },
    ],
    scenery: [
      { model: `${VILLAGE}/Prop_Crate.glb`, height: 0.9 },
      { model: `${VILLAGE}/Prop_WoodenFence_Single.glb`, height: 1.2 },
      { model: "industrial/barrel", height: 1 },
      { model: "industrial/wooden-crate", height: 0.8 },
      { model: `${NATURE}/Rock_Medium_1.glb`, height: 0.7 },
      { model: `${NATURE}/Rock_Medium_2.glb`, height: 1 },
    ],
    world: {
      relief: 4,
      frequency: 0.009,
      waterLevel: -40,
      haze: 0.32,
      scatter: {
        tree: { model: `${NATURE}/CommonTree_2.glb`, height: 9 },
        tree2: { model: `${NATURE}/CommonTree_4.glb`, height: 10 },
        pine: { model: `${NATURE}/Pine_4.glb`, height: 10 },
        bush: { model: `${NATURE}/Bush_Common_Flowers.glb`, height: 1.1 },
        flower: { model: `${NATURE}/Flower_4_Group.glb`, height: 0.6 },
        fern: { model: `${NATURE}/Fern_1.glb`, height: 0.9 },
        grass: { model: `${NATURE}/Grass_Common_Tall.glb`, height: 0.7 },
        rock: { model: `${NATURE}/Rock_Medium_3.glb`, height: 1.6 },
      },
    },
    dressing: {
      forest: [{ item: "tree", weight: 3 }, { item: "tree2", weight: 3 }, { item: "pine", weight: 1 }],
      brush: [{ item: "bush", weight: 2 }, { item: "flower", weight: 3 }, { item: "fern", weight: 2 }, { item: "grass", weight: 2 }],
      rocks: [{ item: "rock", weight: 3 }],
      grass: { base: "#5a7a38", tip: "#b2b96a", height: 0.4 },
      water: { color: "#24566e", shallow: "#4a8a98" },
      trail: { surface: "dirt", color: "#87704c", width: 3 },
    },
    townLook: "village",
    waterRadius: 26,
    festival: 400,
  },
];

function read(text: string, said: readonly string[], options: { name?: string }): Idea {
  const theme = pickTheme(said, THEMES);
  const named = nameFor(text, theme.names, options);
  const { words: _words, names: _names, story, world, dressing: _dressing, townLook: _look, waterRadius: _radius, festival, ...rest } = theme;
  const [first, second] = theme.crops;
  const guide = theme.villagers[0]!;
  return {
    ...rest,
    kind: "farm",
    ...named,
    pitch: text.trim(),
    guide: { name: guide.name, title: guide.title },
    beats: beats(story, [
      { goal: `Plant and harvest ${first!.label.toLowerCase()}`, fact: "farm.harvested", atLeast: 1 },
      { goal: `Catch a fish at the ${theme.water.label.toLowerCase()}`, fact: "farm.caught", atLeast: 1 },
      { goal: `Sell 8 things at the ${theme.stall.label.toLowerCase()}`, fact: "farm.shipped", atLeast: 8 },
      { goal: `Grow ${second!.unlock > 0 ? second!.label.toLowerCase() : theme.crops[2]!.label.toLowerCase()}`, fact: `farm.harvested_${second!.unlock > 0 ? second!.id : theme.crops[2]!.id}`, atLeast: 1 },
      { goal: `Earn ${festival} ${theme.currency.label.toLowerCase()} in all`, fact: "farm.earned", atLeast: festival },
    ]),
    world: {
      relief: world.relief,
      frequency: world.frequency,
      waterLevel: world.waterLevel,
      scatter: world.scatter,
      // A day is six minutes of play from 6:00; most crops ripen in a day, faster if you sleep.
      sky: { preset: "day", cycle: true, dayLength: 360, startHour: 6, haze: world.haze },
    },
  };
}

function themeOf(idea: Idea): Theme {
  return THEMES.find((theme) => theme.home.label === idea.home.label && theme.water.label === idea.water.label) ?? THEMES[0]!;
}

const unit = (spot: Spot) => {
  const length = Math.hypot(spot.x, spot.z) || 1;
  return { x: spot.x / length, z: spot.z / length };
};

/** How far a box of half-size `half` reaches from its centre toward `dir`. */
const reach = (dir: Spot, half: { x: number; z: number }) => Math.abs(dir.x) * half.x + Math.abs(dir.z) * half.z;

/**
 * The farm in a clearing at the middle: the cottage, the stall by the door and plots in rows in front
 * of you, fenced, with animals grazing beside it. The water (a bay or a pond) out one way with fishing
 * spots on its near shore; the village with its market out another, both on trails; woods, outcrops
 * and meadows to the horizon.
 */
function scene(idea: Idea, layout: Layout): void {
  const theme = themeOf(idea);
  const dressing = theme.dressing;
  const { perRow, total } = idea.plots;
  const rows = Math.ceil(total / perRow);
  const gap = 2.6;
  const firstRow = 2.6;
  const yard = { x: 0, z: 4 };
  layout.take(yard, 20);
  layout.pad("farm-pad", yard, 22, undefined, 14);

  // You start on the path at the field's edge, facing the first plot; the stall is at your left shoulder.
  layout.marker({ id: "spawn", kind: "player_spawn", at: { x: 0, z: 1.6 }, rotationY: 0, label: "Spawn", meta: { clearance: 2 } });
  layout.marker({ id: "stall", kind: "stall", at: { x: -2.8, z: -0.3 }, label: idea.stall.label });
  layout.marker({ id: "stall-cart", kind: "prop", catalogId: "stall", at: { x: -4.8, z: -1.5 }, rotationY: 0.4, label: idea.stall.label });
  layout.marker({ id: "home", kind: "home", at: { x: 0, z: -4 }, label: idea.home.label });
  layout.marker({ id: "cottage", kind: "prop", catalogId: "cottage", at: { x: 0, z: -9.5 }, rotationY: 0, label: idea.home.label });

  // Plots in rows, the middle one first so the first plot is straight ahead; each row is a tilled furrow.
  const columns = Array.from({ length: perRow }, (_, index) => (index === 0 ? 0 : (index % 2 === 1 ? -1 : 1) * Math.ceil(index / 2) * gap));
  let plot = 0;
  for (let row = 0; row < rows; row += 1) {
    const z = firstRow + row * gap;
    if (row * perRow < idea.plots.start) layout.path({ id: `furrow-${row + 1}`, kind: "trail", points: [{ x: -((perRow - 1) / 2) * gap - 1.3, z }, { x: ((perRow - 1) / 2) * gap + 1.3, z }], width: 2.1, label: `Row ${row + 1}`, meta: { surface: "dirt", color: "#5b4330" } });
    for (const x of columns) {
      plot += 1;
      if (plot > total) break;
      layout.marker({ id: `plot-${plot}`, kind: "plot", at: { x, z }, label: `Plot ${plot}`, meta: { plot } });
    }
  }
  // A fence round the field, open toward the cottage.
  const left = -((perRow - 1) / 2) * gap - 2.6;
  const right = -left;
  const back = firstRow + (rows - 1) * gap + 2.2;
  const fence = idea.scenery.findIndex((ref) => ref.model.includes("Fence"));
  if (fence >= 0) {
    let post = 0;
    const put = (x: number, z: number, rotationY: number) => layout.marker({ id: `fence-${(post += 1)}`, kind: "prop", catalogId: `scenery${fence + 1}`, at: { x, z }, rotationY, label: "Fence" });
    for (let x = left; x <= right + 0.01; x += 2) put(x, back, 0);
    for (let z = 1.4; z <= back + 0.01; z += 2) {
      put(left, z, Math.PI / 2);
      put(right, z, Math.PI / 2);
    }
  }
  // Animals graze in a paddock beside the field.
  const paddock = { x: right + 9, z: firstRow + 3 };
  idea.animals.forEach((_, animal) => {
    for (let index = 0; index < 2; index += 1) {
      const spot = layout.place(1, 5, 1.2, paddock, false) ?? paddock;
      layout.marker({ id: `animal-${animal + 1}-${index + 1}`, kind: "herd", at: spot, rotationY: layout.turn(), label: "Animal", meta: { animal } });
    }
  });
  // Clutter by the cottage: crates and barrels, a bench, logs.
  const props = idea.scenery.map((_, index) => `scenery${index + 1}`).filter((_, index) => index !== fence);
  cluster(layout, { id: "yard", at: { x: 5, z: -5 }, radius: 3, props, count: 6, label: "Yard", spacing: 1.4 });
  cluster(layout, { id: "shed", at: { x: -9, z: -6 }, radius: 3, props: [props[0]!, props[1]!], count: 5, label: "Shed", spacing: 1.2 });

  // The water one way, the village another; trails from the farm to each.
  // The water lies ahead past the field, so the first view is across the crops to the water; the village is ahead to one side.
  const out = Math.PI / 2 + layout.between(-0.25, 0.25);
  const waterAt = { x: Math.round(Math.cos(out) * (theme.waterRadius * 1.15 + 34)), z: Math.round(Math.sin(out) * (theme.waterRadius * 1.15 + 34)) };
  lake(layout, { id: "water", at: waterAt, radius: theme.waterRadius, level: -0.6, dressing, label: idea.water.label });
  const water = layout.doc.volumes[layout.doc.volumes.length - 1] as { halfExtents: { x: number; z: number } };
  const toFarm = { x: -unit(waterAt).x, z: -unit(waterAt).z };
  const shore = reach(toFarm, water.halfExtents) + 1.4;
  const side = { x: -toFarm.z, z: toFarm.x };
  for (let index = 0; index < 3; index += 1) {
    const along = (index - 1) * 7;
    const at = { x: waterAt.x + toFarm.x * shore + side.x * along, z: waterAt.z + toFarm.z * shore + side.z * along };
    layout.marker({ id: `fishing-${index + 1}`, kind: "fishing", at, rotationY: Math.atan2(-toFarm.x, -toFarm.z), label: idea.water.spot });
  }
  const fishingAt = { x: waterAt.x + toFarm.x * (shore + 3), z: waterAt.z + toFarm.z * (shore + 3) };
  cluster(layout, { id: "fishing-camp", at: { x: fishingAt.x + side.x * 12, z: fishingAt.z + side.z * 12 }, radius: 3, props: [props[0]!, props[1]!], count: 5, label: "Fishing camp", spacing: 1.2 });

  const townAngle = out + (layout.random() < 0.5 ? -1 : 1) * layout.between(0.95, 1.2);
  const townAt = { x: Math.round(Math.cos(townAngle) * 115), z: Math.round(Math.sin(townAngle) * 115) };
  const townHalf = { x: 40, z: 34 };
  town(layout, { id: "village", at: townAt, half: townHalf, look: theme.townLook, label: idea.market.town });
  const toTown = unit(townAt);
  const edge = reach(toTown, townHalf) + 9;
  const market = { x: Math.round(townAt.x - toTown.x * edge), z: Math.round(townAt.z - toTown.z * edge) };
  layout.take(market, 8);
  layout.marker({ id: "market", kind: "market", at: market, label: idea.market.label });
  layout.marker({ id: "market-square", kind: "prop", catalogId: "market", at: market, rotationY: Math.atan2(toTown.x, toTown.z), label: idea.market.label });
  cluster(layout, { id: "market-stalls", at: market, radius: 7, props: [props[0]!, props[1]!, "stall"], count: 7, label: "Market stalls", spacing: 1.6 });

  // Villagers: the first at the farm gate, the angler by the water, the rest at the market.
  idea.villagers.forEach((villager, index) => {
    const base = index === 0 ? { x: 4.5, z: 0 } : index === 1 ? { x: fishingAt.x + side.x * 9, z: fishingAt.z + side.z * 9 } : market;
    const at = index >= 2 ? (layout.place(3, 6, 1, market, false) ?? market) : base;
    layout.marker({ id: `villager-${villager.id}`, kind: "villager", at, rotationY: layout.turn(), label: villager.name, meta: { villager: villager.id } });
  });

  // Signposts by the cottage walk you down each road; one at each far end walks you home.
  const post = fence >= 0 ? `scenery${fence + 1}` : props[0]!;
  const sign = (id: string, at: Spot, to: string, label: string) => {
    layout.marker({ id, kind: "sign", at, label, meta: { to } });
    layout.marker({ id: `${id}-post`, kind: "prop", catalogId: post, at: { x: at.x, z: at.z - 0.5 }, rotationY: Math.PI / 2, label });
  };
  sign("sign-water", { x: 3.4, z: -1.8 }, "fishing-2", `Road to the ${idea.water.label.toLowerCase()}`);
  sign("sign-market", { x: 5.8, z: -1.8 }, "market-gate", `Road to the ${idea.market.label.toLowerCase()}`);
  sign("sign-home-water", { x: fishingAt.x + side.x * 4, z: fishingAt.z + side.z * 4 }, "spawn", `Road home to the ${idea.home.label.toLowerCase()}`);
  const gate = { x: market.x - toTown.x * 4, z: market.z - toTown.z * 4 };
  layout.marker({ id: "market-gate", kind: "arrive", at: gate, rotationY: Math.atan2(toTown.x, toTown.z), label: idea.market.label });
  sign("sign-home-market", { x: gate.x - toTown.z * 3, z: gate.z + toTown.x * 3 }, "home", `Road home to the ${idea.home.label.toLowerCase()}`);

  const farmEdge = (to: Spot) => ({ x: unit(to).x * 21 + yard.x, z: unit(to).z * 21 + yard.z });
  trail(layout, { id: "trail-water", from: farmEdge(fishingAt), to: fishingAt, dressing, label: `To the ${idea.water.label.toLowerCase()}` });
  trail(layout, { id: "trail-village", from: farmEdge(market), to: { x: market.x - toTown.x * 6, z: market.z - toTown.z * 6 }, dressing, label: `To ${idea.market.town}` });

  // Groves round the farm so it sits in its own clearing, then the land to the horizon.
  for (let index = 0; index < 7; index += 1) {
    const at = layout.place(26, 46, 8, yard, false);
    if (at !== null) grove(layout, { id: `grove-${index + 1}`, at, radius: layout.between(6, 10), dressing });
  }
  for (let index = 0; index < 5; index += 1) {
    const at = layout.place(20, 40, 4, yard, false);
    if (at !== null) patch(layout, { id: `flowers-${index + 1}`, at, radius: layout.between(3, 6), palette: dressing.brush, density: 0.35, label: "Wildflowers" });
  }
  for (let index = 0; index < 3; index += 1) {
    const angle = townAngle + Math.PI + (index - 1) * 0.9;
    const at = { x: Math.round(Math.cos(angle) * 95), z: Math.round(Math.sin(angle) * 95) };
    if (layout.free(at, 16)) forest(layout, { id: `woods-${index + 1}`, at, radius: 22, dressing, density: 0.15, label: "Woods" });
  }
  wilds(layout, { dressing, inner: 48, outer: 230, forests: 12, outcrops: 7, drifts: 22, meadow: 110 });
}

function readme(made: Idea): string {
  const [first] = made.crops;
  return `# ${made.name}

${made.tagline} Made with \`bun run games:new\` from: "${made.pitch}". Start it with \`bun --cwd=games/${made.id} run dev\` from the repository root.

## Design checklist

Every word, price and model below lives in \`src/game/idea.ts\`; places live in \`src/editor.scene.json\`.

- **Core loop.** Plant ${made.crops.map((crop) => crop.label.toLowerCase()).join(", ")} in the plots by the ${made.home.label.toLowerCase()} (E);
  crops grow on the in-world clock (a day is ${made.world.sky.dayLength / 60} minutes of play) and are harvested with E when ripe;
  fish at the ${made.water.label.toLowerCase()}: cast with E, and when it bites press E while the marker is in the green (the engine's skill check);
  sell everything at the ${made.stall.label.toLowerCase()}, then spend it at the ${made.market.label.toLowerCase()} in ${made.market.town} (number keys).
  Signposts by the ${made.home.label.toLowerCase()} walk you down the road to the water and the market, and back.
- **Progression.**
  - [x] Seeds unlock at the market: ${made.crops.filter((crop) => crop.unlock > 0).map((crop) => `${crop.label.toLowerCase()} (${crop.unlock})`).join(", ")}.
  - [x] The rod has ${made.upgrades.find((upgrade) => upgrade.id === "rod")?.levels ?? 0} upgrades (wider green, quicker bites); more land opens a row of ${made.plots.perRow} plots each, up to ${made.plots.total}.
  - [x] Rarer fish bite after enough casts: ${made.fish.map((fish) => `${fish.label.toLowerCase()} (${fish.price})`).join(", ")}.
  - [x] ${made.beats.length} requests from the village (${made.villagers.map((villager) => villager.name).join(", ")}), each paying a little, ending in the festival.
- **Failure states.** None that end the run: a fish that waits too long or that you reel in early gets away, and the market closes at ${made.market.closes}:00. Sleeping in the ${made.home.label.toLowerCase()} ends the day and saves; crops keep growing overnight.
- **Minute 5 -> hour 5.** At 5:00 the first ${first?.label.toLowerCase()} are sold and the first fish is in; the rod and the second crop are the next buys. Later days are about filling ${made.plots.total} plots with the best crop and chasing the rare fish.
- **References it is chasing.**
  - *Stardew Valley* - feel: a day that runs out, crops that ripen overnight, a shipping bin by the door.
  - *Animal Crossing* - feel: a village of a few faces with something to say, fishing as a timing game.
  - *Harvest Moon* - density: a small farm that grows into a full one.
- **Gap to target.** No watering, seasons, gifts or animal care yet; villagers only wander and talk; one map.

Loop proof: ${made.id}-loop
`;
}

function loopFlow(made: Idea): Flow {
  const [first] = made.crops;
  return {
    steps: [
      { assert: flowAssertText(made.beats[0]!.title), before: { is: flowAssertText(made.beats[0]!.title), timeoutMs: 60000 }, note: "arrival: a day is running and the first request started by itself" },
      { key: "KeyE", ms: 120, after: { is: "__jgProbe().planted >= 1", timeoutMs: 8000 }, note: `plant ${first!.label.toLowerCase()} in the plot in front of you` },
      { assert: `__jgProbe().coins === ${made.currency.start - first!.seed}`, note: "the seed was paid for" },
      { rpc: { method: "time_scale", scale: 24 }, note: "run the in-world clock fast, as a night's sleep does, so the crop grows" },
      { assert: "__jgProbe().ripe >= 1", before: { is: "__jgProbe().ripe >= 1", timeoutMs: 60000 }, note: `arrival: the ${first!.label.toLowerCase()} ripened on the clock` },
      { rpc: { method: "time_scale", scale: 1 } },
      { key: "KeyE", ms: 120, after: { is: "__jgProbe().harvested >= 1 && __jgProbe().carrying > 0", timeoutMs: 8000 }, note: "harvest it into the basket" },
      { key: "KeyE", ms: 120, after: { is: "__jgProbe().shipped >= 1", timeoutMs: 8000 }, note: `sell the basket at the ${made.stall.label.toLowerCase()} at your shoulder` },
      { assert: `__jgProbe().coins > ${made.currency.start}`, note: "arrival: the sale paid more than the seed cost" },
      { assert: flowAssertText(made.beats[1]!.title), before: { is: flowAssertText(made.beats[1]!.title), timeoutMs: 15000 }, note: "arrival: the first request is done and the next one is up" },
    ],
  };
}

/** A whole day in about 35 seconds: plant a row, the clock runs, harvest, sell, catch a fish, shop, sleep. */
function clipFlow(made: Idea): Flow {
  const unlock = made.crops.findIndex((crop) => crop.unlock > 0);
  return {
    steps: [
      { wait: 2000 },
      { key: "KeyE", ms: 120, after: { is: "__jgProbe().planted >= 1", timeoutMs: 4000 }, note: "plant the plot in front" },
      { key: "KeyA", ms: 300 },
      { wait: 500 },
      { key: "KeyE", ms: 120, note: "the next plot" },
      { key: "KeyD", ms: 800 },
      { wait: 500 },
      { key: "KeyE", ms: 120, after: { is: "__jgProbe().planted >= 3", timeoutMs: 4000 }, note: "and the one after" },
      { wait: 800 },
      { rpc: { method: "time_scale", scale: 30 }, note: "the morning runs by" },
      { assert: "__jgProbe().ripe >= 3", before: { is: "__jgProbe().ripe >= 3", timeoutMs: 30000 } },
      { rpc: { method: "time_scale", scale: 1 } },
      { wait: 700 },
      { key: "KeyE", ms: 120, note: "harvest" },
      { key: "KeyA", ms: 300 },
      { wait: 500 },
      { key: "KeyE", ms: 120 },
      { key: "KeyA", ms: 300 },
      { wait: 500 },
      { key: "KeyE", ms: 120, after: { is: "__jgProbe().harvested >= 3", timeoutMs: 4000 } },
      { key: "KeyD", ms: 600, note: "back toward the stall" },
      { wait: 600 },
      { key: "KeyE", ms: 120, after: { is: "__jgProbe().shipped >= 3", timeoutMs: 4000 }, note: `sell at the ${made.stall.label.toLowerCase()}` },
      { wait: 1500 },
      { rpc: { method: "run_command", name: "travel", input: { sign: "sign-water" } }, note: `down the road to the ${made.water.label.toLowerCase()}` },
      { wait: 1500 },
      { key: "KeyE", ms: 120, note: "cast" },
      { assert: "__jgProbe().fishing === 2", before: { is: "__jgProbe().fishing === 2", timeoutMs: 9000 }, note: "a bite" },
      { assert: "__jgProbe().inZone > 0", before: { is: "__jgProbe().inZone > 0", timeoutMs: 3000 } },
      { key: "KeyE", ms: 80, after: { is: "__jgProbe().caught >= 1", timeoutMs: 2000 }, note: "reel in on the green" },
      { wait: 2200 },
      { rpc: { method: "run_command", name: "travel", input: { sign: "sign-home-water" } }, note: "home along the road" },
      { wait: 600 },
      { key: "KeyE", ms: 120, after: { is: "__jgProbe().carrying === 0", timeoutMs: 4000 }, note: "sell the catch" },
      { wait: 1200 },
      { rpc: { method: "run_command", name: "travel", input: { sign: "sign-market" } }, note: `to the ${made.market.label.toLowerCase()}` },
      { wait: 1800 },
      ...(unlock < 0 ? [] : [{ key: `Digit1`, ms: 120, note: `buy ${made.crops[unlock]!.label.toLowerCase()} seeds` }, { wait: 2000 }]),
      { rpc: { method: "run_command", name: "travel", input: { sign: "sign-home-market" } } },
      { wait: 400 },
      { key: "KeyE", ms: 120, after: { is: "__jgProbe().day >= 2", timeoutMs: 4000 }, note: "sleep: the day ends and saves" },
      { wait: 3000 },
      { assert: "__jgProbe().harvested >= 3 && __jgProbe().caught >= 1 && __jgProbe().day >= 2", note: "arrival: a full day on camera" },
    ],
  };
}

export const kind: KindModule<Idea> = {
  kind: "farm",
  genre: "cozy farming and fishing",
  words: [],
  read,
  scene,
  readme,
  loopFlow,
  clipFlow,
  clipState: "morning",
};
