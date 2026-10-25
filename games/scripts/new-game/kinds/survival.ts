/**
 * Survival: gather by day, build a camp, hold it through the waves that come at dusk; tame what lives
 * there. Themes are plain data rows (what comes, what you gather and build, which models draw them,
 * how the land and sky look); the idea's words pick and tune one. New themes are new rows here.
 */
import type { BeatWord, ModelRef, WorldWord } from "../template/common/src/game/ideaShape";
import type { Idea } from "../template/survival/src/game/kindShape";
import { cluster, forest, grove, lake, trail, wilds, town, type Dressing, type TownLook } from "../world/dress";
import type { Layout } from "../world/layout";
import { beats, nameFor, pickTheme } from "./shared";
import type { Flow, KindModule } from "./types";

type Theme = Omit<Idea, "kind" | "id" | "spec" | "name" | "pitch" | "beats" | "allies" | "world"> & {
  /** Words that pick this theme; more hits win. */
  words: readonly string[];
  names: readonly string[];
  allies: Idea["allies"];
  /** Beat titles and pitches; goals and facts come from the theme's own pieces. */
  story: readonly { title: string; pitch: string }[];
  world: Omit<WorldWord, "sky"> & { haze: number; preset: "day" | "dusk" | "night" };
  dressing: Dressing;
  /** A town or village out past the woods, on a trail from camp. */
  town?: { look: TownLook; label: string };
};

const NATURE = "/models/quaternius-stylized-nature";

const RANGER: ModelRef = { model: "/models/lantern-reach/players/ranger.glb", height: 1.8 };
const SOLDIER: ModelRef = { model: "human/soldier", height: 1.8 };
const INFECTED = "#7c9468";

