import { defineSystem } from "@jgengine/core/game/defineSystem";
import type { OnboardingConfig, OnboardingStep } from "@jgengine/core/onboarding/onboarding";
import { createOnboardingSystem, onboardingOf } from "@jgengine/core/onboarding/onboardingSystem";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { WorldModel } from "@jgengine/core/worldModel/worldModel";

import { BUILDABLES } from "./objects/catalog";
import { park, researched } from "./park";
import { FIRST_SCENARIO } from "./scenarios";

/**
 * The first scenario's hints on the engine's onboarding: blended steps (no banners, no locks), each
 * done when the park's world says so, run in order by `createOnboardingSystem`. The park adds where
 * each step points: the HUD controls to ring by hint key (first one on screen wins; `ui/hintRing.ts`) and a spot on the lot for
 * the world arrow, since a park has no walking player for the engine's own pointer.
 */

const BUILD = "hud:build";
const RESEARCH_IDS = Object.values(BUILDABLES).filter((def) => def.research !== undefined).map((def) => def.id);
/** The plaza inside the gate has two path cells; anything past that is the player's. */
const PLAZA_PATHS = 2;

const firstRide = (w: WorldModel): readonly [number, number] | null => w.instances("ride").find((ride) => ride.position !== null)?.position ?? null;
const when = (done: (w: WorldModel) => boolean): OnboardingStep<GameContext>["done"] => ({ when: (ctx) => done(park.of(ctx)) });

export const PARK_HINTS: OnboardingConfig<GameContext> = {
  id: "hauntworks-first-night",
  title: "The first night",
  style: "blended",
  steps: [
    {
      id: "path",
      text: "Lay a path in from the gate: pick Cobbled Path, then click the ground just past the gate plaza.",
      anchor: "item:path_walk",
      done: when((w) => w.num("n.path_walk") > PLAZA_PATHS || w.num("park.rides") > 0),
    },
    {
      id: "ride",
      text: "Build your first ride beside the path: pick the Upside-Down Carousel and click a glowing spot next to the path.",
      anchor: "item:ride_carousel",
      done: when((w) => w.num("park.rides") > 0),
    },
    {
      id: "connect",
      text: "Click the new ride, then Connect it: a ride needs an entrance and an exit on the path.",
      anchor: "inspector:connect",
      done: when((w) => w.num("park.rides_open") > 0 || w.fact("park.gate") === true),
    },
    {
      id: "gate",
      text: "The ride is running. Unchain the gate: at dusk the first of the living will wander in.",
      anchor: "hud:gate",
      done: when((w) => w.fact("park.gate") === true),
    },
    {
      id: "scare",
      text: "Line the path with a scare: pick Scares and drop a Jack-in-the-Coffin beside it. Scares close together chain - and a ghost child loves that toy.",
      anchor: "item:prop_coffin",
      done: when((w) => w.num("park.props") > 0),
    },
    {
      id: "research",
      text: "The séance table channels new rides, scares and stalls. Open Séance and start the Grave-Dirt Sundaes: it takes about a minute.",
      anchor: "research:stall_icecream",
      done: when((w) => w.orders("lab").length > 0 || RESEARCH_IDS.some((id) => w.fact(researched(id)) === true)),
    },
    {
      id: "ghosts",
      text: "Open Ghosts to see who might move in. The Victorian Child wants the carousel and a toy: give her both, keep the night running and she comes.",
      anchor: "hud:ghosts",
      done: when((w) => w.num("park.ghosts") > 0),
    },
    {
      id: "mechanic",
      text: "Rides wear out and seize up, and only a Gremlin Tinker un-jams them. Bind one from Spooks before the first jam.",
      anchor: "item:staff_mechanic",
      done: when((w) => w.num("n.staff_mechanic") > 0),
    },
  ],
};

/** Where each step points beyond its anchor: the controls that lead to it, and a spot on the lot. */
const POINTS: Readonly<Record<string, { ui: readonly string[]; world?: (w: WorldModel) => readonly [number, number] | null }>> = {
  path: { ui: ["category:path", BUILD], world: () => [0, 46] },
  ride: { ui: ["category:ride", BUILD] },
  connect: { ui: [], world: firstRide },
  gate: { ui: [] },
  scare: { ui: ["category:prop", BUILD] },
  ghosts: { ui: [] },
  research: { ui: ["hud:lab"] },
  mechanic: { ui: ["category:staff", BUILD] },
};

/** The hints as a game system: installed with the park's. */
export const parkHints = createOnboardingSystem(PARK_HINTS);

/**
 * A park is built with the clock paused, but the engine checks steps only on a game-time tick. While
 * paused, check them on each change instead. Blended steps have no grants or banners, so checking the
 * run directly finishes them exactly as the tick would.
 */
export const parkHintsWhilePaused = defineSystem({
  id: "park-hints-paused",
  dependsOn: ["onboarding"],
  start(ctx) {
    let checking = false;
    ctx.subscribe(() => {
      if (checking || !ctx.time.isPaused()) return;
      checking = true;
      try { onboardingOf(ctx)?.run().evaluate(ctx, ctx.player.userId); } finally { checking = false; }
    });
  },
});

/** The hint shown now. */
export interface ParkHintView {
  id: string;
  text: string;
  /** HUD elements to ring, first one on screen wins: the exact control, then the panel that opens it. */
  ui: readonly string[];
  /** The spot on the lot (x, z) the world arrow stands over, or `null`. */
  world: readonly [number, number] | null;
}

/** The hint to show now: only while the first scenario runs, the engine's current step. */
export function currentHint(ctx: GameContext): ParkHintView | null {
  const w = park.of(ctx);
  if (w.fact("scenario.id") !== FIRST_SCENARIO || w.fact("scenario.result") !== "") return null;
  const step = onboardingOf(ctx)?.run().current()?.step;
  if (step === undefined) return null;
  const points = POINTS[step.id];
  return { id: step.id, text: step.text, ui: [...(step.anchor === undefined ? [] : [step.anchor]), ...(points?.ui ?? [])], world: points?.world?.(w) ?? null };
}

/** Hints the player has done this park. */
export function hintsTaught(ctx: GameContext): number {
  const run = onboardingOf(ctx)?.run();
  return run === undefined ? 0 : PARK_HINTS.steps.filter((step) => run.isDone(step.id)).length;
}

/** A new scenario teaches from the first step again. */
export function restartHints(ctx: GameContext): void {
  onboardingOf(ctx)?.run().reset();
}
