/**
 * Explorer: walk a big, dressed world to the landmarks on the compass. Reaching one puts it on the map
 * and opens it for fast travel; relics there unlock glide, a deeper stamina pool and a double jump;
 * guardians keep most of them; the last place holds the goal. Ideas that name no genre land here, so
 * this is the general open-world starter. Themes are plain data rows; the idea's words pick one.
 */
import type { BeatWord, ModelRef, WorldWord } from "../template/common/src/game/ideaShape";
import type { Idea, LandmarkWord } from "../template/explorer/src/game/kindShape";
import { cluster, forest, grove, lake, meadow, trail, wilds, type Dressing } from "../world/dress";
import type { Layout } from "../world/layout";
import { beats, flowAssertText, nameFor, pickTheme } from "./shared";
import type { Flow, KindModule } from "./types";

type Theme = Omit<Idea, "kind" | "id" | "spec" | "name" | "pitch" | "beats" | "world"> & {
  /** Words that pick this theme; more hits win. */
  words: readonly string[];
  names: readonly string[];
  /** Beat titles and pitches, one per relic and one for the goal. */
  story: readonly { title: string; pitch: string }[];
  world: Omit<WorldWord, "sky"> & { haze: number; preset: "day" | "dusk" | "night"; dayLength: number; startHour: number };
  dressing: Dressing;
};

const NATURE = "/models/quaternius-stylized-nature";
const DUNGEON = "/models/kaykit-dungeon";
const LR = "/models/lantern-reach";
const SPACE = "/models/kaykit-space-base";
const SCIFI = "/models/quaternius-modular-scifi";