const THEMES: readonly Theme[] = [
  {
    words: ["zombie", "zombies", "undead", "infected", "apocalypse", "outbreak", "horde", "scavenge", "fortify", "walkers"],
    names: ["Dead Acre", "Last Light", "Hold the Line", "Boarded Up"],
    tagline: "Scavenge by day. Fortify by dusk. Live through the night.",
    kit: "terminal",
    look: "cinematic",
    mood: "overcast",
    accent: "#e8a33c",
    ground: { material: "ash", low: "#4a4a3f", high: "#77705c" },
    home: { label: "Safehouse", health: 1500, model: { model: "/models/kaykit-city-builder/building_B.glb", height: 9 } },
    guide: { name: "Mara", title: "Radio voice" },
    wave: "Night",
    calm: 75,
    hero: { ...SOLDIER, health: 120, damage: 34, label: "You" },
    resources: [
      { id: "scrap", label: "Scrap", start: 30 },
      { id: "food", label: "Food", start: 10 },
    ],
    nodes: [
      { id: "crate", label: "Supply crate", verb: "Search", gives: "scrap", amount: 6, uses: 3, regrow: 0.02, prop: { model: "industrial/wooden-crate", height: 0.9 } },
      { id: "wreck", label: "Wrecked car", verb: "Strip", gives: "scrap", amount: 10, uses: 4, regrow: 0.015, prop: { model: "/models/kaykit-city-builder/car_sedan.glb", height: 1.5 } },
      { id: "bin", label: "Trash can", verb: "Rummage", gives: "food", amount: 4, uses: 2, regrow: 0.02, prop: { model: "city/trash-can", height: 1.1 } },
      { id: "drum", label: "Oil drum", verb: "Siphon", gives: "scrap", amount: 4, uses: 2, regrow: 0.03, prop: { model: "industrial/barrel", height: 1 } },
    ],
    structures: [
      { id: "barricade", label: "Barricade", role: "wall", key: "1", cost: { scrap: 8 }, takes: 2, health: 260, power: 0, prop: { model: "city/road-barrier", height: 1.1 } },
      { id: "lookout", label: "Lookout", role: "turret", key: "2", cost: { scrap: 30 }, takes: 5, health: 200, power: 16, prop: { model: "/models/kaykit-city-builder/watertower.glb", height: 5 } },
      { id: "garden", label: "Garden bed", role: "producer", key: "3", cost: { scrap: 14 }, takes: 4, health: 120, power: 0.25, makes: "food", prop: { model: "park/planter-box", height: 0.8 } },
    ],
    threats: [
      { id: "shambler", label: "Shambler", model: { model: "human/man-casual", height: 1.8, tint: INFECTED }, health: 60, damage: 8, speed: 1.6, from: 1 },
      { id: "biter", label: "Biter", model: { model: "human/woman-casual", height: 1.7, tint: INFECTED }, health: 45, damage: 7, speed: 2.2, from: 1 },
      { id: "runner", label: "Runner", model: { model: "human/jogger", height: 1.8, tint: INFECTED }, health: 40, damage: 6, speed: 4.2, from: 3 },
      { id: "brute", label: "Brute", model: { model: "human/construction-worker", height: 2.3, tint: INFECTED }, health: 260, damage: 22, speed: 1.4, from: 5 },
    ],
    allies: [
      { id: "dog", label: "Stray dog", verb: "Feed", model: { model: "creature/dog-shepherd", height: 0.8 }, cost: { food: 6 }, health: 90, damage: 14, speed: 5.5 },
    ],
    story: [
      { title: "First night", pitch: "The radio crackles: the dead walk after dark. Board up before the sun goes." },
      { title: "Hold out", pitch: "They came back, and more of them. Keep the walls standing." },
      { title: "The long dark", pitch: "Brutes are in the horde now. Build up and hold." },
      { title: "Dawn of rescue", pitch: "A convoy is coming. Survive until they reach you." },
    ],
    scenery: [
      { model: "/models/kaykit-city-builder/car_sedan.glb", height: 1.5 },
      { model: "industrial/barrel", height: 1 },
      { model: "/models/kaykit-city-builder/car_hatchback.glb", height: 1.5 },
      { model: "city/street-lamp", height: 5 },
      { model: "/models/kaykit-city-builder/dumpster.glb", height: 1.4 },
      { model: "city/fire-hydrant", height: 0.8 },
      { model: "/models/quaternius-stylized-nature/DeadTree_1.glb", height: 6 },
    ],
    winAt: 7,
    world: {
      relief: 3,
      frequency: 0.012,
      waterLevel: -40,
      haze: 0.55,
      preset: "day",
      scatter: {
        deadtree: { model: `${NATURE}/DeadTree_2.glb`, height: 8 },
        deadtree2: { model: `${NATURE}/DeadTree_4.glb`, height: 7 },
        pine: { model: `${NATURE}/Pine_3.glb`, height: 10 },
        bush: { model: `${NATURE}/Bush_Common.glb`, height: 1.1 },
        grass: { model: `${NATURE}/Grass_Wispy_Tall.glb`, height: 0.7 },
        rock: { model: `${NATURE}/Rock_Medium_2.glb`, height: 1.6 },
      },
    },
    dressing: {
      forest: [{ item: "deadtree", weight: 3 }, { item: "deadtree2", weight: 2 }, { item: "pine", weight: 3 }],
      brush: [{ item: "bush", weight: 2 }, { item: "grass", weight: 3 }],
      rocks: [{ item: "rock", weight: 3 }],
      grass: { base: "#4a4a36", tip: "#7a7350", height: 0.3 },
      trail: { surface: "gravel", color: "#6d6656", width: 4 },
    },
    town: { look: "ruin", label: "The dead town" },
  },
  {
    words: ["dinosaur", "dinosaurs", "dino", "dinos", "raptor", "raptors", "jurassic", "prehistoric", "ark", "rex", "tame", "taming"],
    names: ["Primal Shore", "Fernwild", "Claw Island", "Ember Age"],
    tagline: "Tame the wild. Raise a camp. Outlast the hunt.",
    kit: "parchment",
    look: "cinematic",
    mood: "golden",
    accent: "#6fc36a",
    ground: { material: "grass", low: "#4f6d2f", high: "#8a9a52" },
    home: { label: "Camp", health: 1400, model: { model: "/models/lantern-reach/settlements/settlement-1.glb", height: 7 } },
    guide: { name: "Ka-Ren", title: "Old tamer" },
    wave: "Hunt",
    calm: 80,
    hero: { ...RANGER, health: 120, damage: 30, label: "Survivor" },
    resources: [
      { id: "wood", label: "Wood", start: 20 },
      { id: "stone", label: "Stone", start: 10 },
      { id: "berries", label: "Berries", start: 6 },
    ],
    nodes: [
      { id: "tree", label: "Tree", verb: "Chop", gives: "wood", amount: 5, uses: 4, regrow: 0.03, prop: { model: "/models/quaternius-stylized-nature/CommonTree_1.glb", height: 7 } },
      { id: "pine", label: "Pine", verb: "Chop", gives: "wood", amount: 6, uses: 4, regrow: 0.03, prop: { model: "/models/quaternius-stylized-nature/Pine_2.glb", height: 8 } },
      { id: "rock", label: "Rock", verb: "Mine", gives: "stone", amount: 4, uses: 5, regrow: 0.02, prop: { model: "/models/quaternius-stylized-nature/Rock_Medium_1.glb", height: 1.4 } },
      { id: "bush", label: "Berry bush", verb: "Pick", gives: "berries", amount: 3, uses: 3, regrow: 0.05, prop: { model: "/models/quaternius-stylized-nature/Bush_Common_Flowers.glb", height: 1.1 } },
    ],
    structures: [
      { id: "palisade", label: "Palisade", role: "wall", key: "1", cost: { wood: 8 }, takes: 2, health: 240, power: 0, prop: { model: "/models/quaternius-medieval-village/Prop_WoodenFence_Single.glb", height: 1.6 } },
      { id: "brazier", label: "Fire ward", role: "turret", key: "2", cost: { wood: 12, stone: 10 }, takes: 4, health: 180, power: 14, prop: { model: "/models/kaykit-dungeon/torch_lit.glb", height: 2.2 } },
      { id: "patch", label: "Berry patch", role: "producer", key: "3", cost: { wood: 10 }, takes: 4, health: 120, power: 0.25, makes: "berries", prop: { model: "/models/quaternius-stylized-nature/Bush_Common.glb", height: 0.9 } },
    ],
    threats: [
      { id: "raptor", label: "Raptor", model: { model: "/models/lantern-reach/creatures/velociraptor.glb", height: 1.6 }, health: 50, damage: 8, speed: 3.6, from: 1 },
      { id: "stalker", label: "Stalker", model: { model: "/models/lantern-reach/creatures/velociraptor.glb", height: 2.4 }, health: 120, damage: 14, speed: 3.2, from: 3 },
      { id: "rex", label: "Tyrant", model: { model: "/models/lantern-reach/creatures/velociraptor.glb", height: 4.5 }, health: 520, damage: 32, speed: 2.4, from: 5 },
    ],
    allies: [
      { id: "stag", label: "Stag", verb: "Tame", model: { model: "/models/lantern-reach/creatures/stag.glb", height: 1.9 }, cost: { berries: 6 }, health: 140, damage: 16, speed: 5 },
      { id: "boar", label: "Boar", verb: "Tame", model: { model: "/models/lantern-reach/creatures/wild_boar.glb", height: 1.1 }, cost: { berries: 4 }, health: 100, damage: 12, speed: 5 },
      { id: "bull", label: "Aurochs", verb: "Tame", model: { model: "/models/lantern-reach/creatures/bull.glb", height: 1.8 }, cost: { berries: 10 }, health: 220, damage: 22, speed: 4.2 },
    ],
    story: [
      { title: "Washed ashore", pitch: "Nothing here is friendly yet. Raise a palisade before the raptors find your smoke." },
      { title: "A pack of your own", pitch: "The beasts that graze here can be won with berries. Tame one to fight beside you." },
      { title: "Stalkers", pitch: "Bigger hunters smell the camp. Fire keeps them back." },
      { title: "The Tyrant", pitch: "Something huge walks the ferns. Hold the camp through its hunt." },
    ],
    scenery: [
      { model: "/models/quaternius-stylized-nature/CommonTree_3.glb", height: 8 },
      { model: "/models/quaternius-stylized-nature/Bush_Common.glb", height: 1.2 },
      { model: "/models/quaternius-stylized-nature/Fern_1.glb", height: 1.2 },
      { model: "/models/quaternius-stylized-nature/Fern_1.glb", height: 1.3 },
      { model: "/models/quaternius-stylized-nature/Rock_Medium_3.glb", height: 2 },
      { model: "/models/quaternius-stylized-nature/Rock_Medium_2.glb", height: 1.2 },
    ],
    winAt: 7,
    world: {
      relief: 5,
      frequency: 0.01,
      waterLevel: -40,
      haze: 0.35,
      preset: "day",
      scatter: {
        tree: { model: `${NATURE}/CommonTree_3.glb`, height: 10 },
        tree2: { model: `${NATURE}/CommonTree_1.glb`, height: 12 },
        tree3: { model: `${NATURE}/CommonTree_2.glb`, height: 9 },
        fern: { model: `${NATURE}/Fern_1.glb`, height: 0.9 },
        plant: { model: `${NATURE}/Plant_1_Big.glb`, height: 1.6 },
        bush: { model: `${NATURE}/Bush_Common_Flowers.glb`, height: 1.2 },
        rock: { model: `${NATURE}/Rock_Medium_3.glb`, height: 2.2 },
        rock2: { model: `${NATURE}/Rock_Medium_1.glb`, height: 1.4 },
      },
    },
    dressing: {
      forest: [{ item: "tree", weight: 3 }, { item: "tree2", weight: 3 }, { item: "tree3", weight: 2 }],
      brush: [{ item: "fern", weight: 4 }, { item: "plant", weight: 2 }, { item: "bush", weight: 1 }],
      rocks: [{ item: "rock", weight: 2 }, { item: "rock2", weight: 2 }],
      grass: { base: "#4c6a2c", tip: "#9aa858", height: 0.42 },
      water: { color: "#1f5a5c", shallow: "#4f9a8a" },
      trail: { surface: "dirt", color: "#7a6446", width: 3 },
    },
  },
  {
    words: ["wolf", "wolves", "goblin", "goblins", "orc", "orcs", "fantasy", "medieval", "village", "castle", "siege", "wilds"],
    names: ["Lanternfall", "Thornwatch", "Ember Hollow"],
    tagline: "Gather, build, and hold the village through the long hunt.",
    kit: "parchment",
    look: "cinematic",
    mood: "dusk",
    accent: "#d9a441",
    ground: { material: "highland", low: "#4c5a33", high: "#7d7a55" },
    home: { label: "Village hall", health: 1400, model: { model: "/models/lantern-reach/settlements/settlement-0.glb", height: 8 } },
    guide: { name: "Elder Rowan", title: "Village elder" },
    wave: "Raid",
    calm: 75,
    hero: { model: "/models/lantern-reach/players/knight.glb", height: 1.8, health: 130, damage: 32, label: "Warden" },
    resources: [
      { id: "wood", label: "Wood", start: 20 },
      { id: "stone", label: "Stone", start: 10 },
    ],
    nodes: [
      { id: "tree", label: "Tree", verb: "Chop", gives: "wood", amount: 5, uses: 4, regrow: 0.03, prop: { model: "/models/quaternius-stylized-nature/CommonTree_2.glb", height: 7 } },
      { id: "rock", label: "Rock", verb: "Mine", gives: "stone", amount: 4, uses: 5, regrow: 0.02, prop: { model: "/models/quaternius-stylized-nature/Rock_Medium_2.glb", height: 1.4 } },
    ],
    structures: [
      { id: "fence", label: "Fence", role: "wall", key: "1", cost: { wood: 8 }, takes: 2, health: 240, power: 0, prop: { model: "/models/quaternius-medieval-village/Prop_WoodenFence_Single.glb", height: 1.6 } },
      { id: "brazier", label: "Brazier", role: "turret", key: "2", cost: { wood: 10, stone: 10 }, takes: 4, health: 180, power: 14, prop: { model: "/models/kaykit-dungeon/torch_lit.glb", height: 2.2 } },
    ],
    threats: [
      { id: "goblin", label: "Goblin", model: { model: "/models/lantern-reach/creatures/goblin.glb", height: 1.3 }, health: 45, damage: 7, speed: 3, from: 1 },
      { id: "wolf", label: "Wolf", model: { model: "/models/lantern-reach/creatures/wolf_basic.glb", height: 1.1 }, health: 50, damage: 8, speed: 4.4, from: 2 },
      { id: "orc", label: "Orc", model: { model: "/models/lantern-reach/creatures/orc.glb", height: 2.1 }, health: 200, damage: 20, speed: 2.2, from: 4 },
    ],
    allies: [],
    story: [
      { title: "First raid", pitch: "Raiders gather in the hills. Fence the hall before they come." },
      { title: "Wolves at the gate", pitch: "Wolves run with them now. Keep the fires burning." },
      { title: "The warband", pitch: "Orcs lead the next raid. Hold the hall." },
    ],
    scenery: [
      { model: "/models/quaternius-medieval-village/Prop_Crate.glb", height: 0.9 },
      { model: "/models/quaternius-medieval-village/Prop_WoodenFence_Single.glb", height: 1.4 },
      { model: "/models/quaternius-medieval-village/Prop_Wagon.glb", height: 1.8 },
      { model: "/models/quaternius-stylized-nature/Bush_Common.glb", height: 1 },
    ],
    winAt: 6,
    world: {
      relief: 6,
      frequency: 0.009,
      waterLevel: -40,
      haze: 0.45,
      preset: "dusk",
      scatter: {
        pine: { model: `${NATURE}/Pine_1.glb`, height: 11 },
        pine2: { model: `${NATURE}/Pine_4.glb`, height: 9 },
        tree: { model: `${NATURE}/CommonTree_2.glb`, height: 9 },
        bush: { model: `${NATURE}/Bush_Common.glb`, height: 1.1 },
        flower: { model: `${NATURE}/Flower_3_Group.glb`, height: 0.5 },
        fern: { model: `${NATURE}/Fern_1.glb`, height: 1 },
        rock: { model: `${NATURE}/Rock_Medium_2.glb`, height: 1.8 },
      },
    },
    dressing: {
      forest: [{ item: "pine", weight: 4 }, { item: "pine2", weight: 2 }, { item: "tree", weight: 2 }],
      brush: [{ item: "bush", weight: 2 }, { item: "flower", weight: 2 }, { item: "fern", weight: 2 }],
      rocks: [{ item: "rock", weight: 3 }],
      grass: { base: "#4c5a33", tip: "#8d8a5a", height: 0.34 },
      water: { color: "#27495a", shallow: "#5b8b8c" },
      trail: { surface: "dirt", color: "#76664a", width: 3 },
    },
    town: { look: "village", label: "Lower village" },
  },
];


