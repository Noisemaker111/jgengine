/**
 * Defense: hold a core against waves marching down authored lanes, with towers built on pads beside
 * them. Themes are plain data rows (what marches, what defends, which models draw them, how the land
 * and sky look, the lanes' shape); the idea's words pick one. New themes are new rows.
 */
import type { BeatWord, WorldWord } from "../template/common/src/game/ideaShape";
import type { Idea } from "../template/defense/src/game/kindShape";
import { cluster, grove, patch, wilds, type Dressing } from "../world/dress";
import { distanceToLine, type Layout, type Spot } from "../world/layout";
import { beats, flowAssertText, nameFor, pickTheme } from "./shared";
import type { Flow, KindModule } from "./types";

type Theme = Omit<Idea, "kind" | "id" | "spec" | "name" | "pitch" | "beats" | "world"> & {
  words: readonly string[];
  names: readonly string[];
  story: readonly { title: string; pitch: string }[];
  world: Omit<WorldWord, "sky"> & { haze: number; preset: "day" | "dusk" | "night"; startHour: number };
  dressing: Dressing;
  /** The lanes, in metres around the field's middle; each ends at the core. */
  lanes: readonly (readonly (readonly [number, number])[])[];
  /** Where the core stands. */
  core_at: readonly [number, number];
};

const NATURE = "/models/quaternius-stylized-nature";
const VILLAGE = "/models/quaternius-medieval-village";
const SETTLE = "/models/lantern-reach/settlements";
const ENEMIES = "/models/lantern-reach/enemies";
const DUNGEON = "/models/kaykit-dungeon";
const SPACE = "/models/kaykit-space-base";
const SCIFI = "/models/quaternius-modular-scifi";

/** One lane that doubles back through the middle twice: long, readable, every pad sees two stretches. */
const SERPENT: readonly (readonly [number, number])[] = [[-64, -34], [-44, -34], [-44, 15], [-13, 15], [-13, -15], [13, -15], [13, 15], [44, 15], [44, 0], [64, 0]];
/** A second mouth to the north-west that joins the serpent above the middle. */
const NORTH: readonly (readonly [number, number])[] = [[-64, 48], [-28, 48], [-28, 15], [-13, 15], [-13, -15], [13, -15], [13, 15], [44, 15], [44, 0], [64, 0]];

