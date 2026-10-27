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
 * each step points: the HUD controls to ring (first one on screen wins) and a spot on the lot for
 * the world arrow, since a park has no walking player for the engine's own pointer.
 */

const BUILD = "[data-hint=build]";
const RESEARCH_IDS = Object.values(BUILDABLES).filter((def) => def.research !== undefined).map((def) => def.id);
/** The plaza inside the gate has two path cells; anything past that is the player's. */
const PLAZA_PATHS = 2;

const firstRide = (w: WorldModel): readonly [number, number] | null => w.instances("ride").find((ride) => ride.position !== null)?.position ?? null;
const when = (done: (w: WorldModel) => boolean): OnboardingStep<GameContext>["done"] => ({ when: (ctx) => done(park.of(ctx)) });

export const PARK_HINTS: OnboardingConfig<GameContext> = {
  id: "brightway-first-park",
  title: "Opening day",
  style: "blended",
  steps: [
    {
      id: "path",
      text: "Lay a path in from the gate: pick Path, then click the ground just past the gate plaza.",
      anchor: "[data-build-item=path_walk]",
      done: when((w) => w.num("n.path_walk") > PLAZA_PATHS || w.num("park.rides") > 0),
    },
    {
      id: "ride",
      text: "Build your first ride beside the path: pick the Carousel and click a green spot next to the path.",
      anchor: "[data-build-item=ride_carousel]",
      done: when((w) => w.num("park.rides") > 0),
    },
    {
      id: "connect",
      text: "Click the new ride, then Connect it: a ride needs an entrance and an exit on the path.",
      anchor: "[data-hint=connect]",
      done: when((w) => w.num("park.rides_open") > 0 || w.fact("park.gate") === true),
    },
    {
      id: "gate",
      text: "The ride is running. Open the gate and the first guests will come in.",
      anchor: "[data-hint=gate]",
      done: when((w) => w.fact("park.gate") === true),
    },
    {
      id: "research",
      text: "The lab opens new rides, shops and scenery. Open the Lab and start the Ice Cream Cart: it takes about a minute.",
      anchor: "[data-research=stall_icecream]",
      done: when((w) => w.orders("lab").length > 0 || RESEARCH_IDS.some((id) => w.fact(researched(id)) === true)),
    },
    {
      id: "mechanic",
      text: "Rides wear out and break down, and only a mechanic mends them. Hire one from Staff before the first breakdown.",
      anchor: "[data-build-item=staff_mechanic]",
      done: when((w) => w.num("n.staff_mechanic") > 0),
    },
  ],
};

/** Where each step points beyond its anchor: the controls that lead to it, and a spot on the lot. */
const POINTS: Readonly<Record<string, { ui: readonly string[]; world?: (w: WorldModel) => readonly [number, number] | null }>> = {
  path: { ui: ["[data-build-category=path]", BUILD], world: () => [0, 46] },
  ride: { ui: ["[data-build-category=ride]", BUILD] },
  connect: { ui: [], world: firstRide },
  gate: { ui: [] },
  research: { ui: ["[data-hint=lab]"] },
  mechanic: { ui: ["[data-build-category=staff]", BUILD] },
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