/** One beat per story line: the first holds a wave, the middle ones build or tame, the last holds to `winAt`. */
function beatsFor(theme: Theme, tame: boolean): BeatWord[] {
  const [wall] = theme.structures;
  const wave = theme.wave.toLowerCase();
  return beats(theme.story, [
    { goal: `Build ${wall === undefined ? "a defence" : `a ${wall.label.toLowerCase()}`} and survive the first ${wave}`, fact: "camp.held", atLeast: 1 },
    tame && theme.allies.length > 0
      ? { goal: `${theme.allies[0]!.verb} a ${theme.allies[0]!.label.toLowerCase()}`, fact: "camp.tamed", atLeast: 1 }
      : { goal: `Hold 3 ${wave}s`, fact: "camp.held", atLeast: 3 },
    { goal: `Hold ${Math.ceil(theme.winAt / 1.4)} ${wave}s`, fact: "camp.held", atLeast: Math.ceil(theme.winAt / 1.4) },
    { goal: `Survive ${theme.winAt} ${wave}s`, fact: "camp.held", atLeast: theme.winAt },
  ]);
}

function read(text: string, said: readonly string[], options: { name?: string }): Idea {
  const theme = pickTheme(said, THEMES);
  const named = nameFor(text, theme.names, options);
  const tame = said.some((word) => ["tame", "taming", "pet", "pets", "companion", "dog", "ride", "ark"].includes(word));
  const nights = said.some((word) => word === "night" || word === "nights");
  const { words: _words, names: _names, story: _story, dressing: _dressing, town: _town, world, ...rest } = theme;
  return {
    ...rest,
    kind: "survival",
    ...named,
    pitch: text.trim(),
    wave: nights ? "Night" : theme.wave,
    allies: theme.allies,
    beats: beatsFor(theme, tame || theme.allies.length > 0),
    world: {
      relief: world.relief,
      frequency: world.frequency,
      waterLevel: world.waterLevel,
      scatter: world.scatter,
      // A day is two calms long and starts at 7:00, so every wave arrives at dusk and ends in the night.
      sky: { preset: world.preset, cycle: true, dayLength: theme.calm * 2, startHour: 7, haze: world.haze },
    },
  };
}

