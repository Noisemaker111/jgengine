/**
 * Shooter: a third-person campaign of outposts to clear. Leave the base, shoot your way through each
 * camp's garrison, get paid per kill and per camp, buy guns and upgrades, go again. Themes are plain
 * data rows (who holds the outposts, which guns, which models draw them, how the land looks); the
 * idea's words pick one. New themes are new rows here.
 */
import type { BeatWord, ModelRef, WorldWord } from "../template/common/src/game/ideaShape";
import type { EnemyWord, Idea, OutpostWord } from "../template/shooter/src/game/kindShape";
import { cluster, grove, patch, town, trail, wilds, type Dressing, type TownLook } from "../world/dress";
import type { Layout, Spot } from "../world/layout";
import { beats, nameFor, pickTheme } from "./shared";
import type { Flow, KindModule } from "./types";

type Theme = Omit<Idea, "kind" | "id" | "spec" | "name" | "pitch" | "beats" | "world" | "outposts"> & {
  words: readonly string[];
  names: readonly string[];
  /** Outpost names and the enemy ids that hold each, nearest first. */
  camps: readonly { label: string; garrison: readonly string[]; pay: number }[];
  /** One story line per outpost. */
  story: readonly { title: string; pitch: string }[];
  world: Omit<WorldWord, "sky"> & { haze: number; preset: "day" | "dusk" | "night"; startHour: number };
  dressing: Dressing;
  /** A district out past the outposts, on a trail from the base. */
  town?: { look: TownLook; label: string };
};

const NATURE = "/models/quaternius-stylized-nature";
const SPACE = "/models/kaykit-space-base";
const SCIFI = "/models/quaternius-modular-scifi";
const CITY = "/models/kaykit-city-builder";

const ALIEN = (file: string, height: number): ModelRef => ({ model: `${SCIFI}/${file}.glb`, height });

