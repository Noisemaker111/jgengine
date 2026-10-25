/**
 * Colony: command a handful of colonists from a headquarters - select them, send them to gather,
 * place buildings on the grid round it, feed them, grow their number and fight off raids. Themes are
 * plain data rows (who the colonists are, what they gather, what they build, who raids them, which
 * models draw it all, how the land and sky look); the idea's words pick one.
 */
import type { BeatWord, ModelRef, WorldWord } from "../template/common/src/game/ideaShape";
import type { Idea } from "../template/colony/src/game/kindShape";
import { cluster, grove, lake, patch, trail, wilds, type Dressing } from "../world/dress";
import type { Layout, Spot } from "../world/layout";
import { beats, flowAssertText, nameFor, pickTheme } from "./shared";
import type { Flow, KindModule } from "./types";

type Theme = Omit<Idea, "kind" | "id" | "spec" | "name" | "pitch" | "beats" | "world"> & {
  words: readonly string[];
  names: readonly string[];
  story: readonly { title: string; pitch: string }[];
  world: Omit<WorldWord, "sky"> & { haze: number; preset: "day" | "dusk" | "night"; startHour: number };
  dressing: Dressing;
  /** Where the starter buildings of the `outpost` capture state go, in metres from the headquarters. */
  plan: readonly { structure: string; at: readonly [number, number] }[];
  /** A lake beside the colony (water themes only). */
  lake?: { at: readonly [number, number]; radius: number; level: number };
};

const NATURE = "/models/quaternius-stylized-nature";
const VILLAGE = "/models/quaternius-medieval-village";
const SETTLE = "/models/lantern-reach/settlements";
const PLAYERS = "/models/lantern-reach/players";
const CREATURES = "/models/lantern-reach/creatures";
const SPACE = "/models/kaykit-space-base";
const SCIFI = "/models/quaternius-modular-scifi";

const human = (name: string, tint?: string): ModelRef => ({ model: `human/${name}`, height: 2.3, ...(tint === undefined ? {} : { tint }) });

