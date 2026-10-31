// The playable starter a 3d `jgengine create` writes: a main menu, a HUD, one verb (interact), one meter,
// one goal, one unlock, a probe, a from-zero proof, PLAN.md and a perf budget, all wired through the
// engine's parts so milestone 1 starts as a diff.

import { escapeHtml } from "../escapeHtml";

/** What the starter's rules and plan say: the game's name and the one-line brief it was created with. */
export interface StarterGameOptions {
  id: string;
  name: string;
  /** The create call's `--brief`, the user's words. */
  brief?: string | undefined;
  template: "3d" | "builder" | "2d";
  /** The starter loop needs the authored caches and beacon of the starter scene. */
  loop: boolean;
  player?: string | undefined;
  ground: "flat" | "terrain";
}

/** `src/game/rules.ts`: the starter loop as plain functions over plain data, built from the parts. */
export const starterRulesTs = `import { evaluatePredicate, type Predicate } from "@jgengine/core/rules/predicate";
import { pickWeighted } from "@jgengine/core/random/pick";
import { changeMeter, createMeter, tickMeter, type MeterRates, type MeterState } from "@jgengine/core/stats/statPool";
import { crossThresholds, tierAt, type ThresholdBoundary } from "@jgengine/core/threshold/thresholds";
import type { PacedScheduleConfig, PacedScheduleState } from "@jgengine/core/time/pacedSchedule";

// Every number here is this game's to change. The parts (meter, ladder, requirement, table, schedule)
// stay; replace the gather loop with your own verbs as the plan's milestones say.

/** Energy is a meter: it drains while you play and sprint, and gathering fills it. */
export const ENERGY = { max: 100, start: 60 } as const;
export const ENERGY_RATES: MeterRates = { decay: 0.4 };
export const GATHER_ENERGY = 20;
export const SPRINT_DRAIN_PER_SECOND = 3;
export const SPRINT_MIN_ENERGY = 10;

/** What a cache gives is a weighted table. */
export const FINDS = [
  { id: "timber", label: "Timber", weight: 5 },
  { id: "flint", label: "Flint", weight: 3 },
  { id: "amber", label: "Amber", weight: 1 },
] as const;
export type FindId = (typeof FINDS)[number]["id"];

/** Ranks are a ladder over caches gathered; the second step unlocks sprinting. */
export const RANK_LADDER: readonly ThresholdBoundary<string>[] = [
  { id: "Wanderer", at: 0 },
  { id: "Forager", at: 2 },
  { id: "Pathfinder", at: 5 },
];
export const SPRINT_AT = 2;

/** The goal is a requirement over facts: three caches gathered, then stand at the beacon. */
export const GOAL: Predicate = { all: [{ gte: ["gathered", 3] }, { eq: ["atBeacon", true] }] };
export const GOAL_GATHERED = 3;

/** Emptied caches fill again on a schedule, one per event, counted in seconds of play. */
export const REFILL: PacedScheduleConfig = { firstAt: 25, every: 25, jitter: 5 };

/** The tutorial beats a new player does, in order. The probe reports how many are done as \`taught\`. */
export const LESSONS = ["walk", "gather", "sprint", "goal"] as const;
export type Lesson = (typeof LESSONS)[number];

/** One run, as plain JSON: it lives in the game store, so saves, replays and snapshots carry it. */
export interface RunState {
  playSeconds: number;
  energy: MeterState;
  gathered: number;
  /** Distinct finds met, in the order they were found. */
  finds: FindId[];
  /** Caches gathered and not yet refilled, oldest first. */
  emptied: string[];
  refilled: number;
  /** The refill schedule's own state, so a save resumes it where it was. */
  refill: PacedScheduleState;
  atBeacon: boolean;
  won: boolean;
  taught: Lesson[];
  message: string | null;
}

export function newRun(): RunState {
  return {
    playSeconds: 0,
    energy: createMeter({ max: ENERGY.max, current: ENERGY.start }),
    gathered: 0,
    finds: [],
    emptied: [],
    refilled: 0,
    refill: { nextAt: REFILL.firstAt, fired: 0, pausedAt: null },
    atBeacon: false,
    won: false,
    taught: [],
    message: "Walk to a cache and press E to gather",
  };
}

export function rankOf(run: RunState): string {
  return tierAt(RANK_LADDER, run.gathered)?.id ?? "Wanderer";
}

/** Ladder steps reached past the first. */
export function unlocksOf(run: RunState): number {
  return RANK_LADDER.filter((rank) => rank.at > 0 && run.gathered >= rank.at).length;
}

export function canSprint(run: RunState): boolean {
  return run.gathered >= SPRINT_AT && run.energy.pool.current > SPRINT_MIN_ENERGY;
}

export function goalMet(run: RunState): boolean {
  return evaluatePredicate(GOAL, { gathered: run.gathered, atBeacon: run.atBeacon });
}

export function teach(run: RunState, lesson: Lesson): RunState {
  return run.taught.includes(lesson) ? run : { ...run, taught: [...run.taught, lesson] };
}

/** Gather one cache. An empty cache gives nothing. */
export function gather(run: RunState, cacheId: string, rng: () => number): RunState {
  if (run.won || run.emptied.includes(cacheId)) return run;
  const find = pickWeighted(rng, FINDS, (entry) => entry.weight) ?? FINDS[0];
  const gathered = run.gathered + 1;
  const rankUp = crossThresholds(RANK_LADDER, run.gathered, gathered).find((crossing) => crossing.direction === "up");
  const next: RunState = {
    ...run,
    gathered,
    energy: changeMeter(run.energy, GATHER_ENERGY).meter,
    finds: run.finds.includes(find.id) ? run.finds : [...run.finds, find.id],
    emptied: [...run.emptied, cacheId],
    message:
      rankUp !== undefined
        ? "Rank up: " + rankUp.id + (rankUp.at === SPRINT_AT ? ". Hold Shift to sprint" : "")
        : gathered >= GOAL_GATHERED
          ? "Found " + find.label + ". Now walk to the beacon"
          : "Found " + find.label,
  };
  return teach(next, "gather");
}

/** Advance play by \`dt\` seconds: the meter drains (more while sprinting) and \`refills\` caches fill again. */
export function advanceRun(run: RunState, dt: number, sprinting: boolean, refills: number): RunState {
  let energy = tickMeter(run.energy, ENERGY_RATES, dt).meter;
  const sprint = sprinting && canSprint(run);
  if (sprint) energy = changeMeter(energy, -SPRINT_DRAIN_PER_SECOND * dt).meter;
  const filled = Math.min(refills, run.emptied.length);
  const next: RunState = {
    ...run,
    playSeconds: run.playSeconds + dt,
    energy,
    ...(filled > 0 ? { emptied: run.emptied.slice(filled), refilled: run.refilled + filled } : {}),
  };
  return sprint ? teach(next, "sprint") : next;
}

/** The player stepped onto (or off) the beacon; standing on it with the requirement met wins. */
export function atBeacon(run: RunState, at: boolean): RunState {
  const next = { ...run, atBeacon: at };
  if (next.won || !goalMet(next)) {
    return at && !next.won ? { ...next, message: "Gather " + (GOAL_GATHERED - run.gathered) + " more, then come back" } : next;
  }
  return teach({ ...next, won: true, message: "The beacon is lit. Milestone 1 plays" }, "goal");
}
`;