const THEMES: readonly Theme[] = [
  {
    words: ["orbital", "orbit", "space", "station", "alien", "aliens", "sci", "fi", "scifi", "planet", "moon", "galaxy", "star", "relay", "laser", "lasers", "swarm", "hive", "mars", "cosmic"],
    names: ["Halo Station", "Relay Nine", "Starfall Bastion", "Orbit Watch"],
    tagline: "Hold the relay. Lasers on the pads, the swarm on the lanes.",
    kit: "holo",
    look: "cinematic",
    mood: "day",
    accent: "#5fd6e8",
    ground: { material: "sand", low: "#6b5f55", high: "#a8998a" },
    guide: { name: "Commander Vey", title: "Station command" },
    core: { label: "Orbital relay", model: { model: `${SPACE}/basemodule_A.glb`, height: 7 }, lives: 20 },
    coin: { label: "Credits", start: 220 },
    foe: "Aliens",
    wave: "Wave",
    waves: 12,
    calm: { first: 25, between: 12 },
    towers: [
      { id: "pulse", label: "Pulse turret", cost: 70, damage: 12, range: 16, rate: 1.4, splash: 0, slow: 1, shot: "laser", from: 1, blurb: "Fast red pulses at whatever is furthest along.", model: { model: `${SPACE}/structure_tall.glb`, height: 5 } },
      { id: "rail", label: "Rail cannon", cost: 110, damage: 42, range: 21, rate: 0.5, splash: 0, slow: 1, shot: "beam", from: 1, blurb: "Slow, long reach, hits hard.", model: { model: `${SPACE}/drill_structure.glb`, height: 6.5 } },
      { id: "cryo", label: "Cryo array", cost: 90, damage: 6, range: 14, rate: 1, splash: 0, slow: 0.45, shot: "frostbolt", from: 2, blurb: "Chills what it hits to under half speed.", model: { model: `${SPACE}/windturbine_low.glb`, height: 5 } },
      { id: "mortar", label: "Plasma mortar", cost: 140, damage: 30, range: 17, rate: 0.6, splash: 4.5, slow: 1, shot: "fireball", from: 3, blurb: "Splashes everything near its target.", model: { model: `${SPACE}/lander_A.glb`, height: 4 } },
    ],
    creeps: [
      { id: "skitter", label: "Skitter", health: 30, speed: 4.2, bounty: 4, leak: 1, from: 1, model: { model: `${SCIFI}/Alien_Oculichrysalis.glb`, height: 2.6 } },
      { id: "cyclop", label: "Cyclop", health: 70, speed: 2.8, bounty: 6, leak: 1, from: 1, model: { model: `${SCIFI}/Alien_Cyclop.glb`, height: 3.4 } },
      { id: "warden", label: "Brood warden", health: 170, speed: 2.2, bounty: 10, leak: 2, from: 4, model: { model: `${SCIFI}/Alien_Cyclop.glb`, height: 4.6, tint: "#ff9a8a" } },
      { id: "scolitex", label: "The Scolitex", health: 900, speed: 1.8, bounty: 60, leak: 5, from: 5, boss: true, model: { model: `${SCIFI}/Alien_Scolitex.glb`, height: 7 } },
    ],
    pad: { model: `${SPACE}/landingpad_small.glb`, height: 1 },
    story: [
      { title: "First line", pitch: "The swarm is inbound. Put a turret on a pad beside the lane." },
      { title: "Contact", pitch: "Here they come. Hold the first wave off the relay." },
      { title: "Dig in", pitch: "Credits from kills buy more guns. Get five towers on the pads." },
      { title: "Overcharge", pitch: "Upgrade what you have: three upgrades across the line." },
      { title: "Hold the relay", pitch: "Twelve waves and the swarm breaks. Keep the relay standing." },
    ],
    scenery: [
      { model: `${SPACE}/rock_B.glb`, height: 9 },
      { model: `${SPACE}/cargo_A_stacked.glb`, height: 2.4 },
      { model: `${SPACE}/containers_A.glb`, height: 2.2 },
      { model: `${SCIFI}/Prop_Light_Floor.glb`, height: 1.5 },
      { model: `${SPACE}/solarpanel.glb`, height: 1.6 },
      { model: `${SPACE}/spacetruck.glb`, height: 2.4 },
    ],
    world: {
      relief: 4,
      frequency: 0.008,
      waterLevel: -40,
      haze: 0.5,
      preset: "day",
      startHour: 10,
      scatter: {
        spire: { model: `${SPACE}/rock_A.glb`, height: 7 },
        spire2: { model: `${SPACE}/rock_B.glb`, height: 9 },
        column: { model: `${SCIFI}/Column_Astra.glb`, height: 8 },
        pebbles: { model: `${SPACE}/rocks_B.glb`, height: 1 },
        rubble: { model: `${SPACE}/rocks_A.glb`, height: 1.6 },
        boulder: { model: `${NATURE}/Rock_Medium_2.glb`, height: 2.4, tint: "#8d8f9a" },
        boulder2: { model: `${NATURE}/Rock_Medium_3.glb`, height: 3, tint: "#7b7d88" },
      },
    },
    dressing: {
      forest: [{ item: "spire", weight: 3 }, { item: "spire2", weight: 2 }, { item: "boulder2", weight: 2 }, { item: "column", weight: 1 }],
      brush: [{ item: "pebbles", weight: 3 }, { item: "rubble", weight: 2 }],
      rocks: [{ item: "boulder", weight: 3 }, { item: "boulder2", weight: 2 }, { item: "rubble", weight: 2 }],
      // Low dust tufts: they also give the pointer ground to land on (bare terrain is not picked).
      grass: { base: "#6b5f55", tip: "#9a8c7c", height: 0.14 },
      trail: { surface: "gravel", color: "#4a4b52", width: 6 },
    },
    lanes: [SERPENT, NORTH],
    core_at: [64, 0],
  },
  {
    words: ["keep", "castle", "fantasy", "medieval", "kingdom", "skeleton", "skeletons", "undead", "dead", "necromancer", "knight", "knights", "archer", "archers", "wizard", "mage", "gate", "walls", "realm", "dark"],
    names: ["Thornwall Keep", "Gallow's Gate", "Ashen Keep", "Hollowmere"],
    tagline: "The dead march on the keep. Arrows, fire and frost on every bend.",
    kit: "parchment",
    look: "cinematic",
    mood: "golden",
    accent: "#d9a441",
    ground: { material: "grass", low: "#4a6530", high: "#88904e" },
    guide: { name: "Captain Maren", title: "Keep captain" },
    core: { label: "The keep", model: { model: `${SETTLE}/settlement-3.glb`, height: 15 }, lives: 20 },
    coin: { label: "Gold", start: 220 },
    foe: "The dead",
    wave: "Wave",
    waves: 10,
    calm: { first: 25, between: 12 },
    towers: [
      { id: "archer", label: "Archer tower", cost: 70, damage: 12, range: 16, rate: 1.3, splash: 0, slow: 1, shot: "arrow", from: 1, blurb: "Steady arrows at whatever is furthest along.", model: { model: `${SETTLE}/settlement-7.glb`, height: 8 } },
      { id: "mage", label: "Mage tower", cost: 110, damage: 40, range: 19, rate: 0.5, splash: 0, slow: 1, shot: "arcane", from: 1, blurb: "Slow arcane bolts that hit hard.", model: { model: `${SETTLE}/settlement-9.glb`, height: 9, tint: "#c9b8ff" } },
      { id: "frost", label: "Frost spire", cost: 90, damage: 6, range: 14, rate: 1, splash: 0, slow: 0.45, shot: "frostbolt", from: 2, blurb: "Ice that slows what it hits to under half speed.", model: { model: `${SETTLE}/settlement-7.glb`, height: 7, tint: "#a8dcff" } },
      { id: "bombard", label: "Bombard", cost: 140, damage: 30, range: 17, rate: 0.6, splash: 4.5, slow: 1, shot: "fireball", from: 3, blurb: "Fire that splashes everything near its target.", model: { model: `${DUNGEON}/pillar_decorated.glb`, height: 4.5 } },
    ],
    creeps: [
      { id: "minion", label: "Skeleton minion", health: 30, speed: 4, bounty: 4, leak: 1, from: 1, model: { model: `${ENEMIES}/skeleton_minion.glb`, height: 2.4 } },
      { id: "warrior", label: "Skeleton warrior", health: 75, speed: 2.8, bounty: 6, leak: 1, from: 1, model: { model: `${ENEMIES}/skeleton_warrior.glb`, height: 2.9 } },
      { id: "rogue", label: "Skeleton rogue", health: 55, speed: 3.8, bounty: 5, leak: 1, from: 3, model: { model: `${ENEMIES}/skeleton_rogue.glb`, height: 2.8 } },
      { id: "golem", label: "Bone golem", health: 900, speed: 1.8, bounty: 60, leak: 5, from: 5, boss: true, model: { model: `${ENEMIES}/skeleton_golem.glb`, height: 7 } },
    ],
    pad: { model: `${DUNGEON}/floor_tile_large.glb`, height: 0.25 },
    story: [
      { title: "Man the walls", pitch: "The dead are coming up the road. Raise a tower on a pad beside it." },
      { title: "First blood", pitch: "Here they come. Hold the first wave off the keep." },
      { title: "A ring of towers", pitch: "Gold from the fallen buys more towers. Get five on the pads." },
      { title: "Stronger walls", pitch: "Upgrade what you have: three upgrades across the line." },
      { title: "Hold the keep", pitch: "Ten waves and the dead go back to their graves. Keep the keep." },
    ],
    scenery: [
      { model: `${DUNGEON}/rubble_large.glb`, height: 3.5 },
      { model: `${DUNGEON}/banner_patternA_red.glb`, height: 3.2 },
      { model: `${DUNGEON}/barrel_large.glb`, height: 1.2 },
      { model: `${DUNGEON}/crates_stacked.glb`, height: 1.6 },
      { model: `${DUNGEON}/torch_lit.glb`, height: 1.8 },
      { model: `${VILLAGE}/Prop_Wagon.glb`, height: 1.8 },
    ],
    world: {
      relief: 4,
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
      forest: [{ item: "tree", weight: 3 }, { item: "tree2", weight: 3 }, { item: "tree3", weight: 2 }, { item: "pine", weight: 1 }],
      brush: [{ item: "bush", weight: 2 }, { item: "flower", weight: 2 }, { item: "fern", weight: 2 }],
      rocks: [{ item: "rock", weight: 3 }, { item: "rock2", weight: 2 }],
      grass: { base: "#4a6530", tip: "#a2a860", height: 0.34 },
      trail: { surface: "dirt", color: "#7a6446", width: 6 },
    },
    lanes: [SERPENT],
    core_at: [64, 0],
  },
];

