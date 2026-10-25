import { evaluateSkillCheck, type SkillCheckConfig } from "@jgengine/core/interaction/skillCheck";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createSessionLoop, type SessionLoop } from "@jgengine/core/run/sessionLoop";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import type { FishWord } from "./kindShape";
import { fishingSpots } from "./places";
import { fact, farm, stageOf } from "./spec";

/**
 * Each cast is one session on the engine's session loop: casting opens it with the fish the loop drew
 * from the authored table (rarer fish only after enough catches), the bite is the engine's timing-bar
 * skill check, and reeling settles it. This file only times the bite and says what happened.
 */

/** Seconds the green zone stays catchable once a fish bites. */
const BITE_WINDOW = 4;
/** Walk this far from the spot and the line goes slack. */
const LINE_REACH = 5;

interface Cast {
  spot: string;
  castAt: number;
  biteAt: number;
  check: SkillCheckConfig;
}

interface Angler {
  loop: SessionLoop<FishWord, { caught: boolean }, FishWord | null>;
  cast: Cast | null;
  /** The last catch, for the HUD's splash. */
  landed: { label: string; at: number } | null;
}

export const angler = perContext(
  (ctx: GameContext): Angler => ({
    loop: createSessionLoop<FishWord, { caught: boolean }, FishWord | null>({
      kind: "cast",
      carries: false,
      seed: `${idea.id}-fish`,
      offers: idea.fish.map((fish) => ({ id: fish.id, value: fish, weight: fish.weight, after: fish.after })),
      settle: ({ input }) => (input.caught ? land(ctx) : null),
    }),
    cast: null,
    landed: null,
  }),
);

/** The settle rule: a landed fish goes in the bag. */
function land(ctx: GameContext): FishWord | null {
  const fish = angler(ctx).loop.offer().option;
  if (fish === null) return null;
  farm.of(ctx).change({ [fact(fish.id)]: 1, [fact("caught")]: 1 });
  return fish;
}

export type FishingState = "idle" | "waiting" | "bite";

/** Read off the session loop and the clock: no cast, a line in the water, or a fish on. */
export function fishingState(ctx: GameContext): FishingState {
  const state = angler(ctx);
  if (state.loop.phase() !== "open" || state.cast === null) return "idle";
  return ctx.time.now() < state.cast.biteAt ? "waiting" : "bite";
}

/** The rod widens the green and shortens the wait; the fish on the line decides how much the green slides. */
function checkFor(ctx: GameContext, fish: FishWord | null, random: () => number): SkillCheckConfig {
  const rod = stageOf(ctx, "rod");
  const width = Math.min(0.5, 0.2 + (rod - 1) * 0.07);
  const start = 0.08 + random() * (0.84 - width);
  return { trackWidth: 1, zone: { start, end: start + width }, markerPeriod: 1.5, window: BITE_WINDOW, zoneDriftPerSecond: fish?.drift ?? 0 };
}

function close(ctx: GameContext, caught: boolean, message: string | null): void {
  const state = angler(ctx);
  const fish = state.loop.settle({ caught }).result;
  state.cast = null;
  if (fish !== null) {
    state.landed = { label: fish.label, at: ctx.time.now() };
    ctx.game.notices.push({ text: `Caught a ${fish.label.toLowerCase()}! (sells for ${fish.price})`, tone: "success" });
  } else if (message !== null) ctx.game.notices.push({ text: message, tone: "warn" });
}

/** E at the water: cast when the line is out of the water, reel when it is in. */
export function fish(ctx: GameContext, spotId: string): void {
  const state = angler(ctx);
  const phase = fishingState(ctx);
  if (phase === "idle") {
    const offer = state.loop.start();
    const random = seededRng(`${idea.id}-cast-${offer.session}`);
    const rod = stageOf(ctx, "rod");
    const wait = (1.6 + random() * 3.2) * (1 - (rod - 1) * 0.15);
    state.cast = { spot: spotId, castAt: ctx.time.now(), biteAt: ctx.time.now() + wait, check: checkFor(ctx, offer.option, random) };
    return;
  }
  if (phase === "waiting") {
    close(ctx, false, "Too soon - it swam off.");
    return;
  }
  const elapsed = ctx.time.now() - state.cast!.biteAt;
  close(ctx, evaluateSkillCheck(state.cast!.check, elapsed).success, "It slipped the hook.");
}

/** Every frame while a line is out: a fish that waits too long gets away, and so does one you walk off from. */
export function tickFishing(ctx: GameContext): void {
  const state = angler(ctx);
  const cast = state.cast;
  if (cast === null || state.loop.phase() !== "open") return;
  if (ctx.time.now() - cast.biteAt > BITE_WINDOW) {
    close(ctx, false, "It got away.");
    return;
  }
  const spot = fishingSpots(editorLayers).find((entry) => entry.id === cast.spot);
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (spot !== undefined && me !== null && Math.hypot(me.position[0] - spot.x, me.position[2] - spot.z) > LINE_REACH) close(ctx, false, "Your line went slack.");
}

/** Put the rod away (sleeping, quitting): the cast ends without a fish. */
export function reelIn(ctx: GameContext): void {
  if (angler(ctx).cast !== null && angler(ctx).loop.phase() === "open") close(ctx, false, null);
}

/** What the HUD and the probe read. */
export function fishingView(ctx: GameContext) {
  const state = angler(ctx);
  const phase = fishingState(ctx);
  const cast = state.cast;
  const elapsed = cast === null ? 0 : ctx.time.now() - cast.biteAt;
  return {
    phase,
    check: phase === "bite" && cast !== null ? cast.check : null,
    biteAt: cast?.biteAt ?? 0,
    inZone: phase === "bite" && cast !== null && evaluateSkillCheck(cast.check, elapsed).success,
    landed: state.landed !== null && ctx.time.now() - state.landed.at < 3 ? state.landed.label : null,
    casts: state.loop.snapshot().session,
  };
}