const THEMES: readonly Theme[] = [
  {
    words: ["mars", "martian", "red", "planet", "space", "sci", "fi", "scifi", "frontier", "base", "outpost", "station", "alien", "aliens", "moon", "terraform", "colony", "crew", "astronaut"],
    names: ["Red Frontier", "Ares Landing", "Dust Harbor", "Olympus Reach"],
    tagline: "A crew, a lander and red dust to the horizon. Mine it, grow food, hold off what comes out of the craters.",
    kit: "holo",
    look: "cinematic",
    mood: "day",
    accent: "#ff8a4c",
    ground: { material: "sand", low: "#7a3e2a", high: "#b86e4a" },
    guide: { name: "Director Okafor", title: "Mission control" },
    hq: { label: "Landing base", model: { model: `${SPACE}/basemodule_A.glb`, height: 7 }, beds: 4, size: [5, 5] },
    colonists: {
      label: "Crew",
      one: "Crewmate",
      start: 4,
      health: 100,
      speed: 5,
      damage: 14,
      models: [human("construction-worker"), human("soldier"), human("nurse"), human("man-casual", "#d8c8b8")],
    },
    resources: [
      { id: "food", label: "Rations", start: 60 },
      { id: "ore", label: "Ore", start: 40 },
      { id: "ice", label: "Ice", start: 20 },
    ],
    nodes: [
      { id: "ore_vein", label: "Ore vein", resource: "ore", carry: 6, work: 3, model: { model: `${SPACE}/rock_A.glb`, height: 6, tint: "#c98a5a" } },
      { id: "ice_field", label: "Ice field", resource: "ice", carry: 5, work: 3, model: { model: `${SPACE}/rocks_B.glb`, height: 3, tint: "#cfe8ff" } },
      { id: "supply_pod", label: "Supply pod", resource: "food", carry: 5, work: 2.5, model: { model: `${SPACE}/cargo_A_stacked.glb`, height: 2.6 } },
    ],
    structures: [
      { id: "habitat", label: "Habitat", role: "house", cost: { ore: 30 }, size: [4, 4], takes: 8, beds: 4, blurb: "Sleeps four more crew.", model: { model: `${SPACE}/basemodule_B.glb`, height: 5.5 } },
      { id: "greenhouse", label: "Greenhouse", role: "farm", cost: { ore: 25, ice: 15 }, size: [4, 4], takes: 10, rate: 0.45, blurb: "Grows rations from ice and light.", model: { model: `${SPACE}/basemodule_E.glb`, height: 5, tint: "#a8e6a0" } },
      { id: "depot", label: "Cargo depot", role: "store", cost: { ore: 20 }, size: [3, 3], takes: 6, blurb: "A closer drop-off for gatherers.", model: { model: `${SPACE}/cargodepot_A.glb`, height: 4 } },
      { id: "turret", label: "Defense turret", role: "tower", cost: { ore: 45, ice: 10 }, size: [2, 2], takes: 9, damage: 16, range: 20, shot: "laser", blurb: "Shoots raiders in reach.", model: { model: `${SPACE}/structure_low.glb`, height: 4.5 } },
      { id: "terraformer", label: "Terraformer", role: "crown", cost: { ore: 220, ice: 160, food: 80 }, size: [6, 6], takes: 40, blurb: "Starts turning Mars green. Wins the game.", model: { model: `${SPACE}/drill_structure.glb`, height: 13 } },
    ],
    raiders: {
      label: "Crater things",
      first: 60,
      every: 75,
      kinds: [
        { id: "skitter", label: "Skitter", health: 40, speed: 4, damage: 6, from: 1, model: { model: `${SCIFI}/Alien_Oculichrysalis.glb`, height: 3 } },
        { id: "cyclop", label: "Cyclop", health: 90, speed: 3.2, damage: 9, from: 2, model: { model: `${SCIFI}/Alien_Cyclop.glb`, height: 3.8 } },
        { id: "scolitex", label: "Scolitex", health: 320, speed: 2.6, damage: 16, from: 4, model: { model: `${SCIFI}/Alien_Scolitex.glb`, height: 6.5 } },
      ],
    },
    eats: 0.05,
    arrive: 25,
    story: [
      { title: "Boots on the dust", pitch: "Select your crew and set them to gathering: ore, ice and the supply pods." },
      { title: "Room to grow", pitch: "Build a habitat so more crew can come down." },
      { title: "Something in the craters", pitch: "They are coming. Hold the base through the first raid." },
      { title: "A real colony", pitch: "Grow the crew to eight." },
      { title: "Make it green", pitch: "Build the terraformer and Mars is ours." },
    ],
    scenery: [
      { model: `${SPACE}/containers_A.glb`, height: 2.2 },
      { model: `${SPACE}/solarpanel.glb`, height: 1.6 },
      { model: `${SPACE}/spacetruck.glb`, height: 2.4 },
      { model: `${SPACE}/cargo_B_stacked.glb`, height: 2.4 },
      { model: `${SCIFI}/Prop_Light_Floor.glb`, height: 1.5 },
      { model: `${SPACE}/lander_B.glb`, height: 4 },
    ],
    world: {
      relief: 6,
      frequency: 0.008,
      waterLevel: -40,
      haze: 0.55,
      preset: "day",
      startHour: 9,
      scatter: {
        spire: { model: `${SPACE}/rock_A.glb`, height: 8, tint: "#b0654a" },
        spire2: { model: `${SPACE}/rock_B.glb`, height: 10, tint: "#9a5540" },
        pebbles: { model: `${SPACE}/rocks_B.glb`, height: 1, tint: "#a86448" },
        rubble: { model: `${SPACE}/rocks_A.glb`, height: 1.6, tint: "#9a5a44" },
        boulder: { model: `${NATURE}/Rock_Medium_2.glb`, height: 2.4, tint: "#a0604a" },
        boulder2: { model: `${NATURE}/Rock_Medium_3.glb`, height: 3, tint: "#8a5040" },
      },
    },
    dressing: {
      forest: [{ item: "spire", weight: 3 }, { item: "spire2", weight: 2 }, { item: "boulder2", weight: 2 }],
      brush: [{ item: "pebbles", weight: 3 }, { item: "rubble", weight: 2 }],
      rocks: [{ item: "boulder", weight: 3 }, { item: "boulder2", weight: 2 }, { item: "rubble", weight: 2 }],
      // Low dust tufts: they also give the pointer ground to land on (bare terrain is not picked).
      grass: { base: "#7a3e2a", tip: "#a8603e", height: 0.14 },
      trail: { surface: "gravel", color: "#5a3426", width: 5 },
    },
    plan: [
      { structure: "habitat", at: [13, -10] },
      { structure: "greenhouse", at: [-13, -10] },
      { structure: "depot", at: [-14, 12] },
      { structure: "turret", at: [12, 14] },
      { structure: "turret", at: [-2, -20] },
    ],
  },
  {
    words: ["homestead", "frontier", "wild", "wilderness", "settlers", "settler", "village", "medieval", "fantasy", "tribe", "pioneer", "pioneers", "forest", "goblin", "goblins", "orc", "orcs", "valley", "camp", "kingdom"],
    names: ["Elderbrook", "Wolfhollow", "Fernwatch", "Last Hearth"],
    tagline: "Settlers, a longhouse and the deep woods. Cut, quarry, farm, and keep the goblins out.",
    kit: "parchment",
    look: "cinematic",
    mood: "golden",
    accent: "#d9a441",
    ground: { material: "grass", low: "#4a6530", high: "#88904e" },
    guide: { name: "Elder Rowan", title: "Settlement elder" },
    hq: { label: "Longhouse", model: { model: `${SETTLE}/settlement-10.glb`, height: 9 }, beds: 4, size: [5, 5] },
    colonists: {
      label: "Settlers",
      one: "Settler",
      start: 4,
      health: 100,
      speed: 5,
      damage: 14,
      models: [
        { model: `${PLAYERS}/ranger.glb`, height: 2.5 },
        { model: `${PLAYERS}/barbarian.glb`, height: 2.5 },
        { model: `${PLAYERS}/druid.glb`, height: 2.5 },
        { model: `${PLAYERS}/rogue.glb`, height: 2.5 },
      ],
    },
    resources: [
      { id: "food", label: "Food", start: 60 },
      { id: "wood", label: "Wood", start: 40 },
      { id: "stone", label: "Stone", start: 20 },
    ],
    nodes: [
      { id: "timber", label: "Timber", resource: "wood", carry: 6, work: 3, model: { model: `${NATURE}/CommonTree_1.glb`, height: 9 } },
      { id: "quarry", label: "Quarry", resource: "stone", carry: 5, work: 3, model: { model: `${NATURE}/Rock_Medium_3.glb`, height: 3 } },
      { id: "berries", label: "Berry thicket", resource: "food", carry: 5, work: 2.5, model: { model: `${NATURE}/Bush_Common_Flowers.glb`, height: 1.8 } },
    ],
    structures: [
      { id: "cottage", label: "Cottage", role: "house", cost: { wood: 30 }, size: [4, 4], takes: 8, beds: 4, blurb: "Sleeps four more settlers.", model: { model: `${SETTLE}/settlement-1.glb`, height: 6.5 } },
      { id: "farm", label: "Farm", role: "farm", cost: { wood: 25, stone: 15 }, size: [5, 5], takes: 10, rate: 0.45, blurb: "Grows food.", model: { model: `${SETTLE}/settlement-5.glb`, height: 7.5 } },
      { id: "storehouse", label: "Storehouse", role: "store", cost: { wood: 20 }, size: [3, 3], takes: 6, blurb: "A closer drop-off for gatherers.", model: { model: `${SETTLE}/settlement-6.glb`, height: 5 } },
      { id: "watchtower", label: "Watchtower", role: "tower", cost: { wood: 40, stone: 15 }, size: [2, 2], takes: 9, damage: 16, range: 20, shot: "arrow", blurb: "Archers shoot raiders in reach.", model: { model: `${SETTLE}/settlement-7.glb`, height: 8 } },
      { id: "townhall", label: "Town hall", role: "crown", cost: { wood: 220, stone: 160, food: 80 }, size: [6, 6], takes: 40, blurb: "The settlement becomes a town. Wins the game.", model: { model: `${SETTLE}/settlement-3.glb`, height: 15 } },
    ],
    raiders: {
      label: "Goblins",
      first: 60,
      every: 75,
      kinds: [
        { id: "goblin", label: "Goblin", health: 40, speed: 4, damage: 6, from: 1, model: { model: `${CREATURES}/goblin.glb`, height: 2.4 } },
        { id: "orc", label: "Orc", health: 90, speed: 3.2, damage: 9, from: 2, model: { model: `${CREATURES}/orcenemy.glb`, height: 3.2 } },
        { id: "giant", label: "Hill giant", health: 320, speed: 2.6, damage: 16, from: 4, model: { model: `${CREATURES}/giant.glb`, height: 5 } },
      ],
    },
    eats: 0.05,
    arrive: 25,
    story: [
      { title: "A clearing in the woods", pitch: "Select your settlers and set them to gathering: timber, stone and berries." },
      { title: "Room to grow", pitch: "Build a cottage so more settlers can come." },
      { title: "Smoke in the trees", pitch: "Goblins are coming. Hold the settlement through the first raid." },
      { title: "A proper village", pitch: "Grow the settlement to eight." },
      { title: "A town at last", pitch: "Build the town hall and the valley is ours." },
    ],
    scenery: [
      { model: `${VILLAGE}/Prop_Wagon.glb`, height: 1.8 },
      { model: `${VILLAGE}/Prop_Crate.glb`, height: 1 },
      { model: `${VILLAGE}/Prop_WoodenFence_Single.glb`, height: 1.2 },
      { model: `${NATURE}/Bush_Common.glb`, height: 1.1 },
      { model: `${NATURE}/Rock_Medium_2.glb`, height: 1.4 },
      { model: `${NATURE}/DeadTree_2.glb`, height: 6 },
    ],
    world: {
      relief: 5,
      frequency: 0.009,
      waterLevel: -40,
      haze: 0.35,
      preset: "day",
      startHour: 9,
      scatter: {
        tree: { model: `${NATURE}/CommonTree_2.glb`, height: 9 },
        tree2: { model: `${NATURE}/CommonTree_1.glb`, height: 10 },
        tree3: { model: `${NATURE}/CommonTree_4.glb`, height: 9 },
        pine: { model: `${NATURE}/Pine_2.glb`, height: 10 },
        bush: { model: `${NATURE}/Bush_Common.glb`, height: 1.1 },
        flower: { model: `${NATURE}/Flower_3_Group.glb`, height: 0.5 },
        fern: { model: `${NATURE}/Fern_1.glb`, height: 0.9 },
        rock: { model: `${NATURE}/Rock_Medium_2.glb`, height: 1.8 },
        rock2: { model: `${NATURE}/Rock_Medium_3.glb`, height: 2.4 },
      },
    },
    dressing: {
      forest: [{ item: "tree", weight: 3 }, { item: "tree2", weight: 3 }, { item: "tree3", weight: 2 }, { item: "pine", weight: 2 }],
      brush: [{ item: "bush", weight: 2 }, { item: "flower", weight: 2 }, { item: "fern", weight: 2 }],
      rocks: [{ item: "rock", weight: 3 }, { item: "rock2", weight: 2 }],
      grass: { base: "#4a6530", tip: "#a2a860", height: 0.34 },
      water: { color: "#2f5f78", shallow: "#5a9aa0" },
      trail: { surface: "dirt", color: "#7a6446", width: 5 },
    },
    plan: [
      { structure: "cottage", at: [13, -10] },
      { structure: "farm", at: [-13, -10] },
      { structure: "storehouse", at: [-14, 12] },
      { structure: "watchtower", at: [12, 14] },
      { structure: "watchtower", at: [-2, -20] },
    ],
    lake: { at: [58, -54], radius: 16, level: -1.2 },
  },
];