const THEMES: readonly Theme[] = [
  {
    words: ["alien", "aliens", "sci", "fi", "scifi", "space", "planet", "mars", "hive", "bug", "bugs", "robot", "robots", "colony", "invasion", "star", "galaxy"],
    names: ["Hive Breaker", "Red Dust Sweep", "Outpost Zero", "Starfall Ops"],
    tagline: "Push out from the base. Break every hive camp. Get paid.",
    kit: "holo",
    look: "cinematic",
    mood: "dusk",
    accent: "#4fd8ff",
    ground: { material: "rock", low: "#6b3f2c", high: "#a8664a" },
    guide: { name: "Command", title: "Forward command" },
    hero: { model: "human/soldier", height: 1.8, health: 150, label: "Trooper" },
    base: { label: "Forward Base", model: { model: `${SPACE}/basemodule_A.glb`, height: 6 } },
    foe: "the Hive",
    currency: { id: "credits", label: "Credits", start: 0 },
    guns: [
      { id: "carbine", label: "Carbine", damage: 12, range: 60, spread: 1.2, pellets: 1, rpm: 540, auto: true, mag: 30, reloadMs: 1600, price: 0 },
      { id: "scatter", label: "Scattergun", damage: 9, range: 22, spread: 6, pellets: 8, rpm: 75, auto: false, mag: 6, reloadMs: 2200, price: 300 },
      { id: "marksman", label: "Marksman", damage: 55, range: 120, spread: 0.3, pellets: 1, rpm: 90, auto: false, mag: 8, reloadMs: 2000, price: 650 },
      { id: "pulse", label: "Pulse LMG", damage: 16, range: 70, spread: 2.2, pellets: 1, rpm: 720, auto: true, mag: 80, reloadMs: 3200, price: 1200 },
    ],
    enemies: [
      { id: "cyclop", label: "Cyclop gunner", model: ALIEN("Alien_Cyclop", 1.9), health: 70, damage: 5, range: 26, every: 1.4, spread: 3.5, speed: 2, bounty: 25 },
      { id: "scolitex", label: "Scolitex", model: ALIEN("Alien_Scolitex", 1.9), health: 50, damage: 4, range: 20, every: 0.9, spread: 4.5, speed: 3.6, bounty: 30 },
      { id: "brute", label: "Oculichrysalis brute", model: ALIEN("Alien_Oculichrysalis", 2.5), health: 260, damage: 14, range: 30, every: 2.2, spread: 2.5, speed: 1.5, bounty: 90 },
    ],
    camps: [
      { label: "Drill Site", garrison: ["cyclop", "cyclop", "cyclop"], pay: 150 },
      { label: "Crater Nest", garrison: ["cyclop", "scolitex", "scolitex", "cyclop"], pay: 250 },
      { label: "Relay Hive", garrison: ["cyclop", "scolitex", "brute", "scolitex", "cyclop"], pay: 400 },
      { label: "Queen's Spire", garrison: ["brute", "scolitex", "cyclop", "brute", "scolitex", "cyclop"], pay: 700 },
    ],
    upgrades: [
      { id: "armor", label: "Armor", stat: "armor", step: 0.25, price: 200, stages: 4 },
      { id: "rounds", label: "Rounds", stat: "damage", step: 0.2, price: 250, stages: 4 },
    ],
    story: [
      { title: "Boots on the dust", pitch: "The Hive dug in at the old drill site. Clear it and the road out is ours." },
      { title: "The crater", pitch: "Scolitex swarm the crater nest. Keep moving and keep firing." },
      { title: "Cut the relay", pitch: "The relay hive calls the brutes. Bring something heavier." },
      { title: "Queen's Spire", pitch: "Their last camp. Break it and the planet is clear." },
    ],
    cover: [
      { model: `${SPACE}/cargo_A.glb`, height: 1.6 },
      { model: `${SPACE}/containers_B.glb`, height: 2.2 },
      { model: `${SCIFI}/Prop_Crate3.glb`, height: 1 },
      { model: `${SCIFI}/Prop_Barrel_Large.glb`, height: 1.3 },
      { model: `${SPACE}/structure_low.glb`, height: 3 },
    ],
    scenery: [
      { model: `${SPACE}/solarpanel.glb`, height: 2.2 },
      { model: `${SPACE}/windturbine_low.glb`, height: 6 },
      { model: `${SPACE}/lander_A.glb`, height: 5 },
      { model: `${SPACE}/cargo_B_stacked.glb`, height: 3 },
      { model: `${SPACE}/rocks_A.glb`, height: 2 },
      { model: `${SPACE}/spacetruck.glb`, height: 2.4 },
    ],
    world: {
      relief: 6,
      frequency: 0.009,
      waterLevel: -40,
      haze: 0.5,
      preset: "dusk",
      startHour: 17.4,
      scatter: {
        deadtree: { model: `${NATURE}/DeadTree_3.glb`, height: 6 },
        deadtree2: { model: `${NATURE}/DeadTree_5.glb`, height: 5 },
        rock: { model: `${NATURE}/Rock_Medium_3.glb`, height: 2.4 },
        rock2: { model: `${NATURE}/Rock_Medium_1.glb`, height: 1.4 },
        boulder: { model: `${SPACE}/rock_A.glb`, height: 3 },
        pebble: { model: `${NATURE}/Pebble_Round_2.glb`, height: 0.4 },
      },
    },
    dressing: {
      forest: [{ item: "deadtree", weight: 3 }, { item: "deadtree2", weight: 2 }, { item: "boulder", weight: 1 }],
      brush: [{ item: "pebble", weight: 3 }, { item: "rock2", weight: 1 }],
      rocks: [{ item: "rock", weight: 2 }, { item: "boulder", weight: 2 }, { item: "rock2", weight: 1 }],
      trail: { surface: "gravel", color: "#7a4c38", width: 4 },
    },
  },
  {
    words: ["city", "town", "street", "streets", "gang", "gangs", "cartel", "cop", "cops", "police", "heist", "modern", "urban", "downtown", "mercenary", "contractor", "militia", "soldier", "war"],
    names: ["Blackline", "Hard Count", "Dead Drop", "Concrete Front"],
    tagline: "Take the city back one hideout at a time.",
    kit: "signal",
    look: "cinematic",
    mood: "golden",
    accent: "#ff7a2e",
    ground: { material: "slate", low: "#4a4c48", high: "#6e6c62" },
    guide: { name: "Dispatch", title: "Task force lead" },
    hero: { model: "human/police-officer", height: 1.8, health: 140, label: "Agent" },
    base: { label: "Task Force HQ", model: { model: `${CITY}/building_E.glb`, height: 10 } },
    foe: "Blackline",
    currency: { id: "cash", label: "Cash", start: 0 },
    guns: [
      { id: "pistol", label: "Pistol", damage: 18, range: 45, spread: 1, pellets: 1, rpm: 300, auto: false, mag: 12, reloadMs: 1300, price: 0 },
      { id: "smg", label: "SMG", damage: 10, range: 40, spread: 2, pellets: 1, rpm: 780, auto: true, mag: 32, reloadMs: 1700, price: 250 },
      { id: "shotgun", label: "Shotgun", damage: 10, range: 20, spread: 6, pellets: 8, rpm: 70, auto: false, mag: 6, reloadMs: 2400, price: 450 },
      { id: "rifle", label: "Rifle", damage: 22, range: 90, spread: 0.8, pellets: 1, rpm: 480, auto: true, mag: 30, reloadMs: 2100, price: 1000 },
    ],
    enemies: [
      { id: "thug", label: "Thug", model: { model: "human/man-casual", height: 1.9, tint: "#b0a090" }, health: 60, damage: 5, range: 24, every: 1.3, spread: 3.5, speed: 2.4, bounty: 20 },
      { id: "guard", label: "Hired guard", model: { model: "human/security-guard", height: 1.9 }, health: 90, damage: 7, range: 30, every: 1.5, spread: 2.8, speed: 2.2, bounty: 35 },
      { id: "heavy", label: "Heavy", model: { model: "human/construction-worker", height: 2.3, tint: "#8a8a8a" }, health: 240, damage: 13, range: 22, every: 2, spread: 3, speed: 1.6, bounty: 85 },
    ],
    camps: [
      { label: "Rail Yard", garrison: ["thug", "thug", "thug"], pay: 150 },
      { label: "Chop Shop", garrison: ["thug", "guard", "thug", "guard"], pay: 250 },
      { label: "Warehouse 9", garrison: ["guard", "heavy", "thug", "guard", "thug"], pay: 400 },
      { label: "The Tower Lot", garrison: ["heavy", "guard", "guard", "heavy", "thug", "guard"], pay: 700 },
    ],
    upgrades: [
      { id: "armor", label: "Vest", stat: "armor", step: 0.25, price: 200, stages: 4 },
      { id: "rounds", label: "Ammo", stat: "damage", step: 0.2, price: 250, stages: 4 },
    ],
    story: [
      { title: "First hit", pitch: "Blackline runs guns through the rail yard. Shut it down." },
      { title: "The chop shop", pitch: "Their cars come out of a shop on the east side. Close it." },
      { title: "Warehouse 9", pitch: "The money sits in a warehouse with hired guns on it. Take it." },
      { title: "The tower lot", pitch: "Their last stronghold. Clear it and Blackline is finished." },
    ],
    cover: [
      { model: "city/road-barrier", height: 1.1 },
      { model: "industrial/wooden-crate", height: 1 },
      { model: "industrial/barrel", height: 1.1 },
      { model: `${CITY}/dumpster.glb`, height: 1.4 },
      { model: `${CITY}/car_sedan.glb`, height: 1.5 },
    ],
    scenery: [
      { model: "city/street-lamp", height: 5 },
      { model: `${CITY}/car_hatchback.glb`, height: 1.5 },
      { model: "city/trash-can", height: 1.1 },
      { model: "city/utility-cabinet", height: 1.4 },
      { model: `${CITY}/box_A.glb`, height: 1 },
      { model: `${CITY}/watertower.glb`, height: 8 },
    ],
    world: {
      relief: 2,
      frequency: 0.012,
      waterLevel: -40,
      haze: 0.4,
      preset: "day",
      startHour: 16.5,
      scatter: {
        tree: { model: `${NATURE}/CommonTree_2.glb`, height: 9 },
        tree2: { model: `${NATURE}/CommonTree_4.glb`, height: 10 },
        bush: { model: `${NATURE}/Bush_Common.glb`, height: 1.1 },
        rock: { model: `${NATURE}/Rock_Medium_2.glb`, height: 1.4 },
      },
    },
    dressing: {
      forest: [{ item: "tree", weight: 3 }, { item: "tree2", weight: 2 }],
      brush: [{ item: "bush", weight: 2 }],
      rocks: [{ item: "rock", weight: 2 }],
      grass: { base: "#4a5236", tip: "#7d8352", height: 0.28 },
      trail: { surface: "gravel", color: "#55545a", width: 5 },
    },
    town: { look: "downtown", label: "Downtown" },
  },
];

