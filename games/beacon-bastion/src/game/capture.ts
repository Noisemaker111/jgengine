import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { tickTowers } from "./combat/towerAI";
import { keep, runEnded } from "./keep";
import { session } from "./session";
import { sendWave, tickWaves } from "./waves/director";
import { AUTHORED_WAVES, TOTAL_WAVES } from "./waves/manifest";

/** What a staged defense should look like when the capture takes it. */
export type StageMode = "midwave" | "boss" | "result";

/** One simulation step for a staged run - 30 Hz, the same cadence the frame loop asks for. */
const STEP = 1 / 30;

/** How much game time one staged run may simulate before it gives up (guards a hung state). */
const MAX_STAGED_SECONDS = 900;

/**
 * Run the defense's own three systems for `seconds` of game time without waiting for a
 * frame. A staged state is the real fight advanced quickly, never a scene assembled by hand:
 * the wave director spawns and walks the raiders, the keep's world raises the towers, tower AI
 * shoots, and leaks, kills, gold and the result all come out of those systems.
 */
function advance(ctx: GameContext, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    tickWaves(ctx, STEP);
    keep.system.update?.(ctx, STEP);
    tickTowers(ctx, STEP);
    if (runEnded(keep.of(ctx))) return;
  }
}

/** Open the authored Warden wave and walk it until the boss is on the field. */
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
  // Put the Warden under its second threshold so the next simulated tick runs the real
  // `advanceBoss` transition and raises its tell, rather than photographing a phase banner.
  ctx.scene.entity.stats.set(boss.instanceId, "health", { current: Math.round(health.max * 0.55) });
  advance(ctx, STEP * 2);
}

/** Release each assault only once the field is clear, so the run is a defense and not a wave rush. */
function playOutDefense(ctx: GameContext): void {
  for (let elapsed = 0; elapsed < MAX_STAGED_SECONDS; elapsed += 1) {
    const world = keep.of(ctx);
    if (runEnded(world)) return;
    if (world.fact("keep.wave_ready") === true && session.creeps.size === 0 && !session.encounter.view().done) sendWave(ctx);
    advance(ctx, 1);
  }
}

export function stageRun(ctx: GameContext, mode: StageMode): void {
  if (mode === "boss") {
    stageBossWave(ctx);
    return;
  }
  if (mode === "result") {
    playOutDefense(ctx);
    return;
  }
  sendWave(ctx);
  advance(ctx, 12);
}

/**
 * Dev-only capture staging for the states that need real play to reach: a wave on the field,
 * the Warden mid-phase, and a finished defense with its result card. Never registered in a
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