/** `src/game/rules.test.ts`. */
export const starterRulesTest = `import { describe, expect, test } from "bun:test";

import { seededRng } from "@jgengine/core/random/rng";

import { advanceRun, atBeacon, canSprint, gather, newRun, rankOf, unlocksOf } from "./rules";

describe("starter rules", () => {
  test("gathering fills the meter, meets finds and climbs the ladder", () => {
    const rng = seededRng("rules");
    let run = newRun();
    const start = run.energy.pool.current;
    run = gather(run, "cache_1", rng);
    expect(run.energy.pool.current).toBeGreaterThan(start);
    expect(run.finds.length).toBe(1);
    expect(gather(run, "cache_1", rng)).toBe(run);
    run = gather(run, "cache_2", rng);
    expect(rankOf(run)).toBe("Forager");
    expect(unlocksOf(run)).toBe(1);
    expect(canSprint(run)).toBe(true);
  });

  test("the beacon wins only once the requirement holds", () => {
    const rng = seededRng("goal");
    let run = atBeacon(newRun(), true);
    expect(run.won).toBe(false);
    for (const id of ["a", "b", "c"]) run = gather(run, id, rng);
    run = atBeacon(atBeacon(run, false), true);
    expect(run.won).toBe(true);
    expect(run.taught).toContain("goal");
  });

  test("time drains the meter and refills the oldest cache", () => {
    let run = gather(newRun(), "a", seededRng("tick"));
    const before = run.energy.pool.current;
    run = advanceRun(run, 10, false, 1);
    expect(run.energy.pool.current).toBeLessThan(before);
    expect(run.emptied).toEqual([]);
    expect(run.refilled).toBe(1);
  });
});
`;

