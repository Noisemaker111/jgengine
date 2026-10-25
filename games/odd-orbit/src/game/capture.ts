import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { simulateHousehold } from "./sim/simulate";
import { householdStore } from "./session/store";
import { DAY_LENGTH } from "../world";

/** What a staged household should look like when the capture takes it. */
export type StageMode = "shift" | "week" | "transmission" | "review";

/** The half-second step the household sim is written for; `simulateHousehold` clamps longer frames. */
const STEP = 0.25;

/**
 * Run the habitat forward until somebody is actually at a station on paid work, bounded. The
 * households satisfy a need or walk to their post first, so a fixed second count lands after the
 * shift instead of during it; stepping until the station is occupied is the same morning, seen at
 * the moment the shot wants.
 */
function advanceToShift(ctx: GameContext, maxSeconds: number): void {
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += STEP) {
    ctx.time.advance(STEP);
    simulateHousehold(ctx, STEP);
    if (stageReadout(ctx).working > 0) return;
  }
}

/**
 * Dev-only staging for the played household. `shift` stops at the moment somebody is at a station
 * on paid work; `week` runs the same simulation four days on, which is where mastery tiers and
 * promotion rungs move and where the roster stops looking like a fresh household; `transmission`
 * stops when the first transmission waits on an answer; `review` runs to the first term's review. Play reaches
 * both by starting a household and waiting; `shoot --state mid-shift|mid-week` jumps here instead.
 */
export function stageHousehold(ctx: GameContext, mode: StageMode = "shift"): void {
  if (mode === "week") {
    advanceFor(ctx, DAY_LENGTH * 3);
    return;
  }
  if (mode === "transmission") {
    for (let elapsed = 0; elapsed < DAY_LENGTH * 3 && householdStore.read(ctx).incident == null; elapsed += STEP) advanceFor(ctx, STEP);
    return;
  }
  if (mode === "review") {
    for (let elapsed = 0; elapsed < DAY_LENGTH * 6 && householdStore.read(ctx).charter?.review == null; elapsed += STEP) advanceFor(ctx, STEP);
    return;
  }
  advanceToShift(ctx, 180);
}

/** Step the household for a fixed span, at the cadence the sim is written for. */
function advanceFor(ctx: GameContext, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    ctx.time.advance(STEP);
    simulateHousehold(ctx, STEP);
  }
}

export function stageReadout(ctx: GameContext): { working: number; walking: number; shifts: number; day: number } {
  const state = householdStore.read(ctx);
  let working = 0;
  let walking = 0;
  let shifts = 0;
  for (const id of state.order) {
    const member = state.members[id];
    if (member === undefined) continue;
    if (member.action.kind === "use" && member.action.goal === "work") working += 1;
    if (member.action.kind === "seek" && member.action.goal === "work") walking += 1;
    if (member.workToday > 0) shifts += 1;
  }
  return { working, walking, shifts, day: state.day };
}

/**
 * Dev-only capture staging for a household already in its shift block. Play reaches the same
 * morning by starting a household and letting the clock run.
 */
export function registerCaptureCommands(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  ctx.game.commands.define<{ mode?: StageMode }>("household.stage", {
    apply(state, input) {
      stageHousehold(state, input.mode ?? "shift");
      return state;
    },
  });
}