/** Gather, house, hold a raid, grow, crown. */
function beatsFor(theme: Theme): BeatWord[] {
  const crown = theme.structures.find((structure) => structure.role === "crown")!;
  const house = theme.structures.find((structure) => structure.role === "house")!;
  return beats(theme.story, [
    { goal: "Gather 20 of anything", fact: "colony.gathered", atLeast: 20 },
    { goal: `Build a ${house.label.toLowerCase()}`, fact: "colony.homes", atLeast: 2 },
    { goal: "Beat off the first raid", fact: "colony.raids", atLeast: 1 },
    { goal: `Have ${theme.colonists.start * 2} ${theme.colonists.label.toLowerCase()}`, fact: "colony.people", atLeast: theme.colonists.start * 2 },
    { goal: `Build the ${crown.label.toLowerCase()}`, fact: "colony.crowns", atLeast: 1 },
  ]);
}

function read(text: string, said: readonly string[], options: { name?: string }): Idea {
  const theme = pickTheme(said, THEMES);
  const named = nameFor(text, theme.names, options);
  const { words: _words, names: _names, story: _story, dressing: _dressing, plan: _plan, lake: _lake, world, ...rest } = theme;
  return {
    ...rest,
    kind: "colony",
    ...named,
    pitch: text.trim(),
    beats: beatsFor(theme),
    grid: { cells: 30, cell: 2 },
    world: {
      relief: world.relief,
      frequency: world.frequency,
      waterLevel: world.waterLevel,
      scatter: world.scatter,
      // A day lasts fifteen minutes: dawn to dusk over a colony's first hour is four days.
      sky: { preset: world.preset, cycle: true, dayLength: 900, startHour: world.startHour, haze: world.haze },
    },
  };
}