/** `src/loop.ts` for the starter loop: authored caches and beacon drive the rules. */
export const starterLoopTs = `import { gamePhase } from "@jgengine/core/game/gamePhase";
import { keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  collectAuthoredTriggers,
  createAuthoredTriggerRuntime,
  registerBuiltinTriggerActions,
  registerTriggerAction,
} from "@jgengine/core/scene/authoredTriggers";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createPacedSchedule } from "@jgengine/core/time/pacedSchedule";
import { authoredEntitySpawns } from "@jgengine/core/world/authoredEntities";
import { authoredSpawnPosition } from "@jgengine/core/world/authoredSpawn";
import { defineStore, defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { advanceRun, atBeacon, canSprint, gather, newRun, REFILL, teach, type RunState } from "./game/rules";

// Caches and the beacon are authored in the editor (F2+E): select a marker, then Triggers. A marker
// with "interact -> gather" is a cache; one with "enter/exit -> beacon" is the goal.
registerBuiltinTriggerActions();
registerTriggerAction({ id: "gather", label: "Gather (cache)", schema: { fields: [] }, targets: ["marker"], events: ["interact"] });
registerTriggerAction({ id: "beacon", label: "Beacon (goal)", schema: { fields: [] }, targets: ["marker"], events: ["enter", "exit"] });

/** The run: plain JSON in the game store, so it saves, replays and restores with the world. */
export const run = defineStore<RunState>("run", newRun);

const ORIGIN: [number, number, number] = [0, 0, 0];
const SPAWN = authoredSpawnPosition(editorLayers) ?? ORIGIN;
/** How far from the spawn counts as having learned to walk. */
const WALKED = 4;

/** An authored site: a cache or the beacon, where the editor put it. */
export interface Site {
  id: string;
  kind: "cache" | "beacon";
  x: number;
  z: number;
}

/** The scene's caches and beacon, read once from the authored triggers. */
export const sites: readonly Site[] = collectAuthoredTriggers(editorLayers).flatMap((trigger): Site[] => {
  if (trigger.sourceKind !== "marker" || (trigger.action !== "gather" && trigger.action !== "beacon")) return [];
  if (trigger.action === "beacon" && trigger.on === "exit") return [];
  const marker = editorLayers.markers.find((entry) => entry.id === trigger.sourceId);
  if (marker === undefined) return [];
  return [{ id: trigger.sourceId, kind: trigger.action === "gather" ? "cache" : "beacon", x: marker.position.x, z: marker.position.z }];
});

/** "Press E" over every cache that still has something in it. */
export function cachePrompts(ctx: GameContext): PositionedPrompt[] {
  const emptied = run.read(ctx).emptied;
  return sites
    .filter((site) => site.kind === "cache" && !emptied.includes(site.id))
    .map((site) => ({ id: site.id, position: { x: site.x, z: site.z }, prompt: proximityPrompt({ radius: 2.5, display: keybind("interact", "Gather") }) }));
}

/** The sprint gate the walk controller asks each frame Shift is held. */
export function sprintAllowed(ctx: GameContext): boolean {
  return canSprint(run.read(ctx));
}

/** Per world: the trigger runtime over the authored scene, and the refill schedule. */
const live = perContext((ctx) => ({
  triggers: createAuthoredTriggerRuntime({
    document: editorLayers,
    handlers: {
      gather: (event) => run.update(ctx, (state) => gather(state, event.sourceId, ctx.rng)),
      beacon: (event) => run.update(ctx, (state) => atBeacon(state, event.on === "enter")),
    },
  }),
  refill: createPacedSchedule(REFILL, ctx.rng),
  /** The schedule state last written to the store; a load or a new game writes another, which is restored. */
  written: null as RunState["refill"] | null,
}));

export const systems = [
  defineSystem({
    id: "starter-loop",
    tick: { type: "frame" },
    create(ctx) {
      for (const spawn of authoredEntitySpawns(editorLayers)) {
        ctx.scene.entity.spawn(spawn.catalogId, { id: spawn.markerId, position: spawn.position });
      }
    },
    update(ctx, dt) {
      if (gamePhase(ctx) !== "playing") return;
      const player = ctx.scene.entity.get(ctx.player.userId);
      if (player === null) return;
      const world = live(ctx);
      world.triggers.step({
        actors: [{ id: ctx.player.userId, position: player.position }],
        interact: ctx.input.justPressed("interact") ? [ctx.player.userId] : [],
      });
      const state = run.read(ctx);
      if (state.refill !== world.written) world.refill.restore(state.refill);
      const due = world.refill.due(state.playSeconds + dt).length;
      let next = advanceRun(state, dt, ctx.input.isDown("sprint"), due);
      if (due > 0) next = { ...next, refill: world.refill.snapshot() };
      if (Math.hypot(player.position[0] - SPAWN[0], player.position[2] - SPAWN[2]) > WALKED) next = teach(next, "walk");
      world.written = next.refill;
      run.write(ctx, next);
    },
  }),
];

/** @internal */
export function onNewPlayer(ctx: GameContext): void {
  // Spawns at the scene's authored player_spawn marker; move it in the editor (F2+E), not here.
  ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: SPAWN });
}
`;