/** Build, hold one, field five, upgrade three, hold them all. */
function beatsFor(theme: Theme): BeatWord[] {
  return beats(theme.story, [
    { goal: "Build a tower on a pad", fact: "hold.towers", atLeast: 1 },
    { goal: `Hold ${theme.wave.toLowerCase()} 1`, fact: "hold.cleared", atLeast: 1 },
    { goal: "Have 5 towers up", fact: "hold.towers", atLeast: 5 },
    { goal: "Reach 8 tower levels in all", fact: "hold.levels", atLeast: 8 },
    { goal: `Hold all ${theme.waves} ${theme.wave.toLowerCase()}s`, fact: "hold.cleared", atLeast: theme.waves },
  ]);
}

function read(text: string, said: readonly string[], options: { name?: string }): Idea {
  const theme = pickTheme(said, THEMES);
  const named = nameFor(text, theme.names, options);
  const { words: _words, names: _names, story: _story, dressing: _dressing, lanes: _lanes, core_at: _core, world, ...rest } = theme;
  return {
    ...rest,
    kind: "defense",
    ...named,
    pitch: text.trim(),
    beats: beatsFor(theme),
    world: {
      relief: world.relief,
      frequency: world.frequency,
      waterLevel: world.waterLevel,
      scatter: world.scatter,
      // A day lasts fifteen minutes: a full run plays out under one sky.
      sky: { preset: world.preset, cycle: true, dayLength: 900, startHour: world.startHour, haze: world.haze },
    },
  };
}