function themeOf(idea: Idea): Theme {
  return THEMES.find((theme) => theme.home.label === idea.home.label) ?? THEMES[0]!;
}

/**
 * The camp in a clearing at the middle; gather spots in clumps around it (crates in wreck yards,
 * trees in groves); herds out in the open; lairs in the treeline; a town or lake out past the
 * woods on a trail; forests, outcrops and meadows filling the land to the horizon.
 */
function scene(idea: Idea, layout: Layout): void {
  const theme = themeOf(idea);
  const dressing = theme.dressing;
  const cells = 14;
  const cell = 2;
  const half = (cells * cell) / 2;
  layout.take({ x: 0, z: 0 }, half + 4);
  layout.pad("camp-pad", { x: 0, z: 0 }, half + 8, undefined, 30);
  layout.marker({ id: "home", kind: "home", at: { x: 0, z: 0 }, label: idea.home.label, meta: { grid: cells, cell, clearance: 6 } });
  layout.marker({ id: "spawn", kind: "player_spawn", at: { x: 0, z: half - 4 }, rotationY: Math.PI, label: "Spawn", meta: { clearance: 3 } });

  // Places out past the woods first, so the trails to them are laid before anything else.
  const out = layout.turn();
  const destinations: { x: number; z: number }[] = [];
  if (theme.town !== undefined) {
    const at = { x: Math.round(Math.cos(out) * 120), z: Math.round(Math.sin(out) * 120) };
    town(layout, { id: "town", at, half: { x: 42, z: 36 }, look: theme.town.look, label: theme.town.label });
    destinations.push(at);
  }
  if (dressing.water !== undefined) {
    const angle = out + Math.PI * layout.between(0.6, 1.1);
    const at = { x: Math.round(Math.cos(angle) * 78), z: Math.round(Math.sin(angle) * 78) };
    lake(layout, { id: "lake", at, radius: 22, level: -0.6, dressing });
    destinations.push(at);
  }
  destinations.forEach((to, index) => {
    const length = Math.hypot(to.x, to.z);
    const from = { x: (to.x / length) * (half + 2), z: (to.z / length) * (half + 2) };
    trail(layout, { id: `trail-${index + 1}`, from, to: { x: to.x * 0.72, z: to.z * 0.72 }, dressing });
  });

  // Gather spots: two or three clumps per kind, a few spots each, a short walk from the camp.
  idea.nodes.forEach((node, kind) => {
    let made = 0;
    for (let clump = 0; clump < 3 && made < 8; clump += 1) {
      const center = layout.place(half + 10, half + 34 + kind * 4, 6, { x: 0, z: 0 }, false);
      if (center === null) continue;
      for (let index = 0; index < 3 && made < 8; index += 1) {
        const spot = layout.place(1.5, 6, 2.2, center);
        if (spot === null) continue;
        made += 1;
        layout.marker({ id: `${node.id}-${made}`, kind: "prop", catalogId: node.id, at: spot, rotationY: layout.turn(), label: node.label, meta: { node: node.id, clearance: 2 } });
      }
    }
  });
  idea.allies.forEach((ally) => {
    const herd = layout.place(half + 22, half + 46, 9, { x: 0, z: 0 }, false);
    if (herd === null) return;
    for (let index = 0; index < 3; index += 1) {
      const spot = layout.place(1, 6, 1.5, herd);
      if (spot === null) continue;
      layout.marker({ id: `${ally.id}-${index + 1}`, kind: "herd", at: spot, rotationY: layout.turn(), label: ally.label, meta: { ally: ally.id } });
    }
  });
  // Scenery in clumps at the camp's edge and along the way out.
  const props = idea.scenery.map((_, index) => `scenery${index + 1}`);
  for (let index = 0; index < 6; index += 1) {
    const at = layout.place(half + 6, half + 40, 5, { x: 0, z: 0 }, false);
    if (at === null) continue;
    cluster(layout, { id: `yard-${index + 1}`, at, radius: 5, props: [props[index % props.length]!, props[(index + 2) % props.length]!], count: 4, label: "Scenery", spacing: 1.8 });
  }
  // Lairs sit in the treeline, so waves come out of the woods.
  for (let index = 0; index < 4; index += 1) {
    const angle = Math.PI / 4 + (index * Math.PI) / 2 + layout.between(-0.25, 0.25);
    const at = { x: Math.round(Math.cos(angle) * 62), z: Math.round(Math.sin(angle) * 62) };
    layout.marker({ id: `lair-${index + 1}`, kind: "lair", at, label: `${idea.wave} comes from here` });
    forest(layout, { id: `lair-woods-${index + 1}`, at: { x: Math.round(Math.cos(angle) * 78), z: Math.round(Math.sin(angle) * 78) }, radius: 15, dressing, density: 0.16, label: "Lair woods" });
  }
  // Groves and brush between the camp and the treeline, so the walk out is never across bare ground.
  for (let index = 0; index < 6; index += 1) {
    const at = layout.place(half + 16, half + 44, 9, { x: 0, z: 0 }, false);
    if (at !== null) grove(layout, { id: `grove-${index + 1}`, at, radius: layout.between(6, 10), dressing });
  }
  wilds(layout, { dressing, inner: half + 20, outer: 230, forests: 12, outcrops: 8, drifts: 22 });
}