const THEMES: readonly Theme[] = [
  {
    words: ["ruins", "ruin", "ancient", "relic", "relics", "temple", "fantasy", "magic", "kingdom", "knight", "dragon", "castle", "glide", "forest", "lost", "old", "legend", "myth", "shrine", "keeper", "lighthouse"],
    names: ["Ashen Reach", "The Sunken Crown", "Hollow Spires", "Embervale", "The Quiet Kingdom"],
    tagline: "Walk the old roads. Wake the ruins. Learn to fly.",
    kit: "parchment",
    look: "cinematic",
    mood: "golden",
    accent: "#e6b65a",
    ground: { material: "grass", low: "#4f6b32", high: "#93a05c" },
    guide: { name: "Ysolde", title: "Last of the wardens" },
    hero: { model: `${LR}/players/ranger.glb`, height: 1.8, health: 120, damage: 30, stamina: 100, label: "Wanderer" },
    pedestal: { model: `${DUNGEON}/pillar.glb`, height: 1.1 },
    goal: { label: "the Sky Altar", verb: "Wake", done: "The Sky Altar wakes", model: { model: `${DUNGEON}/chest_gold.glb`, height: 1.4 } },
    landmarks: [
      {
        id: "gate",
        label: "The Broken Gate",
        role: "relic",
        centerpiece: { model: `${DUNGEON}/wall_arched.glb`, height: 7 },
        ruins: [{ model: `${DUNGEON}/rubble_large.glb`, height: 1.4 }, { model: `${DUNGEON}/wall_broken.glb`, height: 3.6 }, { model: `${DUNGEON}/torch_lit.glb`, height: 2.2 }],
        relic: { id: "feather", label: "Wing of Aurel", grants: "glide", blurb: "Hold Space in the air to glide.", model: { model: `${DUNGEON}/key.glb`, height: 0.9 } },
      },
      {
        id: "colonnade",
        label: "Sunken Colonnade",
        role: "vista",
        centerpiece: { model: `${DUNGEON}/pillar_decorated.glb`, height: 9 },
        ruins: [{ model: `${DUNGEON}/pillar.glb`, height: 6 }, { model: `${DUNGEON}/rubble_half.glb`, height: 1 }, { model: `${DUNGEON}/column.glb`, height: 5 }],
      },
      {
        id: "watch",
        label: "Warden's Watch",
        role: "relic",
        centerpiece: { model: `${DUNGEON}/wall_archedwindow_open.glb`, height: 8 },
        ruins: [{ model: `${DUNGEON}/wall_cracked.glb`, height: 4 }, { model: `${DUNGEON}/banner_patternA_red.glb`, height: 3 }, { model: `${DUNGEON}/rubble_large.glb`, height: 1.4 }],
        relic: { id: "heart", label: "Ember Heart", grants: "stamina", blurb: "Your stamina runs much deeper now.", model: { model: `${DUNGEON}/coin_stack_large.glb`, height: 0.7 } },
        guardian: { id: "skeleton", label: "Bone warden", model: { model: `${LR}/enemies/skeleton_warrior.glb`, height: 1.9 }, health: 70, damage: 8, speed: 2.6, count: 2 },
      },
      {
        id: "hollow",
        label: "The Moss Hollow",
        role: "vista",
        centerpiece: { model: `${LR}/settlements/settlement-3.glb`, height: 8 },
        ruins: [{ model: `${DUNGEON}/wall_half.glb`, height: 2 }, { model: `${NATURE}/Mushroom_Laetiporus.glb`, height: 1.2 }, { model: `${DUNGEON}/barrel_large.glb`, height: 1.1 }],
      },
      {
        id: "spire",
        label: "Thornspire",
        role: "relic",
        centerpiece: { model: `${DUNGEON}/wall_pillar.glb`, height: 11 },
        ruins: [{ model: `${DUNGEON}/stairs.glb`, height: 2.5 }, { model: `${DUNGEON}/wall_broken.glb`, height: 3.6 }, { model: `${DUNGEON}/torch_lit.glb`, height: 2.2 }],
        relic: { id: "boots", label: "Stormstep Boots", grants: "doubleJump", blurb: "Press Space again in the air to jump twice.", model: { model: `${DUNGEON}/chest.glb`, height: 0.9 } },
        guardian: { id: "orc", label: "Thorn brute", model: { model: `${LR}/creatures/orc.glb`, height: 2.2 }, health: 110, damage: 11, speed: 2.8, count: 3 },
      },
      {
        id: "altar",
        label: "The Sky Altar",
        role: "final",
        centerpiece: { model: `${LR}/settlements/settlement-7.glb`, height: 12 },
        ruins: [{ model: `${DUNGEON}/pillar_decorated.glb`, height: 7 }, { model: `${DUNGEON}/banner_triple_yellow.glb`, height: 3.5 }, { model: `${DUNGEON}/torch_lit.glb`, height: 2.2 }],
        guardian: { id: "golem", label: "Altar golem", model: { model: `${LR}/enemies/skeleton_golem.glb`, height: 3.4 }, health: 420, damage: 16, speed: 2.2, count: 1 },
      },
    ],
    story: [
      { title: "The road out", pitch: "The old gate is just ahead. Something there still remembers how to fly." },
      { title: "Warden's Watch", pitch: "Bone wardens keep the watchtower. What they guard will carry you further." },
      { title: "Thornspire", pitch: "The spire stands past the hollow. Brutes nest at its feet." },
      { title: "Wake the altar", pitch: "Three relics, one altar. Its golem has waited a long time for you." },
    ],
    scenery: [
      { model: `${DUNGEON}/crates_stacked.glb`, height: 1.4 },
      { model: `${DUNGEON}/barrel_small_stack.glb`, height: 1.2 },
      { model: `${DUNGEON}/torch_lit.glb`, height: 2.2 },
      { model: `${DUNGEON}/box_stacked.glb`, height: 1.2 },
    ],
    world: {
      relief: 9,
      frequency: 0.008,
      waterLevel: -1.2,
      haze: 0.5,
      preset: "day",
      dayLength: 900,
      startHour: 9,
      scatter: {
        oak: { model: `${NATURE}/CommonTree_1.glb`, height: 9 },
        oak2: { model: `${NATURE}/CommonTree_3.glb`, height: 10 },
        pine: { model: `${NATURE}/Pine_2.glb`, height: 12 },
        pine2: { model: `${NATURE}/Pine_4.glb`, height: 10 },
        bush: { model: `${NATURE}/Bush_Common_Flowers.glb`, height: 1.2 },
        fern: { model: `${NATURE}/Fern_1.glb`, height: 0.9 },
        flowers: { model: `${NATURE}/Flower_3_Group.glb`, height: 0.5 },
        rock: { model: `${NATURE}/Rock_Medium_1.glb`, height: 1.8 },
        rock2: { model: `${NATURE}/Rock_Medium_3.glb`, height: 2.6 },
      },
    },
    dressing: {
      forest: [{ item: "oak", weight: 3 }, { item: "oak2", weight: 2 }, { item: "pine", weight: 3 }, { item: "pine2", weight: 2 }],
      brush: [{ item: "bush", weight: 2 }, { item: "fern", weight: 3 }, { item: "flowers", weight: 2 }],
      rocks: [{ item: "rock", weight: 3 }, { item: "rock2", weight: 2 }],
      grass: { base: "#4c6a2e", tip: "#a3b065", height: 0.35 },
      water: { color: "#2c5d6e", shallow: "#6aa6a8" },
      trail: { surface: "dirt", color: "#7a6a4c", width: 3.5 },
    },
  },
  {
    words: ["alien", "aliens", "planet", "space", "sci-fi", "scifi", "mars", "moon", "crash", "crashed", "astronaut", "star", "stars", "galaxy", "cosmic", "probe", "signal", "outpost", "colony"],
    names: ["Red Meridian", "Kepler's Hollow", "The Long Signal", "Dust of Tauri", "Far Beacon"],
    tagline: "Crash, wander, climb. Follow the signal home.",
    kit: "holo",
    look: "cinematic",
    mood: "dusk",
    accent: "#5fd6e8",
    ground: { material: "sand", low: "#8a5a3c", high: "#c79a6a" },
    guide: { name: "MOTH", title: "Ship's mind" },
    hero: { model: `${LR}/players/rogue_hooded.glb`, height: 1.8, health: 110, damage: 28, stamina: 100, label: "Pilot" },
    pedestal: { model: `${SCIFI}/Prop_ItemHolder.glb`, height: 1.1 },
    goal: { label: "the Beacon", verb: "Light", done: "The Beacon calls home", model: { model: `${SCIFI}/Prop_AccessPoint.glb`, height: 2 } },
    landmarks: [
      {
        id: "wreck",
        label: "The Crash Site",
        role: "relic",
        centerpiece: { model: `${SPACE}/lander_A.glb`, height: 7 },
        ruins: [{ model: `${SPACE}/cargo_A.glb`, height: 1.6 }, { model: `${SPACE}/rocks_A.glb`, height: 1.6 }, { model: `${SCIFI}/Prop_Barrel_Large.glb`, height: 1.3 }],
        relic: { id: "fins", label: "Glide fins", grants: "glide", blurb: "Hold Space in the air to glide.", model: { model: `${SCIFI}/Prop_Chest.glb`, height: 0.8 } },
      },
      {
        id: "towers",
        label: "Singing Towers",
        role: "vista",
        centerpiece: { model: `${SCIFI}/Column_Astra.glb`, height: 12 },
        ruins: [{ model: `${SPACE}/rock_A.glb`, height: 3 }, { model: `${SCIFI}/Column_Round.glb`, height: 7 }, { model: `${SPACE}/rocks_B.glb`, height: 1.8 }],
      },
      {
        id: "drill",
        label: "Dead Drill",
        role: "relic",
        centerpiece: { model: `${SPACE}/drill_structure.glb`, height: 10 },
        ruins: [{ model: `${SPACE}/containers_B.glb`, height: 2.4 }, { model: `${SPACE}/solarpanel.glb`, height: 2 }, { model: `${SPACE}/cargo_B_stacked.glb`, height: 2.4 }],
        relic: { id: "cell", label: "Fusion cell", grants: "stamina", blurb: "Your suit's stamina runs much deeper now.", model: { model: `${SCIFI}/Prop_Crate4.glb`, height: 0.7 } },
        guardian: { id: "scolitex", label: "Scolitex", model: { model: `${SCIFI}/Alien_Scolitex.glb`, height: 1.8 }, health: 70, damage: 8, speed: 2.8, count: 2 },
      },
      {
        id: "base",
        label: "Abandoned Base",
        role: "vista",
        centerpiece: { model: `${SPACE}/basemodule_A.glb`, height: 6 },
        ruins: [{ model: `${SPACE}/basemodule_C.glb`, height: 4 }, { model: `${SPACE}/windturbine_tall.glb`, height: 9 }, { model: `${SPACE}/spacetruck.glb`, height: 2.4 }],
      },
      {
        id: "ridge",
        label: "Cyclops Ridge",
        role: "relic",
        centerpiece: { model: `${SPACE}/structure_tall.glb`, height: 12 },
        ruins: [{ model: `${SPACE}/rock_B.glb`, height: 4 }, { model: `${SCIFI}/Column_Pipes.glb`, height: 6 }, { model: `${SPACE}/lights.glb`, height: 2 }],
        relic: { id: "jets", label: "Boot jets", grants: "doubleJump", blurb: "Press Space again in the air to jump twice.", model: { model: `${SCIFI}/Prop_Crate3.glb`, height: 0.8 } },
        guardian: { id: "cyclop", label: "Cyclop", model: { model: `${SCIFI}/Alien_Cyclop.glb`, height: 2.2 }, health: 110, damage: 11, speed: 3, count: 3 },
      },
      {
        id: "beacon",
        label: "The Beacon",
        role: "final",
        centerpiece: { model: `${SPACE}/landingpad_large.glb`, height: 2 },
        ruins: [{ model: `${SCIFI}/Column_Astra.glb`, height: 9 }, { model: `${SPACE}/structure_low.glb`, height: 4 }, { model: `${SCIFI}/Prop_Light_Floor.glb`, height: 1.5 }],
        guardian: { id: "chrysalis", label: "Oculichrysalis", model: { model: `${SCIFI}/Alien_Oculichrysalis.glb`, height: 3.6 }, health: 420, damage: 16, speed: 2.4, count: 1 },
      },
    ],
    story: [
      { title: "Crash landing", pitch: "You walked away from the wreck. The glide fins are still in the hold." },
      { title: "The dead drill", pitch: "Something nests under the old drill. It has the fusion cell you need." },
      { title: "Cyclops Ridge", pitch: "The ridge is high and the cyclops hold it. Your boot jets are up there." },
      { title: "Light the beacon", pitch: "Everything you need is in hand. Light the beacon and go home." },
    ],
    scenery: [
      { model: `${SPACE}/cargo_A_stacked.glb`, height: 2.4 },
      { model: `${SPACE}/containers_A.glb`, height: 2.2 },
      { model: `${SCIFI}/Prop_Light_Floor.glb`, height: 1.5 },
      { model: `${SPACE}/rocks_A.glb`, height: 1.4 },
    ],
    world: {
      relief: 11,
      frequency: 0.007,
      waterLevel: -40,
      haze: 0.65,
      preset: "dusk",
      dayLength: 900,
      startHour: 16,
      scatter: {
        spire: { model: `${SPACE}/rock_A.glb`, height: 7 },
        spire2: { model: `${SPACE}/rock_B.glb`, height: 9 },
        dead: { model: `${NATURE}/DeadTree_3.glb`, height: 7, tint: "#c88a6a" },
        stalk: { model: `${NATURE}/Plant_7_Big.glb`, height: 2.4, tint: "#7fd6c8" },
        cap: { model: `${NATURE}/Mushroom_Laetiporus.glb`, height: 1.6, tint: "#b07ae0" },
        pebbles: { model: `${SPACE}/rocks_B.glb`, height: 1 },
        boulder: { model: `${NATURE}/Rock_Medium_2.glb`, height: 2.4, tint: "#b07858" },
      },
    },
    dressing: {
      forest: [{ item: "spire", weight: 3 }, { item: "spire2", weight: 2 }, { item: "dead", weight: 2 }, { item: "stalk", weight: 2 }],
      brush: [{ item: "cap", weight: 2 }, { item: "stalk", weight: 2 }, { item: "pebbles", weight: 3 }],
      rocks: [{ item: "boulder", weight: 3 }, { item: "pebbles", weight: 2 }],
      grass: { base: "#8a5a3c", tip: "#d0a070", height: 0.18 },
      trail: { surface: "gravel", color: "#6a4a38", width: 3.5 },
    },
  },
];