/** `src/game/probe.ts`: what the from-zero proof, `games-depth` and `drive --playtest` read. */
export const starterProbeTs = `import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { run, sites } from "../loop";
import { canSprint, FINDS, GOAL_GATHERED, RANK_LADDER, unlocksOf } from "./rules";

const round = (value: number, places = 1): number => Math.round(value * 10 ** places) / 10 ** places;

/**
 * The game's readings. \`taught\` and \`unlocks\` every game reports; \`findsSeen\`/\`findsTotal\` is the one
 * content kind; the rest are each system's reading (meter, verb, ladder, goal, schedule) and where the
 * next target is, so a flow can walk there through real input.
 */
export function probe(ctx: GameContext) {
  const state = run.read(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  const x = me?.position[0] ?? 0;
  const z = me?.position[2] ?? 0;
  const wantBeacon = state.gathered >= GOAL_GATHERED;
  let target: { x: number; z: number; kind: number } | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const site of sites) {
    if (wantBeacon ? site.kind !== "beacon" : site.kind !== "cache" || state.emptied.includes(site.id)) continue;
    const distance = Math.hypot(site.x - x, site.z - z);
    if (distance < best) {
      best = distance;
      target = { x: site.x, z: site.z, kind: site.kind === "cache" ? 0 : 1 };
    }
  }
  return {
    taught: state.taught.length,
    unlocks: unlocksOf(state),
    findsSeen: state.finds.length,
    findsTotal: FINDS.length,
    energy: round(state.energy.pool.current),
    gathered: state.gathered,
    rank: RANK_LADDER.filter((rank) => state.gathered >= rank.at).length,
    goal: state.won ? 1 : 0,
    refilled: state.refilled,
    sprintReady: canSprint(state) ? 1 : 0,
    playSeconds: round(state.playSeconds),
    playerX: round(x),
    playerZ: round(z),
    targetKind: target?.kind ?? -1,
    targetX: round(target?.x ?? 0),
    targetZ: round(target?.z ?? 0),
    targetDist: target === null ? -1 : round(best),
  };
}
`;