function read(text: string, said: readonly string[], options: { name?: string }): Idea {
  const theme = pickTheme(said, THEMES);
  const named = nameFor(text, theme.names, options);
  const { words: _words, names: _names, camps, story, dressing: _dressing, town: _town, world, ...rest } = theme;
  const outposts: OutpostWord[] = camps.map((camp, index) => ({ id: `outpost${index + 1}`, ...camp }));
  const plot: BeatWord[] = beats(
    story,
    outposts.map((outpost, index) => ({ goal: `Clear ${outpost.label}`, fact: "ops.cleared", atLeast: index + 1 })),
  );
  return {
    ...rest,
    kind: "shooter",
    ...named,
    pitch: text.trim(),
    outposts,
    beats: plot,
    world: {
      relief: world.relief,
      frequency: world.frequency,
      waterLevel: world.waterLevel,
      scatter: world.scatter,
      // A 30-minute day, so a session runs from late afternoon into the night.
      sky: { preset: world.preset, cycle: true, dayLength: 1800, startHour: world.startHour, haze: world.haze },
    },
  };
}

function themeOf(idea: Idea): Theme {
  return THEMES.find((theme) => theme.base.label === idea.base.label) ?? THEMES[0]!;
}

const enemyOf = (idea: Idea, id: string): EnemyWord => idea.enemies.find((enemy) => enemy.id === id) ?? idea.enemies[0]!;