/** One beat per relic and one for the goal: the first finds the first relic, the last wakes the goal. */
function beatsFor(theme: Theme): BeatWord[] {
  const relics = theme.landmarks.filter((landmark) => landmark.relic !== undefined);
  return beats(theme.story, [
    ...relics.map((landmark, index) => ({ goal: `Take ${landmark.relic!.label} at ${landmark.label}`, fact: "journey.relics", atLeast: index + 1 })),
    { goal: `${theme.goal.verb} ${theme.goal.label}`, fact: "journey.won", atLeast: 1 },
  ]);
}

function read(text: string, said: readonly string[], options: { name?: string }): Idea {
  const theme = pickTheme(said, THEMES);
  const named = nameFor(text, theme.names, options);
  const { words: _words, names: _names, story: _story, dressing: _dressing, world, ...rest } = theme;
  return {
    ...rest,
    kind: "explorer",
    ...named,
    pitch: text.trim(),
    beats: beatsFor(theme),
    world: {
      relief: world.relief,
      frequency: world.frequency,
      waterLevel: world.waterLevel,
      scatter: world.scatter,
      sky: { preset: world.preset, cycle: true, dayLength: world.dayLength, startHour: world.startHour, haze: world.haze },
    },
  };
}

function themeOf(idea: Idea): Theme {
  return THEMES.find((theme) => theme.goal.label === idea.goal.label) ?? THEMES[0]!;
}