/** `src/game/ui/kit.ts`: the game's own UI language, reshaped from a built-in kit. */
export const starterKitTs = `import { customizeKit } from "@jgengine/core/ui/kit/uiKit.view";
import { UI_KITS } from "@jgengine/core/ui/kit/uiKits.view";

// The look of every menu, pane and HUD part. Pick the base kit and fonts from src/art-direction.md;
// the tokens below are this game's, not the kit's defaults.
export const kit = customizeKit(UI_KITS.parchment, {
  tokens: {
    accent: "#d9822b",
    accentInk: "#1d1306",
    fontDisplay: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
    fontBody: '"Avenir Next", "Segoe UI", system-ui, sans-serif',
  },
});
`;

/** `src/game/credits.ts`: the credits document is the \`credits\` field of \`jgengine.json\`. */
export const starterCreditsTs = `import type { CreditsDocument } from "@jgengine/core/menu/credits";

import project from "../../jgengine.json";

/** Who made this game and what it uses. Edit the \`credits\` field of jgengine.json; menus read it from here. */
export const credits: CreditsDocument = project.credits;
`;

/** `src/game/ui/GameUI.tsx`: the main menu, pause menu and play HUD, all engine parts in the game's kit. */
export const starterGameUiTsx = (id: string, name: string) => `import { HudSlots } from "@jgengine/core/hud/hudLayout.view";
import { KitHint, KitVitals } from "@jgengine/core/hud/kitHud.view";
import { GameFlowUI, type GameFlowMenuContent } from "@jgengine/core/menu/gameFlowMenus.view";
import { useGameStore } from "@jgengine/react/hooks";

import { run } from "../../loop";
import { credits } from "../credits";
import { ENERGY, GOAL_GATHERED, rankOf } from "../rules";

// The title (New game, Continue, Controls, Settings, Credits), the pause menu and the HUD. The menus
// are the engine's, drawn in this game's kit (./kit.ts); the words are this game's.
const MENU: GameFlowMenuContent = {
  name: ${JSON.stringify(name)},
  tagline: "Milestone 1",
  pitch: "Gather three caches and light the beacon.",
  controls: [
    ["WASD", "walk"],
    ["Space", "jump"],
    ["E", "gather a cache"],
    ["Shift", "sprint, once you rank up"],
    ["Esc", "pause"],
  ],
  briefing: ["Walk to a cache and press E.", "Two caches make you a Forager: Shift sprints.", "With three, walk to the beacon."],
  credits,
};

function Hud() {
  const energy = useGameStore((ctx) => Math.round(run.read(ctx).energy.pool.current));
  const gathered = useGameStore((ctx) => run.read(ctx).gathered);
  const rank = useGameStore((ctx) => rankOf(run.read(ctx)));
  const message = useGameStore((ctx) => run.read(ctx).message);
  const won = useGameStore((ctx) => run.read(ctx).won);
  return (
    <HudSlots
      storageKey=${JSON.stringify(id)}
      slots={{
        topLeft: (
          <KitVitals
            eyebrow={rank}
            title=${JSON.stringify(name)}
            vitals={[{ label: "Energy", value: energy, max: ENERGY.max, lowAt: 0.2 }]}
            objective={{ id: won ? "done" : "gather", label: "Goal", title: won ? "The beacon is lit" : "Light the beacon", goal: won ? undefined : "Caches " + Math.min(gathered, GOAL_GATHERED) + " / " + GOAL_GATHERED }}
          />
        ),
        top: <KitHint text={message} tone={won ? "good" : "accent"} />,
      }}
    />
  );
}

/** @internal */
export function GameUI() {
  return <GameFlowUI menu={MENU} hud={<Hud />} />;
}
`;