function themeOf(idea: Idea): Theme {
  return THEMES.find((theme) => theme.hq.label === idea.hq.label) ?? THEMES[0]!;
}

/** Gathering nodes in a ring just outside the build grid, each kind twice, so every side has work. */
const NODE_RING: readonly (readonly [number, number])[] = [[38, 6], [-8, 38], [-38, -4], [10, -38], [30, 30], [-30, 28], [-30, -30], [32, -26], [44, -10]];
/** Raid camps out past the clearing. */
const CAMPS: readonly (readonly [number, number])[] = [[-70, 22], [62, 44], [20, -72]];

/**
 * The clearing in the middle, level: the headquarters and its grid, gathering nodes round it, trails
 * out to the raid camps; outside it forests or spires to the horizon.
 */
function scene(idea: Idea, layout: Layout): void {
  const theme = themeOf(idea);
  const dressing = theme.dressing;
  const hq: Spot = { x: 0, z: 0 };

  layout.pad("clearing", hq, 52, undefined, 24);
  layout.marker({ id: "hq", kind: "hq", at: hq, label: idea.hq.label, meta: { grid: idea.grid.cells, cell: idea.grid.cell } });
  const half = (idea.grid.cells * idea.grid.cell) / 2;
  layout.take(hq, half + 2);

  NODE_RING.forEach(([x, z], index) => {
    const node = idea.nodes[index % idea.nodes.length]!;
    layout.marker({ id: `node-${index + 1}`, kind: "node", at: { x, z }, label: node.label, meta: { node: node.id } });
    layout.take({ x, z }, 5);
  });
  theme.plan.forEach((entry, index) => {
    layout.marker({ id: `plan-${index + 1}`, kind: "plan", at: { x: entry.at[0], z: entry.at[1] }, label: `Plan: ${entry.structure}`, meta: { structure: entry.structure } });
  });

  const props = idea.scenery.map((_, index) => `scenery${index + 1}`);
  CAMPS.forEach(([x, z], index) => {
    const at = { x, z };
    layout.marker({ id: `raid-${index + 1}`, kind: "raid", at, label: `${idea.raiders.label} camp` });
    trail(layout, { id: `raid-trail-${index + 1}`, from: { x: x * 0.45, z: z * 0.45 }, to: at, dressing, label: "Raid trail" });
    cluster(layout, { id: `camp-${index + 1}`, at, radius: 7, props: [props[5]!, props[4]!, props[0]!], count: 6, label: "Raid camp", spacing: 2 });
    layout.take(at, 9);
  });

  // Yards round the clearing's edge, so the colony sits in a lived-in place.
  for (let index = 0; index < 8; index += 1) {
    const at = layout.place(half + 6, 58, 4, hq);
    if (at !== null) cluster(layout, { id: `yard-${index + 1}`, at, radius: 3.5, props: [props[index % 4]!, props[(index + 1) % 4]!], count: 3, label: "Yard", spacing: 1.6 });
  }
  for (let index = 0; index < 6; index += 1) {
    const at = layout.place(half + 8, 64, 6, hq);
    if (at !== null) patch(layout, { id: `edge-rocks-${index + 1}`, at, radius: 4, palette: dressing.rocks, density: 0.16, label: "Rocks", minScale: 0.7, maxScale: 1.6 });
  }
  if (theme.lake !== undefined) lake(layout, { id: "lake", at: { x: theme.lake.at[0], z: theme.lake.at[1] }, radius: theme.lake.radius, level: theme.lake.level, dressing });
  for (let index = 0; index < 6; index += 1) {
    const at = layout.place(60, 90, 9, hq, false);
    if (at !== null) grove(layout, { id: `grove-${index + 1}`, at, radius: layout.between(6, 11), dressing });
  }
  layout.take(hq, 58);
  wilds(layout, { dressing, inner: 80, outer: 250, forests: 14, outcrops: 8, drifts: 20, meadow: 120 });
}