/** Metres out from the start each landmark sits, in journey order. */
const RINGS = [24, 72, 112, 150, 186, 222];

/**
 * The start camp at the middle facing +Z; the first landmark straight ahead a short walk away; the
 * rest out along a winding road that swings around the map, each on its own flattened rise with its
 * centrepiece, a ruin field and a shrine; groves, meadows and a lake between; wilds to the horizon.
 */
function scene(idea: Idea, layout: Layout): void {
  const theme = themeOf(idea);
  const dressing = theme.dressing;
  const start = { x: 0, z: 0 };
  layout.take(start, 3);
  layout.pad("start-pad", start, 12, undefined, 24);
  layout.marker({ id: "spawn", kind: "player_spawn", at: start, rotationY: 0, label: "Start", meta: { clearance: 3 } });
  const props = idea.scenery.map((_, index) => `scenery${index + 1}`);
  cluster(layout, { id: "camp", at: { x: 0, z: -9 }, radius: 6, props, count: 7, label: "Start camp", spacing: 1.8 });
  layout.take(start, 10);

  // Landmark spots: the first straight ahead, the rest swinging around one side of the map.
  const swing = layout.random() < 0.5 ? -1 : 1;
  let angle = Math.PI / 2;
  const spots = idea.landmarks.map((_, index) => {
    if (index === 0) return { x: 0, z: RINGS[0]! };
    angle += swing * layout.between(0.45, 0.85);
    const ring = RINGS[Math.min(index, RINGS.length - 1)]! + layout.between(-6, 6);
    return { x: Math.round(Math.cos(angle) * ring), z: Math.round(Math.sin(angle) * ring) };
  });

  let from = { x: 0, z: 4 };
  idea.landmarks.forEach((landmark: LandmarkWord, index) => {
    const at = spots[index]!;
    // The shrine faces the way you came in, so the relic is the first thing you walk up to.
    const dx = from.x - at.x;
    const dz = from.z - at.z;
    const length = Math.hypot(dx, dz) || 1;
    const shrine = index === 0 ? { x: 0, z: 17 } : { x: Math.round((at.x + (dx / length) * 7) * 10) / 10, z: Math.round((at.z + (dz / length) * 7) * 10) / 10 };
    const radius = landmark.role === "final" ? 16 : 13;
    // The road first, so nothing lands on it; the ruin field next, while the ground is free; then the
    // whole place is taken so groves and wilds stay out of it.
    trail(layout, { id: `road-${index + 1}`, from, to: shrine, dressing, label: `Road to ${landmark.label}` });
    layout.take(shrine, 3);
    layout.pad(`${landmark.id}-rise`, at, radius + 6, undefined, 28);
    layout.marker({ id: `lm-${landmark.id}`, kind: "landmark", at, label: landmark.label, meta: { landmark: landmark.id, radius: index === 0 ? 11 : radius } });
    const back = index === 0 ? { x: 0, z: RINGS[0]! + 6 } : { x: at.x - (dx / length) * 4, z: at.z - (dz / length) * 4 };
    layout.take(back, 4.5);
    layout.marker({ id: `lm-${landmark.id}-piece`, kind: "prop", catalogId: `lm_${landmark.id}`, at: back, rotationY: Math.atan2(dx, dz), label: landmark.label, meta: { clearance: 4 } });
    layout.marker({ id: `shrine-${landmark.id}`, kind: "shrine", at: shrine, label: landmark.relic?.label ?? idea.goal.label, meta: { landmark: landmark.id } });
    if (landmark.relic !== undefined) layout.marker({ id: `pedestal-${landmark.id}`, kind: "prop", catalogId: "pedestal", at: shrine, label: "Shrine" });
    const ruins = landmark.ruins.map((_, ruin) => `ruin_${landmark.id}_${ruin + 1}`);
    cluster(layout, { id: `${landmark.id}-ruins`, at, radius: radius - 1, props: ruins, count: landmark.role === "final" ? 12 : 9, label: `${landmark.label} ruins`, spacing: 2.6 });
    layout.take(at, radius + 3);
    from = shrine;
  });

  // Between the places: groves along the road, a meadow or two, a lake off to the side.
  for (let index = 0; index < 10; index += 1) {
    const at = layout.place(30, 200, 10, start, false);
    if (at !== null) grove(layout, { id: `grove-${index + 1}`, at, radius: layout.between(7, 12), dressing });
  }
  for (let index = 0; index < 3; index += 1) {
    const at = layout.place(30, 160, 18, start, false);
    if (at !== null) meadow(layout, { id: `meadow-${index + 1}`, at, half: 16, dressing });
  }
  if (dressing.water !== undefined) {
    const at = layout.place(60, 150, 26, start, false);
    if (at !== null) lake(layout, { id: "lake", at, radius: 20, level: -1.2, dressing, label: "Still lake" });
  }
  forest(layout, { id: "start-woods", at: { x: swing * -38, z: 6 }, radius: 16, dressing, density: 0.14, label: "Start woods" });
  wilds(layout, { dressing, inner: 40, outer: 245, forests: 16, outcrops: 12, drifts: 26 });
}

