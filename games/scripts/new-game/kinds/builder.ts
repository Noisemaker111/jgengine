/**
 * Builder: found a settlement, house its people, set them to work, climb from hamlet to town to the
 * crowning build. Themes are plain data rows (what the realm stores, what it builds and which models
 * draw it, how the land and sky look); the idea's words pick and tune one. New themes are new rows.
 */
import type { BeatWord, ModelRef, WorldWord } from "../template/common/src/game/ideaShape";
import type { BuildingWord, Idea } from "../template/builder/src/game/kindShape";
import { cluster, forest, grove, lake, patch, trail, wilds, town, type Dressing, type TownLook } from "../world/dress";
import type { Layout } from "../world/layout";
import { beats, flowAssertText, nameFor, pickTheme } from "./shared";
import type { Flow, KindModule } from "./types";

type Theme = Omit<Idea, "kind" | "id" | "spec" | "name" | "pitch" | "beats" | "world" | "grid"> & {
  words: readonly string[];
  names: readonly string[];
  story: readonly { title: string; pitch: string }[];
  world: Omit<WorldWord, "sky"> & { haze: number; preset: "day" | "dusk" | "night"; startHour: number };
  dressing: Dressing;
  /** A neighbouring town out on a trail, from the city studio. */
  neighbour?: { look: TownLook; label: string };
  /** Starter layout for the `town` capture state: building id and offset from the seat in metres. */
  plan: readonly { building: string; at: readonly [number, number] }[];
};

const NATURE = "/models/quaternius-stylized-nature";
const VILLAGE = "/models/quaternius-medieval-village";
const SETTLE = "/models/lantern-reach/settlements";
const CITY = "/models/kaykit-city-builder";
const PLAYERS = "/models/lantern-reach/players";