function themeOf(idea: Idea): Theme {
  return THEMES.find((theme) => theme.core.label === idea.core.label) ?? THEMES[0]!;
}

/**
 * Pads beside the lanes: spots 5.5-8 m off every lane, eleven apart, nearest the middle first (the
 * middle is where the lanes double back, so those pads see the most).
 */
function padSpots(lanes: readonly Spot[][], core: Spot): Spot[] {
  const found: Spot[] = [];
  const candidates: Spot[] = [];
  for (let x = -78; x <= 60; x += 3) {
    for (let z = -54; z <= 56; z += 3) {
      const spot = { x, z };
      const near = Math.min(...lanes.map((lane) => distanceToLine(spot, lane)));
      if (near >= 5.5 && near <= 8 && Math.hypot(x - core.x, z - core.z) > 12) candidates.push(spot);
    }
  }
  candidates.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  for (const spot of candidates) {
    if (found.length >= 14) break;
    if (found.every((other) => Math.hypot(other.x - spot.x, other.z - spot.z) >= 11)) found.push(spot);
  }
  return found;
}

/**
 * The field in the middle, level: the lanes drawn on it from their mouths to the core, pads beside
 * them, prop yards between; outside it rocks, groves or spires to the horizon.
 */
function scene(idea: Idea, layout: Layout): void {
  const theme = themeOf(idea);
  const dressing = theme.dressing;
  const core = { x: theme.core_at[0], z: theme.core_at[1] };
  const lanes = theme.lanes.map((lane) => lane.map(([x, z]) => ({ x, z })));

  layout.pad("field", { x: 0, z: 0 }, 92, undefined, 30);
  layout.marker({ id: "field", kind: "field", at: { x: 0, z: 0 }, label: "Field" });
  layout.marker({ id: "core", kind: "core", at: core, label: idea.core.label });
  layout.take(core, 9);
  lanes.forEach((points, index) => {
    // Only the first lane draws the shared stretch; the others draw up to where they join it.
    const join = index === 0 ? points.length : points.findIndex((point) => lanes[0]!.some((other) => other.x === point.x && other.z === point.z)) + 1;
    layout.path({
      id: `lane-${index + 1}`,
      kind: "trail",
      points: index === 0 ? points : points.slice(0, Math.max(2, join)),
      width: dressing.trail.width,
      label: `Lane ${index + 1}`,
      meta: { surface: dressing.trail.surface, color: dressing.trail.color, clearance: dressing.trail.width / 2 + 1, lane: true, route: points.map((point) => [point.x, point.z]) },
    });
    // The lane's mouth: a landmark where the attackers come from.
    const mouth = points[0]!;
    layout.marker({ id: `mouth-${index + 1}`, kind: "prop", catalogId: "scenery1", at: { x: mouth.x - 6, z: mouth.z + 7 }, rotationY: layout.turn(), label: "Lane mouth" });
    layout.marker({ id: `mouth-${index + 1}b`, kind: "prop", catalogId: "scenery1", at: { x: mouth.x - 4, z: mouth.z - 8 }, rotationY: layout.turn(), label: "Lane mouth" });
    layout.take(mouth, 6);
  });

  padSpots(lanes, core).forEach((spot, index) => {
    layout.marker({ id: `pad-${index + 1}`, kind: "tower_pad", at: spot, label: `Pad ${index + 1}` });
    layout.marker({ id: `pad-${index + 1}-slab`, kind: "prop", catalogId: "pad", at: spot, label: `Pad ${index + 1}` });
    layout.take(spot, 3.5);
  });

  // Yards of props between the lanes and round the core, so the field is a place, not a board.
  const props = idea.scenery.slice(1).map((_, index) => `scenery${index + 2}`);
  for (let index = 0; index < 12; index += 1) {
    const at = layout.place(10, 75, 4, { x: 0, z: 0 });
    if (at !== null) cluster(layout, { id: `yard-${index + 1}`, at, radius: 3.5, props: [props[index % props.length]!, props[(index + 2) % props.length]!], count: 3, label: "Yard", spacing: 1.6 });
  }
  cluster(layout, { id: "core-yard", at: { x: core.x + 8, z: core.z + 8 }, radius: 4, props, count: 5, label: "Core yard", spacing: 1.8 });
  for (let index = 0; index < 9; index += 1) {
    const at = layout.place(16, 82, 6, { x: 0, z: 0 });
    if (at !== null) patch(layout, { id: `field-rocks-${index + 1}`, at, radius: 4, palette: dressing.rocks, density: 0.16, label: "Rocks", minScale: 0.7, maxScale: 1.6 });
  }
  for (let index = 0; index < 6; index += 1) {
    const at = layout.place(86, 120, 9, { x: 0, z: 0 }, false);
    if (at !== null) grove(layout, { id: `grove-${index + 1}`, at, radius: layout.between(6, 11), dressing });
  }
  layout.take({ x: 0, z: 0 }, 86);
  wilds(layout, { dressing, inner: 96, outer: 250, forests: 14, outcrops: 8, drifts: 20, meadow: 120 });
}