/**
 * The base on a level pad at the middle; the outposts in a ring 55-110 m out, further and bigger as
 * the campaign goes, each on its own pad with cover piled at its back and sides and a trail from the
 * base; scenery yards near the base; groves between; a district (city theme) and wilds to the horizon.
 */
function scene(idea: Idea, layout: Layout): void {
  const theme = themeOf(idea);
  const dressing = theme.dressing;
  layout.take({ x: 0, z: 0 }, 14);
  layout.pad("base-pad", { x: 0, z: 0 }, 20, undefined, 26);
  layout.marker({ id: "home", kind: "home", at: { x: 0, z: -4 }, label: idea.base.label, meta: { clearance: 8 } });
  // You face +z, which is where the camera starts looking.
  layout.marker({ id: "spawn", kind: "player_spawn", at: { x: 0, z: 6 }, rotationY: 0, label: "Spawn", meta: { clearance: 3 } });

  const cover = idea.cover.map((_, index) => `cover${index + 1}`);
  const props = idea.scenery.map((_, index) => `scenery${index + 1}`);
  const start = layout.turn();
  const centres: Spot[] = [];
  idea.outposts.forEach((outpost, index) => {
    const angle = start + index * ((Math.PI * 2) / idea.outposts.length) + layout.between(-0.3, 0.3);
    const distance = 58 + index * 16;
    const at = { x: Math.round(Math.cos(angle) * distance), z: Math.round(Math.sin(angle) * distance) };
    centres.push(at);
    layout.pad(`${outpost.id}-pad`, at, 22, undefined, 24);
    layout.marker({ id: outpost.id, kind: "outpost", at, label: outpost.label, meta: { outpost: outpost.id, clearance: 10 } });
    // Guards stand in a loose ring, facing out toward the base.
    outpost.garrison.forEach((enemy, slot) => {
      const around = (slot / outpost.garrison.length) * Math.PI * 2 + layout.between(-0.3, 0.3);
      const r = slot === 0 ? 0 : layout.between(3.5, 6.5);
      const spot = { x: at.x + Math.cos(around) * r, z: at.z + Math.sin(around) * r };
      layout.marker({
        id: `${outpost.id}-guard${slot + 1}`,
        kind: "guard",
        at: spot,
        rotationY: Math.atan2(-spot.x, -spot.z),
        label: enemyOf(idea, enemy).label,
        meta: { outpost: outpost.id, enemy },
      });
    });
    // Cover piles at the back and both sides (+z, +x, -x), leaving the -z approach open.
    [{ x: 4, z: 12 }, { x: 11, z: 2 }, { x: -11, z: 2 }].forEach((offset, pile) => {
      cluster(layout, {
        id: `${outpost.id}-cover${pile + 1}`,
        at: { x: at.x + offset.x, z: at.z + offset.z },
        radius: 3.5,
        props: [cover[(index + pile) % cover.length]!, cover[(index + pile + 2) % cover.length]!],
        count: 4,
        label: `${outpost.label} cover`,
        spacing: 1.8,
      });
    });
    // The camp's landmark behind its guards, then the whole camp is taken so nothing else lands in it.
    layout.marker({ id: `${outpost.id}-landmark`, kind: "prop", catalogId: cover[cover.length - 1]!, at: { x: at.x - 5, z: at.z + 8 }, rotationY: layout.turn(), label: outpost.label, meta: { clearance: 3 } });
    layout.take(at, 18);
  });

  // Trails from the base edge to each outpost's open side.
  centres.forEach((to, index) => {
    const length = Math.hypot(to.x, to.z);
    trail(layout, { id: `trail-${index + 1}`, from: { x: (to.x / length) * 16, z: (to.z / length) * 16 }, to: { x: (to.x / length) * (length - 20), z: (to.z / length) * (length - 20) }, dressing });
  });

  // The city theme's district straight ahead of the spawn, past the outposts, so the skyline is the first view.
  if (theme.town !== undefined) {
    town(layout, { id: "district", at: { x: 0, z: 178 }, half: { x: 60, z: 40 }, look: theme.town.look, label: theme.town.label });
  }

  // Scenery yards round the base, groves and brush between it and the outposts.
  for (let index = 0; index < 6; index += 1) {
    const at = layout.place(18, 40, 5, { x: 0, z: 0 }, false);
    // Keep the view ahead of the spawn open.
    if (at === null || (at.z > 0 && Math.abs(at.x) < 22)) continue;
    cluster(layout, { id: `yard-${index + 1}`, at, radius: 5, props: [props[index % props.length]!, props[(index + 3) % props.length]!], count: 3, label: idea.base.label, spacing: 2.2 });
  }
  for (let index = 0; index < 7; index += 1) {
    const at = layout.place(30, 110, 9, { x: 0, z: 0 }, false);
    if (at !== null) grove(layout, { id: `grove-${index + 1}`, at, radius: layout.between(6, 10), dressing });
  }
  for (let index = 0; index < 8; index += 1) {
    const at = layout.place(20, 120, 4, { x: 0, z: 0 }, false);
    if (at !== null) patch(layout, { id: `brush-${index + 1}`, at, radius: layout.between(3, 6), palette: dressing.brush });
  }
  wilds(layout, { dressing, inner: 130, outer: 260, forests: 12, outcrops: 10, drifts: 14 });
}