const THEMES: readonly Theme[] = [
  {
    words: ["castle", "medieval", "kingdom", "king", "queen", "village", "keep", "lord", "fantasy", "feudal", "knight", "knights", "realm", "fort", "fortress"],
    names: ["Kingsreach", "Stonehallow", "Highmarch", "Ashford Keep", "Briarcrown"],
    tagline: "Found a hamlet. Feed it, house it, grow it into a castle town.",
    kit: "parchment",
    look: "cinematic",
    mood: "golden",
    accent: "#d9a441",
    ground: { material: "grass", low: "#4f6a30", high: "#8b9450" },
    guide: { name: "Steward Aldric", title: "Your steward" },
    seat: { label: "Lord's hall", model: { model: `${SETTLE}/settlement-10.glb`, height: 9 }, houses: 6, size: [6, 6] },
    people: {
      label: "Villagers",
      walkers: [
        { model: `${PLAYERS}/rogue_hooded.glb`, height: 1.75 },
        { model: `${PLAYERS}/druid.glb`, height: 1.75 },
        { model: `${PLAYERS}/ranger.glb`, height: 1.75 },
        { model: `${PLAYERS}/barbarian.glb`, height: 1.8 },
      ],
    },
    resources: [
      { id: "food", label: "Food", start: 60 },
      { id: "wood", label: "Wood", start: 90 },
      { id: "stone", label: "Stone", start: 0 },
      { id: "gold", label: "Gold", start: 20 },
    ],
    buildings: [
      { id: "house", label: "Cottage", role: "home", key: "1", tier: 1, cost: { wood: 20 }, size: [4, 4], takes: 6, houses: 4, blurb: "Four villagers move in.", model: { model: `${SETTLE}/settlement-1.glb`, height: 6.5 } },
      { id: "farm", label: "Farmstead", role: "producer", key: "2", tier: 1, cost: { wood: 25 }, size: [5, 5], takes: 8, staff: 2, makes: "food", rate: 0.8, blurb: "Two farmers grow food.", model: { model: `${SETTLE}/settlement-5.glb`, height: 7.5 } },
      { id: "lumber", label: "Lumber camp", role: "producer", key: "3", tier: 1, cost: { wood: 15, food: 10 }, size: [3, 3], takes: 6, staff: 2, makes: "wood", rate: 0.45, blurb: "Two woodcutters haul timber.", model: { model: `${VILLAGE}/Prop_Wagon.glb`, height: 2.6 } },
      { id: "quarry", label: "Quarry", role: "producer", key: "4", tier: 2, cost: { wood: 40, food: 20 }, size: [5, 3], takes: 10, staff: 3, makes: "stone", rate: 0.35, blurb: "Three masons cut stone.", model: { model: "/models/kaykit-dungeon/rubble_large.glb", height: 3.2 } },
      { id: "manor", label: "Manor", role: "home", key: "5", tier: 2, cost: { wood: 40, stone: 30 }, size: [6, 6], takes: 14, houses: 10, blurb: "Ten villagers move in.", model: { model: `${SETTLE}/settlement-2.glb`, height: 10 } },
      { id: "guild", label: "Guildhall", role: "producer", key: "6", tier: 2, cost: { wood: 50, stone: 40 }, size: [5, 5], takes: 14, staff: 4, makes: "gold", rate: 0.3, blurb: "Four merchants trade for gold.", model: { model: `${SETTLE}/settlement-4.glb`, height: 8.5 } },
      { id: "keep", label: "Castle keep", role: "crown", key: "7", tier: 3, cost: { wood: 150, stone: 200, gold: 120 }, size: [7, 7], takes: 40, blurb: "The keep crowns the realm.", model: { model: `${SETTLE}/settlement-3.glb`, height: 22 } },
    ],
    tiers: [
      { label: "Hamlet", people: 0, note: "A hamlet takes root." },
      { label: "Town", people: 22, note: "The hamlet is a town now: quarries, manors and guilds can be built." },
      { label: "Castle town", people: 50, note: "A castle town: the keep can be raised." },
    ],
    eats: 0.05,
    tax: 0.02,
    coin: "gold",
    story: [
      { title: "A roof for everyone", pitch: "Your people sleep under carts. Raise cottages around the hall." },
      { title: "Hands and harvest", pitch: "Idle hands go hungry. Set them to farm and fell trees." },
      { title: "From hamlet to town", pitch: "Grow to twenty-two souls and the hamlet becomes a town." },
      { title: "Fill the treasury", pitch: "A keep is paid for in gold. Build a guildhall and let trade flow." },
      { title: "Raise the keep", pitch: "Stone, timber and gold: raise the castle keep and the realm is yours." },
    ],
    scenery: [
      { model: `${VILLAGE}/Prop_Crate.glb`, height: 0.9 },
      { model: `${VILLAGE}/Prop_WoodenFence_Single.glb`, height: 1.4 },
      { model: "/models/kaykit-dungeon/barrel_large.glb", height: 1.2 },
      { model: `${VILLAGE}/Prop_Wagon.glb`, height: 1.8 },
      { model: "/models/kaykit-dungeon/banner_patternA_red.glb", height: 3.2 },
      { model: "/models/kaykit-dungeon/crates_stacked.glb", height: 1.6 },
    ],
    world: {
      relief: 6,
      frequency: 0.009,
      waterLevel: -40,
      haze: 0.35,
      preset: "day",
      startHour: 8,
      scatter: {
        pine: { model: `${NATURE}/Pine_1.glb`, height: 11 },
        pine2: { model: `${NATURE}/Pine_4.glb`, height: 9 },
        tree: { model: `${NATURE}/CommonTree_2.glb`, height: 9 },
        tree2: { model: `${NATURE}/CommonTree_1.glb`, height: 10 },
        tree3: { model: `${NATURE}/CommonTree_4.glb`, height: 9 },
        bush: { model: `${NATURE}/Bush_Common.glb`, height: 1.1 },
        flower: { model: `${NATURE}/Flower_3_Group.glb`, height: 0.5 },
        fern: { model: `${NATURE}/Fern_1.glb`, height: 0.9 },
        rock: { model: `${NATURE}/Rock_Medium_2.glb`, height: 1.8 },
        rock2: { model: `${NATURE}/Rock_Medium_3.glb`, height: 2.4 },
      },
    },
    dressing: {
      forest: [{ item: "pine", weight: 2 }, { item: "pine2", weight: 1 }, { item: "tree", weight: 3 }, { item: "tree2", weight: 3 }, { item: "tree3", weight: 2 }],
      brush: [{ item: "bush", weight: 2 }, { item: "flower", weight: 2 }, { item: "fern", weight: 2 }],
      rocks: [{ item: "rock", weight: 3 }, { item: "rock2", weight: 2 }],
      grass: { base: "#4f6a30", tip: "#a2a860", height: 0.36 },
      water: { color: "#27495a", shallow: "#5b8b8c" },
      trail: { surface: "dirt", color: "#7a6446", width: 3.5 },
    },
    neighbour: { look: "village", label: "Old village" },
    plan: [
      { building: "house", at: [-14, -10] },
      { building: "house", at: [-14, 0] },
      { building: "house", at: [-14, 10] },
      { building: "farm", at: [14, -10] },
      { building: "lumber", at: [12, 10] },
    ],
  },
  {
    words: ["city", "cities", "modern", "metropolis", "tycoon", "skyline", "downtown", "urban", "mayor", "suburb", "suburbs", "skyscraper"],
    names: ["Brightvale", "New Harbor", "Ridgeview", "Maple Heights"],
    tagline: "Zone it, staff it, grow it: from a main street to a skyline.",
    kit: "signal",
    look: "cinematic",
    mood: "day",
    accent: "#4fb3ff",
    ground: { material: "grass", low: "#4d6b35", high: "#86955a" },
    guide: { name: "Deputy Mayor Reyes", title: "Your deputy" },
    seat: { label: "City hall", model: { model: `${CITY}/building_D.glb`, height: 13 }, houses: 8, size: [6, 6] },
    people: {
      label: "Citizens",
      walkers: [
        { model: "human/man-casual", height: 1.8 },
        { model: "human/woman-casual", height: 1.7 },
        { model: "human/businessman", height: 1.8 },
        { model: "human/jogger", height: 1.75 },
      ],
    },
    resources: [
      { id: "food", label: "Food", start: 60 },
      { id: "goods", label: "Goods", start: 90 },
      { id: "cash", label: "Cash", start: 40 },
    ],
    buildings: [
      { id: "apartments", label: "Apartments", role: "home", key: "1", tier: 1, cost: { goods: 20 }, size: [4, 4], takes: 6, houses: 5, blurb: "Five citizens move in.", model: { model: `${CITY}/building_A.glb`, height: 7 } },
      { id: "grocer", label: "Grocer", role: "producer", key: "2", tier: 1, cost: { goods: 25 }, size: [4, 4], takes: 8, staff: 2, makes: "food", rate: 0.8, blurb: "Two grocers keep the city fed.", model: { model: `${CITY}/building_B.glb`, height: 7 } },
      { id: "workshop", label: "Workshop", role: "producer", key: "3", tier: 1, cost: { goods: 15, food: 10 }, size: [4, 4], takes: 6, staff: 2, makes: "goods", rate: 0.45, blurb: "Two makers turn out goods.", model: { model: `${CITY}/building_E.glb`, height: 9 } },
      { id: "tower", label: "High-rise", role: "home", key: "4", tier: 2, cost: { goods: 50, cash: 30 }, size: [4, 4], takes: 14, houses: 12, blurb: "Twelve citizens move in.", model: { model: `${CITY}/building_G.glb`, height: 18 } },
      { id: "office", label: "Offices", role: "producer", key: "5", tier: 2, cost: { goods: 60, food: 20 }, size: [4, 4], takes: 12, staff: 4, makes: "cash", rate: 0.35, blurb: "Four clerks bring in cash.", model: { model: `${CITY}/building_H.glb`, height: 16 } },
      { id: "spire", label: "Skyline spire", role: "crown", key: "6", tier: 3, cost: { goods: 220, cash: 180 }, size: [5, 5], takes: 40, blurb: "The spire puts the city on the map.", model: { model: `${CITY}/building_C.glb`, height: 40 } },
    ],
    tiers: [
      { label: "Main street", people: 0, note: "A main street opens." },
      { label: "Town", people: 24, note: "A real town now: high-rises and offices can be built." },
      { label: "City", people: 56, note: "A city: raise the skyline spire." },
    ],
    eats: 0.05,
    tax: 0.03,
    coin: "cash",
    story: [
      { title: "Move-in day", pitch: "The council wants homes. Put up apartments around city hall." },
      { title: "Open for business", pitch: "People need groceries and work. Open a grocer and a workshop." },
      { title: "Town status", pitch: "Twenty-four citizens and the state calls you a town." },
      { title: "Cash flow", pitch: "Big projects need cash. Offices will bring it in." },
      { title: "The skyline", pitch: "Raise the skyline spire and the city is on every map." },
    ],
    scenery: [
      { model: "city/street-lamp", height: 5 },
      { model: "city/fire-hydrant", height: 0.8 },
      { model: "park/bench", height: 0.9 },
      { model: `${CITY}/car_sedan.glb`, height: 1.5 },
      { model: `${CITY}/car_taxi.glb`, height: 1.5 },
      { model: "park/potted-plant", height: 1.2 },
    ],
    world: {
      relief: 3,
      frequency: 0.008,
      waterLevel: -40,
      haze: 0.3,
      preset: "day",
      startHour: 9,
      scatter: {
        tree: { model: `${NATURE}/CommonTree_1.glb`, height: 9 },
        tree2: { model: `${NATURE}/CommonTree_3.glb`, height: 8 },
        tree3: { model: `${NATURE}/CommonTree_4.glb`, height: 9 },
        pine: { model: `${NATURE}/Pine_2.glb`, height: 10 },
        bush: { model: `${NATURE}/Bush_Common.glb`, height: 1.1 },
        flower: { model: `${NATURE}/Flower_3_Group.glb`, height: 0.5 },
        rock: { model: `${NATURE}/Rock_Medium_1.glb`, height: 1.4 },
      },
    },
    dressing: {
      forest: [{ item: "tree", weight: 3 }, { item: "tree2", weight: 2 }, { item: "tree3", weight: 2 }, { item: "pine", weight: 1 }],
      brush: [{ item: "bush", weight: 3 }, { item: "flower", weight: 2 }],
      rocks: [{ item: "rock", weight: 3 }],
      grass: { base: "#4d6b35", tip: "#9aa860", height: 0.3 },
      water: { color: "#2a5f78", shallow: "#5aa0b0" },
      trail: { surface: "road", color: "#3c3f44", width: 7 },
    },
    neighbour: { look: "town", label: "Old town" },
    plan: [
      { building: "apartments", at: [-14, -10] },
      { building: "apartments", at: [-14, 0] },
      { building: "apartments", at: [-14, 10] },
      { building: "grocer", at: [14, -10] },
      { building: "workshop", at: [14, 10] },
    ],
  },
];