function readme(made: Idea): string {
  return `# ${made.name}

${made.tagline} Made with \`bun run games:new\` from: "${made.pitch}". Start it with \`bun --cwd=games/${made.id} run dev\` from the repository root.

## Design checklist

Every word, cost and model below lives in \`src/game/idea.ts\`; lanes, pads and the core live in \`src/editor.scene.json\`.

- **Core loop.** ${made.foe} march down the lanes at ${made.core.label.toLowerCase()}; pick a tower (number keys or the build bar) and click near an empty pad to build it.
  Towers: ${made.towers.map((tower) => `${tower.label} (${tower.cost} ${made.coin.label.toLowerCase()})`).join(", ")}. Every kill pays ${made.coin.label.toLowerCase()}; every leak costs lives.
- **Progression.**
  - [x] ${made.waves} ${made.wave.toLowerCase()}s, bigger and faster each time; tougher kinds join, a boss every fifth.
  - [x] Towers unlock by wave and upgrade to level 3 (U); sell (X) for 60% back.
  - [x] Calling a ${made.wave.toLowerCase()} early (N) pays for the calm left over.
  - [x] A ${made.beats.length}-beat story from ${made.guide.name}, ending when the last ${made.wave.toLowerCase()} is held.
- **Failure states.** ${made.core.lives} lives; at zero the run ends with a result card and a retry.
- **Minute 5 -> hour 5.** At 5:00 a handful of towers ring the middle where the lane doubles back; later it is about where the splash and slow towers go, and when to upgrade instead of build.
- **References it is chasing.**
  - *Kingdom Rush* - feel: fixed pads along a winding road, call the next wave early.
  - *Bloons TD* - pressure: waves that ramp faster than your income unless you place well.
  - *Defense Grid* - progression: a few tower kinds whose roles combine (slow + splash).
- **Gap to target.** No tower abilities or heroes, no flying lanes, no range ring when placing.

Loop proof: ${made.id}-loop
`;
}