function readme(made: Idea): string {
  const crown = made.structures.find((structure) => structure.role === "crown")!;
  const people = made.colonists.label.toLowerCase();
  return `# ${made.name}

${made.tagline} Made with \`bun run games:new\` from: "${made.pitch}". Start it with \`bun --cwd=games/${made.id} run dev\` from the repository root.

## Design checklist

Every word, cost and model below lives in \`src/game/idea.ts\`; the headquarters, nodes, camps and starter plan live in \`src/editor.scene.json\`.

- **Core loop.** Select ${people} (click, drag, or F) and right click: a node to gather, a raider to fight, ground to walk.
  Gatherers haul to the nearest store; ${made.resources.map((resource) => resource.label.toLowerCase()).join(", ")} pay for buildings placed on the grid with the number keys and a right click.
- **Progression.**
  - [x] Buildings: ${made.structures.map((structure) => structure.label).join(", ")}.
  - [x] Houses add beds; a free bed and food to spare bring a new ${made.colonists.one.toLowerCase()} every ${made.arrive}s.
  - [x] Raids every ${made.raiders.every}s, bigger each time, tougher kinds from the second and fourth.
  - [x] A ${made.beats.length}-beat story from ${made.guide.name}, won by building the ${crown.label.toLowerCase()}.
- **Failure states.** Food runs out and everyone weakens; the last ${made.colonists.one.toLowerCase()} falls and the run ends with a result card and a retry.
- **Minute 5 -> hour 5.** At 5:00 a dozen ${people} work three kinds of node with a house, farm and turret up; later it is how many gather versus guard, and when to save for the ${crown.label.toLowerCase()}.
- **References it is chasing.**
  - *RimWorld* - feel: a few named colonists, raids that test the base.
  - *Age of Empires* - commands: drag-select, right click to gather or fight, drop-off buildings.
  - *Banished* - pressure: food against growth.
- **Gap to target.** No colonist needs or moods, no walls, no tech tree, no pathfinding round buildings.

Loop proof: ${made.id}-loop
`;
}