/** `proofs/flows/from-zero.flow.ts`: a new game with no save, played through real keys to the goal. */
export const starterFromZeroFlow = `import { defineFlow } from "@jgengine/core/play/flow";

import { game } from "../../src/game.config";

/** The first minute: walk to each cache, press E, then walk to the beacon. Keys and the camera only. */
const FIRST_MINUTE = 60;
const STEP_MS = 300;
const REACH = 2;

export default defineFlow(game, {
  async run(f) {
    await f.expect((p) => p.gathered === 0 && p.unlocks === 0 && p.taught === 0 && p.goal === 0, "second 0: nothing gathered, unlocked or taught");
    for (let step = 0; step < 400; step += 1) {
      const p = await f.probe();
      if (p.goal === 1 || p.playSeconds >= FIRST_MINUTE) break;
      if (p.targetDist < 0) {
        await f.wait(STEP_MS);
        continue;
      }
      if (p.targetKind === 0 && p.targetDist <= REACH) {
        await f.press("KeyE");
        continue;
      }
      await f.heading(Math.atan2(p.targetX - p.playerX, p.targetZ - p.playerZ));
      await f.hold(p.sprintReady === 1 ? ["ShiftLeft", "KeyW"] : ["KeyW"], { ms: p.targetDist > 5 ? STEP_MS : 100 });
    }
    await f.expect((p) => p.unlocks >= 1 && p.findsSeen >= 1, "unlocked: ranked up to Forager, which opens sprinting");
    await f.expect((p) => p.goal === 1 && p.playSeconds <= FIRST_MINUTE, "the goal: three caches gathered and the beacon reached inside the first minute");
  },
});
`;

/** `proofs/flows/from-zero.flow.ts` for a game without the starter loop: boots and walks. */
export const walkFromZeroFlow = `import { defineFlow } from "@jgengine/core/play/flow";

import { game } from "../../src/game.config";

/** A new game with no save: the player walks forward through real keys. Grow this with milestone 1. */
export default defineFlow(game, {
  async run(f) {
    const start = await f.probe();
    await f.hold(["KeyW"], { ms: 3000 });
    await f.expect((p) => Math.hypot(p.playerX - start.playerX, p.playerZ - start.playerZ) > 2, "the player walked from the spawn");
  },
});
`;

/** `src/game/probe.ts` for a game without the starter loop. */
export const walkProbeTs = `import type { GameContext } from "@jgengine/core/runtime/gameContext";

/** The game's readings: add \`taught\`, \`unlocks\`, each content kind's Seen/Total and each system's reading as they land. */
export function probe(ctx: GameContext) {
  const me = ctx.scene.entity.get(ctx.player.userId);
  return {
    taught: 0,
    unlocks: 0,
    playerX: Math.round((me?.position[0] ?? 0) * 10) / 10,
    playerZ: Math.round((me?.position[2] ?? 0) * 10) / 10,
  };
}
`;

/** `perf-budget.json`: the ceilings `bun run perf` holds the game to; tighten them once a baseline is measured. */
export const perfBudgetJson = `${JSON.stringify(
  {
    drawsFrame: 400,
    triangles: 1500000,
    nodes: 6000,
    programsLinked: 12,
    baseline: "scaffold default; replace with a measured baseline from bun run perf <game> --seconds 6",
  },
  null,
  2,
)}
`;

