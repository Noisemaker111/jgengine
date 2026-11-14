import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { tickTowers } from "./combat/towerAI";
import { keep, runEnded } from "./keep";
import { session } from "./session";
import { sendWave, tickWaves } from "./waves/director";
import { AUTHORED_WAVES, TOTAL_WAVES } from "./waves/manifest";

/** What a staged defense should look like when the capture takes it. */
export type StageMode = "midwave" | "boss" | "result" | "breached";

/** One simulation step for a staged run - 30 Hz, the same cadence the frame loop asks for. */
const STEP = 1 / 30;

/** How much game time one staged run may simulate before it gives up (guards a hung state). */
const MAX_STAGED_SECONDS = 900;

/**
 * Run the day's own three systems for `seconds` of game time without waiting for a frame. A staged
 * state is the real fight advanced quickly, never a scene assembled by hand: the wave director
 * spawns and rolls the tech, the town's world clocks the workers in, worker AI works (or doomscrolls),
 * and leaks, kills, cash and the result all come out of those systems.
 */
function advance(ctx: GameContext, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    tickWaves(ctx, STEP);
    keep.system.update?.(ctx, STEP);
    tickTowers(ctx, STEP);
    if (runEnded(keep.of(ctx))) return;
  }
}

/** Open the authored server-room wave and roll it until the server rack is on the street. */
function stageBossWave(ctx: GameContext): void {
  session.encounter.openWave(AUTHORED_WAVES.length - 1, session.pressure);
  keep.of(ctx).set("keep.wave_started", true);
  keep.of(ctx).set("keep.wave_ready", false);
  keep.of(ctx).set("keep.wave", session.encounter.view().wave);
  advance(ctx, 11);
  const boss = session.boss;
  if (boss === null) return;
  const health = ctx.scene.entity.stats.get(boss.instanceId, "health");
  if (health === null || health.max <= 0) return;
  // Put the server rack under its second cut point so the next simulated tick runs the real
  // `advancePhase` transition and raises its tell, rather than photographing a phase banner.
  ctx.scene.entity.stats.set(boss.instanceId, "health", { current: Math.round(health.max * 0.55) });
  advance(ctx, STEP * 2);
}

/** The staffed street a capture shows: a mixed crew hired through the town's own `beacon.place`. */
const STAGED_CREW: readonly [string, string][] = [
  ["plot-5", "worker_barista"],
  ["plot-4", "worker_plumber"],
  ["plot-10", "worker_farmer"],
  ["plot-6", "worker_electrician"],
  ["plot-8", "worker_teacher"],
  ["plot-3", "worker_grandma"],
  ["plot-7", "worker_librarian"],
  ["plot-2", "worker_construction"],
  ["plot-11", "worker_lawyer"],
];

function hireCrew(ctx: GameContext): void {
  const world = keep.of(ctx);
  world.set("keep.gold", 5000);
  for (const [slot, kind] of STAGED_CREW) ctx.game.commands.run("beacon.place", { kind, slot });
  advance(ctx, 4);
  world.set("keep.gold", 180);
}

/** A staffed street with the surveillance wave rolling through it: notifications, a camera, drones. */
function stageMidwave(ctx: GameContext): void {
  hireCrew(ctx);
  session.encounter.openWave(3, session.pressure);
  keep.of(ctx).set("keep.wave_started", true);
  keep.of(ctx).set("keep.wave_ready", false);
  keep.of(ctx).set("keep.wave", session.encounter.view().wave);
  advance(ctx, 13);
}

/** Release each wave only once the street is clear, so the run is a defense and not a wave rush. */
function playOutDefense(ctx: GameContext): void {
  for (let elapsed = 0; elapsed < MAX_STAGED_SECONDS; elapsed += 1) {
    const world = keep.of(ctx);
    if (runEnded(world)) return;
    if (world.fact("keep.wave_ready") === true && session.creeps.size === 0 && !session.encounter.view().done) sendWave(ctx);
    advance(ctx, 1);
  }
}

/** Let the first wave roll into an empty town, holding the clock, so focus is lost and the street clears. */
function stageBreach(ctx: GameContext): void {
  sendWave(ctx);
  for (let elapsed = 0; elapsed < MAX_STAGED_SECONDS; elapsed += 1) {
    session.countdown.disarm();
    advance(ctx, 1);
    const world = keep.of(ctx);
    if (world.fact("keep.field_clear") === true || runEnded(world)) return;
  }
}

export function stageRun(ctx: GameContext, mode: StageMode): void {
  if (mode === "breached") {
    stageBreach(ctx);
    return;
  }
  if (mode === "boss") {
    stageBossWave(ctx);
    return;
  }
  if (mode === "result") {
    playOutDefense(ctx);
    return;
  }
  stageMidwave(ctx);
}

/**
 * Dev-only capture staging for the states that need real play to reach: a wave on a staffed street,
 * the server rack mid-phase, and a finished day with its end-of-day card. Never registered in a
 * production build; each state is a command sequence, so a lane jumps here instead of playing.
 */
export function registerCaptureCommands(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  ctx.game.commands.define<{ mode?: StageMode }>("run.stage", {
    apply(state, input) {
      stageRun(state, input.mode ?? "midwave");
      return state;
    },
  });
}