function readme(made: Idea): string {
  const [first] = made.guns;
  return `# ${made.name}

${made.tagline} Made with \`bun run games:new\` from: "${made.pitch}". Start it with \`bun --cwd=games/${made.id} run dev\` from the repository root.

## Design checklist

Every word, price and model below lives in \`src/game/idea.ts\`; the base, outposts and guard posts live in \`src/editor.scene.json\`.

- **Core loop.** Leave the ${made.base.label.toLowerCase()} with the ${first?.label ?? "starting gun"}, walk a trail to an outpost held by ${made.foe},
  shoot its garrison (they shoot back when they see you), collect ${made.currency.label.toLowerCase()} per kill and for the whole camp, spend it, go again.
- **Progression.**
  - [x] ${made.outposts.length} outposts with growing garrisons: ${made.outposts.map((outpost) => `${outpost.label} (${outpost.garrison.length} guards, ${outpost.pay})`).join(", ")}.
  - [x] Guns to buy (digit keys): ${made.guns.slice(1).map((gun) => `${gun.label} ${gun.price}`).join(", ")}.
  - [x] Upgrades in stages: ${made.upgrades.map((upgrade) => `${upgrade.label} +${Math.round(upgrade.step * 100)}% ${upgrade.stat} per stage`).join(", ")}.
  - [x] A ${made.beats.length}-beat story from ${made.guide.name}, one beat per outpost.
- **Failure states.** You have ${made.hero.health} health; at 0 you go down and go back to the last save (every outpost cleared saves).
- **Minute 5 -> hour 5.** At 5:00 the first outpost is down and a second gun is in reach. Later camps bring tougher guards, so the guns and upgrades decide whether you clear them.
- **References it is chasing.**
  - *Ghost Recon Wildlands* - feel: open ground, camps to clear in any order; UI: a small HUD and the reticle.
  - *Gears of War* - feel: the shoulder camera and aim-down-sights; density: cover piled around every camp.
- **Gap to target.** No crouch or snap-to-cover yet; guards hold their posts rather than flanking.

Loop proof: ${made.id}-loop
`;
}