/** One beat per story line: homes, workplaces, the next tier, the coin, the crowning build. */
function beatsFor(theme: Theme): BeatWord[] {
  const crown = theme.buildings.find((building) => building.role === "crown");
  const home = theme.buildings.find((building) => building.role === "home")!;
  const coin = theme.resources.find((resource) => resource.id === theme.coin)!;
  return beats(theme.story, [
    { goal: `Build 3 ${home.label.toLowerCase()}s`, fact: "realm.homes", atLeast: 3 },
    { goal: "Get 3 workplaces running", fact: "realm.producers", atLeast: 3 },
    { goal: `Reach ${theme.tiers[1]?.people ?? 10} ${theme.people.label.toLowerCase()}`, fact: "realm.tier", atLeast: 2 },
    { goal: `Save ${Math.round((crown?.cost[theme.coin] ?? 100) * 1)} ${coin.label.toLowerCase()}`, fact: `realm.${theme.coin}`, atLeast: crown?.cost[theme.coin] ?? 100 },
    { goal: `Raise the ${crown?.label.toLowerCase() ?? "crown"}`, fact: "realm.crowns", atLeast: 1 },
  ]);
}

function read(text: string, said: readonly string[], options: { name?: string }): Idea {
  const theme = pickTheme(said, THEMES);
  const named = nameFor(text, theme.names, options);
  const { words: _words, names: _names, story: _story, dressing: _dressing, neighbour: _neighbour, plan: _plan, world, ...rest } = theme;
  return {
    ...rest,
    kind: "builder",
    ...named,
    pitch: text.trim(),
    beats: beatsFor(theme),
    grid: { cells: 34, cell: 2 },
    world: {
      relief: world.relief,
      frequency: world.frequency,
      waterLevel: world.waterLevel,
      scatter: world.scatter,
      // A day lasts ten minutes of play: long enough to watch a town grow under one sun.
      sky: { preset: world.preset, cycle: true, dayLength: 600, startHour: world.startHour, haze: world.haze },
    },
  };
}

