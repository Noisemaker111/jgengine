/**
 * Racer: a career of circuit races at dusk. Pick a race in the garage, beat the rivals, get paid,
 * tune the car. The circuit winds between city districts from the engine's city studio, with
 * lamps along it, barriers in the corners and woods out past the city edge.
 */
import type { Idea } from "../template/racer/src/game/kindShape";
import { cluster, forest, patch, town, wilds, type Dressing } from "../world/dress";
import type { Layout, Spot } from "../world/layout";
import { nameFor } from "./shared";
import type { Flow, KindModule } from "./types";

const NATURE = "/models/quaternius-stylized-nature";
const CITY = "/models/kaykit-city-builder";

const DRESSING: Dressing = {
  forest: [{ item: "tree", weight: 3 }, { item: "tree2", weight: 2 }, { item: "pine", weight: 2 }],
  brush: [{ item: "bush", weight: 3 }, { item: "grass", weight: 2 }],
  rocks: [{ item: "rock", weight: 2 }],
  grass: { base: "#2f3d2a", tip: "#5d6a44", height: 0.28 },
  trail: { surface: "gravel", color: "#55545a", width: 4 },
};

function read(text: string, _said: readonly string[], options: { name?: string }): Idea {
  const named = nameFor(text, ["Neon Apex", "Night Shift GT", "Redline Run", "Apex Nights"], options);
  return {
    kind: "racer",
    ...named,
    pitch: text.trim(),
    tagline: "Win races. Tune the car. Own the night.",
    kit: "arcade",
    look: "cinematic",
    mood: "dusk",
    accent: "#ff3d8b",
    ground: { material: "grass", low: "#2c3a28", high: "#4b5640" },
    world: {
      relief: 7,
      frequency: 0.008,
      waterLevel: -40,
      scatter: {
        tree: { model: `${NATURE}/CommonTree_1.glb`, height: 10 },
        tree2: { model: `${NATURE}/CommonTree_4.glb`, height: 12 },
        pine: { model: `${NATURE}/Pine_2.glb`, height: 11 },
        bush: { model: `${NATURE}/Bush_Common.glb`, height: 1.2 },
        grass: { model: `${NATURE}/Grass_Common_Tall.glb`, height: 0.6 },
        rock: { model: `${NATURE}/Rock_Medium_1.glb`, height: 1.6 },
      },
      // The first race starts at sunset; a day is 24 minutes, so the career runs on into the night.
      sky: { preset: "dusk", cycle: true, dayLength: 1440, startHour: 18.6, haze: 0.4 },
    },
    guide: { name: "Vee", title: "Crew chief" },
    currency: { id: "cash", label: "Cash", start: 200 },
    car: { model: "vehicle/sports-car", height: 1.3 },
    rivals: [
      { model: `${CITY}/car_taxi.glb`, height: 1.5 },
      { model: `${CITY}/car_police.glb`, height: 1.5 },
      { model: `${CITY}/car_hatchback.glb`, height: 1.5 },
      { model: `${CITY}/car_stationwagon.glb`, height: 1.5 },
    ],
    upgrades: [
      { id: "engine", label: "Engine", cost: 150, levels: 5, boost: 0.08 },
      { id: "grip", label: "Tyres", cost: 120, levels: 5, boost: 0.08 },
      { id: "nitro", label: "Nitro", cost: 180, levels: 4, boost: 0.2 },
    ],
    races: [
      { id: "rookie", title: "Rookie sprint", laps: 2, rivals: 3, pay: 220, pitch: "Three locals, two laps. Show them you're real." },
      { id: "docks", title: "Dockside dash", laps: 3, rivals: 4, pay: 380, pitch: "The dock crews race for keeps. Three laps." },
      { id: "crown", title: "Crown of the city", laps: 3, rivals: 4, pay: 700, pitch: "The best in the city. Win this and the streets are yours." },
    ],
    scenery: [
      { model: "city/road-barrier", height: 1.1 },
      { model: `${CITY}/box_A.glb`, height: 1 },
      { model: `${CITY}/dumpster.glb`, height: 1.4 },
      { model: `${CITY}/trafficlight_A.glb`, height: 4.5 },
      { model: `${CITY}/watertower.glb`, height: 9 },
    ],
    trackside: { model: "city/street-lamp", height: 6 },
  };
}