/**
 * Drop beside the nearest guard (the "approach" command) and fire bursts at it. `mouse` presses the
 * real trigger; a recording does not pass mouse buttons through, so the clip pulls the trigger with the
 * fire command instead, one pull per round the carbine cycles.
 */
function engagements(rounds: number, mouse = true): Record<string, unknown>[] {
  const fire = { rpc: { method: "run_command", name: "fire", input: {} } };
  const burst = mouse ? [{ key: "mouse0", ms: 550 }] : Array.from({ length: 5 }, () => [fire, { wait: 115 }]).flat();
  return Array.from({ length: rounds }, () => [
    { rpc: { method: "run_command", name: "approach", input: {} } },
    { wait: 500 },
    ...Array.from({ length: 4 }, () => [...burst, { wait: 350 }]).flat(),
  ]).flat();
}

function loopFlow(made: Idea): Flow {
  const [first] = made.outposts;
  return {
    steps: [
      { assert: `/${made.beats[0]!.title}/i.test(document.body.innerText)`, before: { is: `/${made.beats[0]!.title}/i.test(document.body.innerText)`, timeoutMs: 60000 }, note: "arrival: a run is up and the first beat started by itself" },
      { assert: "__jgProbe().guards > 0 && __jgProbe().health > 0", note: "arrival: the outposts are garrisoned and you are alive" },
      // A short walk turns the body to the camera's facing, so the approach lines the guard up under the crosshair.
      { key: "KeyW", ms: 400 },
      ...engagements(10),
      { assert: "__jgProbe().kills >= 1", note: "arrival: shots landed through the projectile system and a guard died" },
      {
        assert: `__jgProbe().cleared >= 1 && __jgProbe().cash > ${made.currency.start + (first?.pay ?? 0) - 1}`,
        before: { is: "__jgProbe().cleared >= 1", timeoutMs: 15000 },
        note: `arrival: ${first?.label ?? "the first outpost"} is cleared and paid out, so the campaign turns`,
      },
    ],
  };
}

function clipFlow(_made: Idea): Flow {
  return {
    steps: [
      { key: "KeyW", ms: 400 },
      ...engagements(8, false),
      { assert: "__jgProbe().health > 0", note: "arrival: still standing after the firefight" },
    ],
  };
}

export const kind: KindModule<Idea> = {
  kind: "shooter",
  genre: "third-person shooter (clear the outposts)",
  words: [],
  read,
  scene,
  readme,
  loopFlow,
  clipFlow,
  clipState: "fight",
};