const TEMPLATE_LOOK: Record<StarterGameOptions["template"], string> = {
  "3d": "a 3D world: authored terrain, sky, a rigged player model, third-person camera",
  builder: "a shared 3D world players build in together",
  "2d": "a 2D board drawn by the HUD, no 3D scene",
};

/** `PLAN.md`: direction, features, gaps and milestones from the create call; the brief waits for milestone 1. */
/** The line `check games-design` accepts in place of a brief while milestone 1 is unticked. */
const PENDING_BRIEF = "Pending: written once milestone 1 plays, from what building it taught.";

export function planMd(options: StarterGameOptions): string {
  const brief = options.brief?.trim();
  const features = options.loop
    ? [
        "- Main menu, pause, settings and credits — `@jgengine/core/menu/gameFlowMenus.view` (`GameFlowUI`), `@jgengine/core/game/gameFlow`",
        "- Walk on authored terrain — `@jgengine/core/world/features`, `editor.scene.json`",
        "- Interact verb (gather) — `@jgengine/core/scene/authoredTriggers`, `@jgengine/core/interaction/proximityPrompt`",
        "- Energy meter — `@jgengine/core/stats/statPool`",
        "- Rank ladder and the sprint unlock — `@jgengine/core/threshold/thresholds`",
        "- Goal requirement — `@jgengine/core/rules/predicate`",
        "- Finds table — `@jgengine/core/random/pick`",
        "- Cache refills — `@jgengine/core/time/pacedSchedule`",
        "- HUD — `@jgengine/core/hud/kitHud.view`, `@jgengine/core/hud/hudLayout.view` (`HudSlots`)",
      ]
    : [
        "- Main menu, pause, settings and credits — `@jgengine/core/menu/gameFlowMenus.view` (`GameFlowUI`)",
        options.template === "2d" ? "- Board — `src/game/board.ts`" : "- Walk in the world — `@jgengine/core/world/features`",
      ];
  return `# ${options.name} plan

Brief: ${brief === undefined || brief === "" ? "TODO: the user's words for the game." : brief}

## Direction

- Template: ${TEMPLATE_LOOK[options.template]}${options.template === "2d" ? "" : `; ${options.ground} ground; player model ${options.player ?? "human/man-casual"}`}.
- References: TODO, the games it is like and what to take from each.
- Faithfulness, breadth, length and what is out: TODO, agreed with the user before milestone 2.
- Done scenario: TODO, one observable scenario that proves the game.

## Design brief

${PENDING_BRIEF}

## Features

${features.join("\n")}

## Gaps

- none

## Milestones

- [ ] 1. The core loop plays from second 0: ${options.loop ? "walk to a cache, gather it, rank up, sprint, light the beacon" : "the first verb works from a new game"}; \`proofs/flows/from-zero.flow.ts\` reaches the goal.
- [ ] 2. The next 10 minutes: write the design brief from what milestone 1 taught, then build its first beats.
`;
}

/** `README.md`: the design checklist `check games-design` reads, and the loop proof line. */
export function readmeMd(options: StarterGameOptions): string {
  return `# ${escapeHtml(options.name)}

${options.brief?.trim() || "A JGengine game."} The build plan is [PLAN.md](PLAN.md).

## Design checklist

**Core loop.** ${options.loop ? "Walk to a cache, press E to gather it, and spend the energy it gives on the way to the next." : "TODO: the 30-second action."}

**Progression.** ${options.loop ? "Caches climb the rank ladder; Forager unlocks sprinting. Three caches and the beacon finish milestone 1." : "TODO: what the player gets over hours."}

**Failure states.** ${options.loop ? "Energy drains with time and sprinting; at zero, sprinting stops." : "TODO."}

**Minute 5 -> hour 5.** TODO: written with the design brief once milestone 1 plays.

**References.** TODO: the games it is like.

Loop proof: from-zero
`;
}