function themeOf(idea: Idea): Theme {
  return THEMES.find((theme) => theme.seat.label === idea.seat.label) ?? THEMES[0]!;
}

/**
 * The build ground at the middle, level and clear, its seat in the centre; a neighbouring town and a
 * lake out on trails; groves and prop yards ringing the ground; forests, outcrops and meadows to the
 * horizon.
 */
function scene(idea: Idea, layout: Layout): void {
  const theme = themeOf(idea);
  const dressing = theme.dressing;
  const half = (idea.grid.cells * idea.grid.cell) / 2;
  layout.take({ x: 0, z: 0 }, half + 3);
  layout.pad("realm-pad", { x: 0, z: 0 }, half + 8, undefined, 34);
  layout.marker({ id: "seat", kind: "seat", at: { x: 0, z: 0 }, label: idea.seat.label, meta: { grid: idea.grid.cells, cell: idea.grid.cell } });
  theme.plan.forEach((plan, index) => {
    layout.marker({ id: `plan-${index + 1}`, kind: "plan", at: { x: plan.at[0], z: plan.at[1] }, label: `Starter ${plan.building}`, meta: { building: plan.building } });
  });

  const out = layout.turn();
  const destinations: { x: number; z: number }[] = [];
  if (theme.neighbour !== undefined) {
    const at = { x: Math.round(Math.cos(out) * 140), z: Math.round(Math.sin(out) * 140) };
    town(layout, { id: "neighbour", at, half: { x: 46, z: 38 }, look: theme.neighbour.look, label: theme.neighbour.label });
    destinations.push(at);
  }
  if (dressing.water !== undefined) {
    const angle = out + Math.PI * layout.between(0.65, 1.1);
    const at = { x: Math.round(Math.cos(angle) * 84), z: Math.round(Math.sin(angle) * 84) };
    lake(layout, { id: "lake", at, radius: 20, level: -0.6, dressing });
    destinations.push(at);
  }
  destinations.forEach((to, index) => {
    const length = Math.hypot(to.x, to.z);
    const from = { x: (to.x / length) * (half + 2), z: (to.z / length) * (half + 2) };
    trail(layout, { id: `road-${index + 1}`, from, to: { x: to.x * 0.7, z: to.z * 0.7 }, dressing });
  });

  // Prop yards hug the ground's edge, outcrops and groves just past them, so the build ground reads as cleared land.
  const props = idea.scenery.map((_, index) => `scenery${index + 1}`);
  for (let index = 0; index < 8; index += 1) {
    const at = layout.place(half + 5, half + 16, 4, { x: 0, z: 0 }, false);
    if (at !== null) cluster(layout, { id: `yard-${index + 1}`, at, radius: 4, props: [props[index % props.length]!, props[(index + 3) % props.length]!], count: 4, label: "Yard", spacing: 1.6 });
  }
  for (let index = 0; index < 4; index += 1) {
    const at = layout.place(half + 10, half + 30, 7, { x: 0, z: 0 }, false);
    if (at !== null) patch(layout, { id: `outcrop-${index + 1}`, at, radius: 6, palette: dressing.rocks, density: 0.18, label: "Outcrop", minScale: 0.8, maxScale: 2.2 });
  }
  for (let index = 0; index < 8; index += 1) {
    const at = layout.place(half + 12, half + 40, 9, { x: 0, z: 0 }, false);
    if (at !== null) grove(layout, { id: `grove-${index + 1}`, at, radius: layout.between(6, 11), dressing });
  }
  for (let index = 0; index < 3; index += 1) {
    const angle = out + Math.PI * (0.4 + index * 0.45);
    forest(layout, { id: `woods-${index + 1}`, at: { x: Math.round(Math.cos(angle) * (half + 52)), z: Math.round(Math.sin(angle) * (half + 52)) }, radius: 20, dressing, density: 0.15, label: "Woods" });
  }
  wilds(layout, { dressing, inner: half + 30, outer: 240, forests: 12, outcrops: 7, drifts: 22, meadow: 110 });
}

