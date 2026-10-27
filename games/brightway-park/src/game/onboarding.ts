import type { WorldModel } from "@jgengine/core/worldModel/worldModel";

import { FIRST_SCENARIO } from "./scenarios";

/**
 * The first scenario's hints as content: each step says what to do, points at where (a spot on the
 * lot, a button on the HUD, or both), and is done when the world says so. The first step not done
 * whose `when` holds is the one shown. The HUD card and the world arrow only read `currentHint`.
 */

export interface HintStep {
  id: string;
  text: string;
  /** HUD elements to ring, first one on screen wins: the exact control, then the panel that opens it. */
  ui: readonly string[];
  /** A spot on the lot (x, z) to point an arrow at, or a function that finds one in the world. */
  world?: (w: WorldModel) => readonly [number, number] | null;
  /** Shown only while this holds; default always. */
  when?: (w: WorldModel) => boolean;
  done: (w: WorldModel) => boolean;
}

const BUILD = "[data-hint=build]";
/** The plaza inside the gate has two path cells; anything past that is the player's. */
const PLAZA_PATHS = 2;

const firstRide = (w: WorldModel): readonly [number, number] | null => w.instances("ride").find((ride) => ride.position !== null)?.position ?? null;

export const HINT_STEPS: readonly HintStep[] = [
  {
    id: "mechanic",
    text: "A ride has broken down. It stays down until a mechanic fixes it: hire one from Staff.",
    ui: ["[data-build-item=staff_mechanic]", "[data-build-category=staff]", BUILD],
    when: (w) => w.num("park.breakdowns") > 0,
    done: (w) => w.num("n.staff_mechanic") > 0,
  },
  {
    id: "path",
    text: "Lay a path in from the gate: pick Path, then click the ground just past the gate plaza.",
    ui: ["[data-build-item=path_walk]", "[data-build-category=path]", BUILD],
    world: () => [0, 46],
    done: (w) => w.num("n.path_walk") > PLAZA_PATHS || w.num("park.rides") > 0,
  },
  {
    id: "ride",
    text: "Build your first ride beside the path: pick the Carousel and click a green spot next to the path.",
    ui: ["[data-build-item=ride_carousel]", "[data-build-category=ride]", BUILD],
    done: (w) => w.num("park.rides") > 0,
  },
  {
    id: "connect",
    text: "Click the new ride, then Connect it: a ride needs an entrance and an exit on the path.",
    ui: ["[data-hint=connect]"],
    world: firstRide,
    done: (w) => w.num("park.rides_open") > 0 || w.fact("park.gate") === true,
  },
  {
    id: "gate",
    text: "The ride is running. Open the gate and the first guests will come in.",
    ui: ["[data-hint=gate]"],
    done: (w) => w.fact("park.gate") === true,
  },
];

/** The hint to show now: only in the first scenario, the first step not done whose `when` holds. */
export function currentHint(w: WorldModel): HintStep | null {
  if (w.fact("scenario.id") !== FIRST_SCENARIO || w.fact("scenario.result") !== "") return null;
  return HINT_STEPS.find((step) => (step.when === undefined || step.when(w)) && !step.done(w)) ?? null;
}