function readme(made: Idea): string {
  const [main] = made.resources;
  const [wall] = made.structures;
  return `# ${made.name}

${made.tagline} Made with \`bun run games:new\` from: "${made.pitch}". Start it with \`bun --cwd=games/${made.id} run dev\` from the repository root.

## Design checklist

Every word, cost and model below lives in \`src/game/idea.ts\`; places live in \`src/editor.scene.json\`.

- **Core loop.** ${made.nodes.map((node) => `${node.verb} ${node.label.toLowerCase()}s for ${node.gives}`).join(", ")};
  build ${made.structures.map((structure) => structure.label.toLowerCase()).join(", ")} on the grid around the ${made.home.label.toLowerCase()};
  every ${made.calm} seconds the sun sets and a ${made.wave.toLowerCase()} comes out of the woods for your walls, you and the ${made.home.label.toLowerCase()}.
- **Progression.**
  - [x] Waves grow: 3 attackers on the first, three more each time, and ${made.threats.slice(1).map((threat) => `${threat.label.toLowerCase()}s from ${made.wave.toLowerCase()} ${threat.from}`).join(", ")}.
  - [x] Buildings level up to 3 (E on a building); a level-3 ${made.structures.find((structure) => structure.role === "turret")?.label.toLowerCase() ?? "turret"} hits three times as hard.
  - [x] ${made.allies.length > 0 ? `${made.allies.map((ally) => ally.label).join(", ")} can be won over and fight beside you.` : "Producers keep resources coming between waves."}
  - [x] A ${made.beats.length}-beat story from ${made.guide.name} ends after ${made.winAt} ${made.wave.toLowerCase()}s held.
- **Failure states.** The ${made.home.label.toLowerCase()} has ${made.home.health} health; when it falls the run ends and you retry from the last save. You respawn 4 seconds after going down.
- **Minute 5 -> hour 5.** At 5:00 two ${made.wave.toLowerCase()}s are held behind a few ${wall?.label.toLowerCase() ?? "walls"} and ${main?.label.toLowerCase() ?? "resources"} is the limit. Later ${made.wave.toLowerCase()}s bring bigger attackers, so levelled buildings${made.allies.length > 0 ? " and allies" : ""} decide whether the ${made.home.label.toLowerCase()} stands.
- **References it is chasing.**
  - *7 Days to Die* - feel: scavenging by day for a defence that has to hold at night.
  - *ARK: Survival Evolved* - feel: gathering by hand into a camp that grows; tamed creatures that fight for you.
  - *They Are Billions* - density: a wave that is many bodies at once against walls you placed.
- **Gap to target.** One map and three building types; attackers only walk at you; no crafting tree yet.

Loop proof: ${made.id}-loop
`;
}