function readme(made: Idea): string {
  const homes = made.buildings.filter((building) => building.role === "home");
  const producers = made.buildings.filter((building) => building.role === "producer");
  const crown = made.buildings.find((building) => building.role === "crown");
  const [food] = made.resources;
  return `# ${made.name}

${made.tagline} Made with \`bun run games:new\` from: "${made.pitch}". Start it with \`bun --cwd=games/${made.id} run dev\` from the repository root.

## Design checklist

Every word, cost and model below lives in \`src/game/idea.ts\`; places live in \`src/editor.scene.json\`.

- **Core loop.** Pick a building (number keys or the build bar) and click the ground to place it on the grid around the ${made.seat.label.toLowerCase()}.
  ${homes.map((home) => `${home.label}s house ${home.houses}`).join(", ")} ${made.people.label.toLowerCase()}; ${producers.map((producer) => `${producer.label.toLowerCase()}s employ ${producer.staff} and make ${producer.makes}`).join(", ")}.
  Every ${made.people.label.toLowerCase().replace(/s$/, "")} eats ${food?.label.toLowerCase()} (${Math.round(made.eats * 60 * 10) / 10} a minute) and pays ${Math.round(made.tax * 60 * 10) / 10} ${made.coin} a minute; run out of ${food?.label.toLowerCase()} and every other workplace stops.
- **Progression.**
  - [x] Tiers: ${made.tiers.map((tier) => `${tier.label} (${tier.people} people)`).join(" -> ")}; each unlocks buildings.
  - [x] Every building upgrades to level 3 (U): homes house more, workplaces make more.
  - [x] A ${made.beats.length}-beat story from ${made.guide.name}, ending when the ${crown?.label.toLowerCase() ?? "crown"} is raised; play goes on after it.
- **Failure states.** No game over: a realm that runs out of ${food?.label.toLowerCase()} stalls (every workplace but food stops) until it is fed again. Placement is refused with a reason (no free workers, not unlocked, cannot afford, ground taken).
- **Minute 5 -> hour 5.** At 5:00 there are a few homes, a farm and a lumber source and the next tier is in sight; later the economy is about balancing food against workers while saving for the ${crown?.label.toLowerCase() ?? "crowning build"}.
- **References it is chasing.**
  - *Manor Lords* - feel: homes and workplaces placed by hand on open ground, people walking between them.
  - *Banished* - pressure: every new hand eats; food is the limit on growth.
  - *Anno 1800* - progression: tiers of residents that unlock the next buildings.
- **Gap to target.** Buildings snap to a square grid with no roads, no adjacency bonuses and no seasons; walkers wander instead of commuting.

Loop proof: ${made.id}-loop
`;
}