function readme(made: Idea): string {
  const relics = made.landmarks.filter((landmark) => landmark.relic !== undefined);
  const guarded = made.landmarks.filter((landmark) => landmark.guardian !== undefined);
  return `# ${made.name}

${made.tagline} Made with \`bun run games:new\` from: "${made.pitch}". Start it with \`bun --cwd=games/${made.id} run dev\` from the repository root.

## Design checklist

Every word, stat and model below lives in \`src/game/idea.ts\`; places live in \`src/editor.scene.json\`.

- **Core loop.** Follow the compass to the next landmark; reaching one puts it on your map and opens it for
  fast travel (T); take the relic on its shrine (E) once its guardians fall; a new ability opens new ground.
- **Progression.**
  - [x] ${made.landmarks.length} landmarks, ${relics.length} with relics: ${relics.map((landmark) => `${landmark.relic!.label} (${landmark.relic!.grants}) at ${landmark.label}`).join(", ")}.
  - [x] Glide runs the engine glide model while you hold Space in the air; the double jump and deeper stamina change how far you get.
  - [x] Guardians: ${guarded.map((landmark) => `${landmark.guardian!.count} ${landmark.guardian!.label.toLowerCase()}${landmark.guardian!.count > 1 ? "s" : ""} at ${landmark.label}`).join(", ")}.
  - [x] A ${made.beats.length}-beat story from ${made.guide.name} ends when you ${made.goal.verb.toLowerCase()} ${made.goal.label}.
- **Failure states.** Guardians hit back; at 0 health you are back at the last place you found 4 seconds later. Sprinting empties stamina and leaves you winded.
- **Minute 5 -> hour 5.** At 5:00 you have found two places and glide. Later places are farther, higher and guarded, so stamina, the second jump and fast travel decide how you get there.
- **References it is chasing.**
  - *Zelda: Breath of the Wild* - feel: a landmark on the horizon pulling you across open ground; a glider that changes the map.
  - *Shadow of the Colossus* - density: few places, each one big and worth the walk.
  - *Outer Wilds* - feel: knowing more, not levels, is what opens the world.
- **Gap to target.** No climbing, no map screen yet (only the compass), guardians only chase and swing.

Loop proof: ${made.id}-loop
`;
}