function loopFlow(made: Idea): Flow {
  // Flows run in play mode: capture.play has already left the title, so the first assert is in the game.
  const swings = Array.from({ length: 30 }, () => [{ key: "mouse0", ms: 120 }, { wait: 400 }]).flat();
  return {
    steps: [
      { assert: `/${made.beats[0]!.title}/i.test(document.body.innerText)`, before: { is: `/${made.beats[0]!.title}/i.test(document.body.innerText)`, timeoutMs: 60000 }, note: "arrival: a run is up and the first story beat started by itself" },
      { key: "Digit1", ms: 120, after: { is: "__jgProbe().built >= 1", timeoutMs: 8000 }, note: `build a ${made.structures[0]!.label.toLowerCase()} in front of you` },
      { key: "KeyN", ms: 120, after: { is: "__jgProbe().wave >= 1", timeoutMs: 10000 }, note: `call the first ${made.wave.toLowerCase()} early` },
      { assert: "__jgProbe().alive > 0", note: `arrival: the ${made.wave.toLowerCase()} spawned at the lairs, read from the game's own session` },
      { wait: 25000 },
      ...swings,
      { assert: "__jgProbe().alive < 3", before: { is: "__jgProbe().alive < 3", timeoutMs: 30000 }, note: "arrival: swings landed and attackers fell, so the fight is real and not only the spawn" },
    ],
  };
}

function clipFlow(_made: Idea): Flow {
  const swings = Array.from({ length: 24 }, () => [{ key: "mouse0", ms: 120 }, { wait: 450 }]).flat();
  return { steps: [{ wait: 21000 }, { key: "KeyW", ms: 600 }, ...swings, { assert: "__jgProbe().wave >= 1", note: "arrival: still in the night after the fight" }] };
}

export const kind: KindModule<Idea> = {
  kind: "survival",
  genre: "camp survival (gather by day, hold the night)",
  words: [],
  read,
  scene,
  readme,
  loopFlow,
  clipFlow,
  clipState: "wave",
};