/** Build a tower through the real pointer, send the first wave, watch it get held. */
function loopFlow(made: Idea): Flow {
  return {
    steps: [
      { assert: flowAssertText(made.beats[0]!.title), before: { is: flowAssertText(made.beats[0]!.title), timeoutMs: 60000 }, note: "arrival: the field is up and the first story beat started by itself" },
      { assert: `__jgProbe().lives === ${made.core.lives} && __jgProbe().calm > 0`, note: `arrival: ${made.core.label.toLowerCase()} stands, the first wave is counting down` },
      { key: "Digit1", ms: 120, after: { is: "__jgProbe().armed === 1", timeoutMs: 5000 }, note: `pick up a ${made.towers[0]!.label.toLowerCase()}` },
      { clickAt: [640, 360], after: { is: "__jgProbe().towers >= 1", timeoutMs: 5000 }, note: "click the middle of the field: the tower goes up on the nearest pad" },
      { key: "Digit2", ms: 120, after: { is: "__jgProbe().armed === 2", timeoutMs: 5000 }, note: `pick up a ${made.towers[1]!.label.toLowerCase()}` },
      { clickAt: [752, 388], after: { is: "__jgProbe().towers >= 2", timeoutMs: 5000 }, note: "click near another pad: a second tower" },
      { rightClickAt: [640, 220], after: { is: "__jgProbe().armed === 0", timeoutMs: 5000 }, note: "right click puts the tool down" },
      { key: "KeyN", ms: 120, after: { is: "__jgProbe().raiding === 1", timeoutMs: 5000 }, note: "N sends the first wave early" },
      { assert: "__jgProbe().kills >= 1", before: { is: "__jgProbe().kills >= 1", timeoutMs: 60000 }, note: "arrival: the towers kill what marches past" },
      { assert: "__jgProbe().cleared >= 1", before: { is: "__jgProbe().cleared >= 1", timeoutMs: 120000 }, note: "arrival: the first wave is held and the next calm starts" },
    ],
  };
}

function clipFlow(_made: Idea): Flow {
  return {
    steps: [
      { wait: 9000 },
      { key: "KeyQ", ms: 700 },
      { wait: 8000 },
      { key: "KeyE", ms: 1400 },
      { wait: 8000 },
      { key: "KeyQ", ms: 700 },
      { wait: 6000 },
      { assert: "__jgProbe().kills >= 3", note: "arrival: the staged towers are killing the third wave" },
    ],
  };
}

export const kind: KindModule<Idea> = {
  kind: "defense",
  genre: "tower defense (towers on pads, waves down lanes)",
  words: [],
  read,
  scene,
  readme,
  loopFlow,
  clipFlow,
  clipState: "siege",
};