function loopFlow(made: Idea): Flow {
  // Flows run in play mode: capture.play has already left the title. The first landmark is straight ahead.
  const first = made.landmarks[0]!;
  return {
    steps: [
      { assert: flowAssertText(made.beats[0]!.title), before: { is: flowAssertText(made.beats[0]!.title), timeoutMs: 60000 }, note: "arrival: a run is up and the first story beat started by itself" },
      { assert: "__jgProbe().found === 0 && __jgProbe().distance > 10", note: `arrival: nothing found yet, ${first.label} is ahead on the compass` },
      { key: "KeyW", ms: 4200, after: { is: "__jgProbe().found >= 1", timeoutMs: 6000 }, note: `walk forward to ${first.label}: it is discovered` },
      { shot: "found" },
      { key: "KeyE", ms: 150, after: { is: "__jgProbe().relics >= 1", timeoutMs: 6000 }, note: `take ${first.relic?.label ?? "the relic"} on its shrine` },
      { assert: flowAssertText(made.beats[1]?.title ?? made.beats[0]!.title), before: { is: flowAssertText(made.beats[1]?.title ?? made.beats[0]!.title), timeoutMs: 8000 }, note: "arrival: the story moved on to the next beat" },
      { key: "Space", ms: 1800, after: { is: "__jgProbe().glided > 0.3", timeoutMs: 2000 }, note: "jump and hold Space: the glide model carries you, read from the game's own glide clock" },
      { assert: "__jgProbe().relics >= 1", note: "arrival: still carrying the relic after the glide" },
      { shot: "glide" },
    ],
  };
}