/** Select the crew, walk them with a right click, set them gathering, build a house, hold the first raid. */
function loopFlow(made: Idea): Flow {
  const start = made.colonists.start;
  return {
    steps: [
      { assert: flowAssertText(made.beats[0]!.title), before: { is: flowAssertText(made.beats[0]!.title), timeoutMs: 60000 }, note: "arrival: the colony is up and the first story beat started by itself" },
      { assert: `__jgProbe().people === ${start}`, before: { is: `__jgProbe().people === ${start}`, timeoutMs: 10000 }, note: `arrival: ${start} ${made.colonists.label.toLowerCase()} stand at the ${made.hq.label.toLowerCase()}` },
      { key: "KeyF", ms: 120, after: { is: `__jgProbe().selected === ${start}`, timeoutMs: 5000 }, note: "F selects everyone" },
      { rightClickAt: [900, 300], after: { is: "__jgProbe().moving >= 1", timeoutMs: 5000 }, note: "right click open ground: they walk there" },
      { key: "KeyG", ms: 120, after: { is: "__jgProbe().gathering >= 1", timeoutMs: 5000 }, note: "G sends the selected to the nearest node" },
      { assert: "__jgProbe().gathered >= 5", before: { is: "__jgProbe().gathered >= 5", timeoutMs: 60000 }, note: "arrival: the first load is hauled home" },
      { key: "Digit1", ms: 120, after: { is: "__jgProbe().armed === 1 && __jgProbe().selected === 0", timeoutMs: 5000 }, note: `pick up a ${made.structures[0]!.label.toLowerCase()}` },
      { rightClickAt: [1000, 600], after: { is: "__jgProbe().building >= 1 || __jgProbe().structures >= 1", timeoutMs: 5000 }, note: "right click inside the grid: building starts" },
      { assert: "__jgProbe().homes >= 2", before: { is: "__jgProbe().homes >= 2", timeoutMs: 30000 }, note: "arrival: the house is built" },
      { assert: "__jgProbe().raiding === 1", before: { is: "__jgProbe().raiding === 1", timeoutMs: 90000 }, note: "arrival: the first raid comes" },
      { assert: "__jgProbe().raids >= 1 && __jgProbe().people >= 1", before: { is: "__jgProbe().raids >= 1", timeoutMs: 90000 }, note: "arrival: the raid is beaten off" },
    ],
  };
}

function clipFlow(_made: Idea): Flow {
  return {
    steps: [
      { wait: 7000 },
      { key: "KeyQ", ms: 700 },
      { wait: 8000 },
      { key: "KeyE", ms: 1400 },
      { wait: 8000 },
      { key: "KeyQ", ms: 700 },
      { wait: 7000 },
      { assert: "__jgProbe().gathered >= 10 && (__jgProbe().raiding === 1 || __jgProbe().raids >= 1)", note: "arrival: the crew hauled loads and the raid hit the base" },
    ],
  };
}

export const kind: KindModule<Idea> = {
  kind: "colony",
  genre: "colony RTS (select colonists, gather, build, survive raids)",
  words: [],
  read,
  scene,
  readme,
  loopFlow,
  clipFlow,
  clipState: "outpost",
};