/** One closed circuit, city districts on its outside, a park in the infield, woods past the city edge. */
function scene(idea: Idea, layout: Layout): void {
  const width = 14;
  const count = 56;
  const phase = layout.random() * Math.PI * 2;
  const line: Spot[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const wobble = 1 + 0.2 * Math.sin(angle * 3 + phase) + 0.07 * Math.cos(angle * 5);
    line.push({ x: Math.round(Math.cos(angle) * 150 * wobble * 10) / 10, z: Math.round(Math.sin(angle) * 95 * wobble * 10) / 10 });
  }
  // The circuit and a level pad under it; the hills start past it.
  layout.doc.paths.push({ id: "track", kind: "track", label: "Circuit", points: line.map((point) => ({ x: point.x, y: 0, z: point.z })), meta: { width } });
  layout.lanes.push({ points: [...line, line[0]!], half: width / 2 + 6 });
  layout.pad("circuit-pad", { x: 0, z: 0 }, 205, 0, 50);

  // Lamps every other point, alternating sides, facing the road.
  for (let index = 0; index < count; index += 2) {
    const from = line[index]!;
    const to = line[(index + 1) % count]!;
    const heading = Math.atan2(to.x - from.x, to.z - from.z);
    const side = index % 4 === 0 ? 1 : -1;
    const out = width / 2 + 3.5;
    layout.marker({
      id: `trackside-${index / 2 + 1}`,
      kind: "prop",
      catalogId: "trackside",
      at: { x: from.x + Math.cos(heading) * out * side, z: from.z - Math.sin(heading) * out * side },
      rotationY: heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2),
      label: "Trackside",
    });
  }
  layout.marker({ id: "spawn", kind: "player_spawn", at: line[0]!, label: "Grid", meta: { clearance: 4 } });

  // Barrier and crate piles on the outside of the tightest bends (the two ends of the oval).
  const props = idea.scenery.map((_, index) => `scenery${index + 1}`);
  [0, Math.floor(count / 2)].forEach((at, end) => {
    for (let index = -3; index <= 3; index += 3) {
      const point = line[(at + index + count) % count]!;
      const length = Math.hypot(point.x, point.z);
      const spot = { x: point.x + (point.x / length) * (width / 2 + 9), z: point.z + (point.z / length) * (width / 2 + 9) };
      cluster(layout, { id: `bend-${end + 1}-${index + 4}`, at: spot, radius: 4, props: props.slice(0, 3), count: 4, label: "Barriers", spacing: 1.6 });
    }
  });

  // City districts around the outside: downtown on the long sides, a town and an outpost yard on the ends.
  town(layout, { id: "downtown-north", at: { x: 0, z: -178 }, half: { x: 110, z: 34 }, look: "downtown", label: "Downtown" });
  town(layout, { id: "downtown-south", at: { x: -20, z: 182 }, half: { x: 95, z: 34 }, look: "downtown", label: "Harbour blocks" });
  town(layout, { id: "east-side", at: { x: 262, z: 0 }, half: { x: 40, z: 80 }, look: "town", label: "East side" });
  town(layout, { id: "west-yards", at: { x: -262, z: 0 }, half: { x: 40, z: 70 }, look: "outpost", label: "Rail yards" });

  // The infield is a park: a few groves and drifts of brush.
  for (let index = 0; index < 4; index += 1) {
    const at = layout.place(0, 70, 14, { x: 0, z: 0 }, false);
    if (at !== null) forest(layout, { id: `infield-grove-${index + 1}`, at, radius: layout.between(12, 18), dressing: DRESSING, density: 0.14, label: "Infield park" });
  }
  for (let index = 0; index < 6; index += 1) {
    const at = layout.place(0, 80, 5, { x: 0, z: 0 }, false);
    if (at !== null) patch(layout, { id: `infield-brush-${index + 1}`, at, radius: layout.between(4, 7), palette: DRESSING.brush });
  }
  wilds(layout, { dressing: DRESSING, inner: 230, outer: 330, forests: 12, outcrops: 6, drifts: 8, meadow: 90 });
}

function readme(made: Idea): string {
  const [first] = made.races;
  return `# ${made.name}

${made.tagline} Made with \`bun run games:new\` from: "${made.pitch}". Start it with \`bun --cwd=games/${made.id} run dev\` from the repository root.

## Design checklist

Every word, price and model below lives in \`src/game/idea.ts\`; the circuit, districts and woods live in \`src/editor.scene.json\`.

- **Core loop.** Pick a race in the garage, line up against ${first?.rivals ?? 3} rivals, drive the gates
  in order for the laps, finish, get paid, spend it on the car, race again.
- **Progression.** ${made.races.length} races unlock in order and pay ${made.races.map((race) => race.pay).join(" / ")} ${made.currency.label.toLowerCase()};
  ${made.upgrades.map((upgrade) => `${upgrade.label} (${upgrade.levels} levels from ${upgrade.cost})`).join(", ")} make the car faster each level.
- **Failure states.** Finish outside the top three and the race pays nothing; the next race stays locked.
- **Minute 5 -> hour 5.** At 5:00 the first race is won and one upgrade is on the car. The later races
  bring more rivals and laps, and the upgrades are what lets you keep up. The sun sets over the first race and the career runs into the night.
- **References it is chasing.**
  - *Need for Speed: Underground* - feel: night streets and a car you tune; UI: a garage between races.
  - *Burnout* - feel: speed you feel through the camera; density: rivals close enough to trade paint.
- **Gap to target.** One circuit and no traffic yet; rivals follow the racing line rather than racing you.

Loop proof: ${made.id}-loop
`;
}

function loopFlow(made: Idea): Flow {
  return {
    steps: [
      { assert: "/start race/i.test(document.body.innerText)", before: { is: "/start race/i.test(document.body.innerText)", timeoutMs: 60000 }, note: "arrival: the career opens in the garage with the first race on the board" },
      { click: "Start race", after: { is: "__jgProbe().racing === 1", timeoutMs: 20000 }, note: "line up; the count runs and the lights go green" },
      { assert: "__jgProbe().rivals > 0", note: "arrival: rivals are on the grid, read from the game's own session" },
      { key: "KeyT", ms: 120, after: { is: "__jgProbe().assist === 1", timeoutMs: 3000 }, note: "steering assist on, so a held throttle follows the racing line" },
      { key: "KeyW", ms: 70000, note: "race the first event flat out" },
      { assert: `__jgProbe().racing === 0 && __jgProbe().cash > ${made.currency.start}`, before: { is: "__jgProbe().racing === 0", timeoutMs: 60000 }, note: "arrival: the race finished on the podium and paid out, so the career loop turns" },
    ],
  };
}

function clipFlow(_made: Idea): Flow {
  return { steps: [{ key: "KeyT", ms: 120 }, { key: "KeyW", ms: 25000 }, { assert: "__jgProbe().racing === 1", note: "arrival: mid-race with assist on" }] };
}

export const kind: KindModule<Idea> = {
  kind: "racer",
  genre: "circuit racing career",
  words: [],
  read,
  scene,
  readme,
  loopFlow,
  clipFlow,
  clipState: "race",
};