function clipFlow(_made: Idea): Flow {
  // Starts from `journey`: the first relic in hand and the second place found, so T fast-travels there.
  return {
    steps: [
      { wait: 2000 },
      { key: "KeyD", ms: 700 },
      { key: "KeyW", ms: 1500 },
      { key: "KeyW+Space", ms: 2600 },
      { key: "KeyD", ms: 1200 },
      { key: "KeyS", ms: 2500 },
      { key: "KeyT", ms: 120 },
      { wait: 2500 },
      { key: "KeyA", ms: 3000 },
      { key: "KeyA+Space", ms: 2600 },
      { key: "KeyA+ShiftLeft", ms: 5000 },
      { key: "KeyA+KeyW", ms: 3000 },
      { key: "mouse0", ms: 120 },
      { wait: 400 },
      { key: "mouse0", ms: 120 },
      { wait: 2000 },
      { assert: "__jgProbe().found >= 2 && __jgProbe().glided > 0.3", note: "arrival: two places on the map and a glide flown during the clip" },
    ],
  };
}

export const kind: KindModule<Idea> = {
  kind: "explorer",
  genre: "open-world exploration (landmarks, relics, glide)",
  words: [],
  read,
  scene,
  readme,
  loopFlow,
  clipFlow,
  clipState: "journey",
};