/** Place a home and a workplace through the real pointer, then watch what the workplace makes pile up. */
function loopFlow(made: Idea): Flow {
  const home = made.buildings.findIndex((building) => building.role === "home");
  const [food] = made.resources;
  const work = made.buildings.findIndex((building) => building.role === "producer" && building.tier === 1 && building.makes !== food!.id);
  const makes = made.buildings[work]!.makes!;
  return {
    steps: [
      { assert: flowAssertText(made.beats[0]!.title), before: { is: flowAssertText(made.beats[0]!.title), timeoutMs: 60000 }, note: "arrival: the realm is up and the first story beat started by itself" },
      { assert: "__jgProbe().people >= 1", before: { is: "__jgProbe().people >= 1", timeoutMs: 10000 }, note: `arrival: the ${made.seat.label.toLowerCase()} stands and houses its first people` },
      { key: `Digit${home + 1}`, ms: 120, after: { is: `__jgProbe().armed === ${home + 1}`, timeoutMs: 5000 }, note: `pick up a ${made.buildings[home]!.label.toLowerCase()}` },
      { clickAt: [420, 330], after: { is: "__jgProbe().building + __jgProbe().built >= 1", timeoutMs: 5000 }, note: "click the ground left of the hall: the home goes up" },
      { key: `Digit${work + 1}`, ms: 120, after: { is: `__jgProbe().armed === ${work + 1}`, timeoutMs: 5000 }, note: `pick up a ${made.buildings[work]!.label.toLowerCase()}` },
      { clickAt: [1150, 560], after: { is: "__jgProbe().building + __jgProbe().built >= 2", timeoutMs: 5000 }, note: "click the ground right of the hall: the workplace goes up" },
      { rightClickAt: [640, 260], after: { is: "__jgProbe().armed === 0", timeoutMs: 5000 }, note: "right click puts the tool down" },
      { assert: "__jgProbe().built >= 2", before: { is: "__jgProbe().built >= 2 && __jgProbe().building === 0", timeoutMs: 30000 }, note: "arrival: both finished building" },
      { assert: `__jgProbe().${makes} > window.__made0`, before: { is: `window.__made0 === undefined ? (window.__made0 = __jgProbe().${makes}, false) : __jgProbe().${makes} >= window.__made0 + 3`, timeoutMs: 30000 }, note: `arrival: the workplace is working - ${makes} piles up` },
    ],
  };
}

function clipFlow(_made: Idea): Flow {
  return {
    steps: [
      { wait: 9000 },
      { key: "KeyQ", ms: 1400 },
      { wait: 4000 },
      { key: "KeyW", ms: 900 },
      { wait: 6000 },
      { key: "KeyE", ms: 1600 },
      { wait: 9000 },
      { assert: "__jgProbe().built >= 3", note: "arrival: the staged town is built and working" },
    ],
  };
}

export const kind: KindModule<Idea> = {
  kind: "builder",
  genre: "settlement builder (house, feed and grow a realm)",
  words: [],
  read,
  scene,
  readme,
  loopFlow,
  clipFlow,
  clipState: "town",
};
