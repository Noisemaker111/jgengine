import type { WorldModel } from "@jgengine/core/worldModel/worldModel";

import { BUILDABLES } from "./objects/catalog";
import { researched } from "./park";
import { FIRST_SCENARIO } from "./scenarios";

/**
 * The first scenario's hints as content: each step says what to do, points at where (a spot on the
 * lot, a button on the HUD, or both), and is done when the world says so. The first step not done
 * is the one shown. The HUD card and the world arrow only read `currentHint`.
 */

export interface HintStep {
  id: string;
  text: string;
  /** HUD elements to ring, first one on screen wins: the exact control, then the panel that opens it. */
  ui: readonly string[];
  /** A spot on the lot (x, z) to point an arrow at, or a function that finds one in the world. */
  world?: (w: WorldModel) => readonly [number, number] | null;
  done: (w: WorldModel) => boolean;
}

const BUILD = "[data-hint=build]";
const RESEARCH_IDS = Object.values(BUILDABLES).filter((def) => def.research !== undefined).map((def) => def.id);
/** The plaza inside the gate has two path cells; anything past that is the player's. */
const PLAZA_PATHS = 2;

const firstRide = (w: WorldModel): readonly [number, number] | null => w.instances("ride").find((ride) => ride.position !== null)?.position ?? null;

export const HINT_STEPS: readonly HintStep[] = [
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
  {
    id: "research",
    text: "The lab opens new rides, shops and scenery. Open the Lab and start the Ice Cream Cart: it takes about a minute.",
    ui: ["[data-research=stall_icecream]", "[data-hint=lab]"],
    done: (w) => w.orders("lab").length > 0 || RESEARCH_IDS.some((id) => w.fact(researched(id)) === true),
  },
  {
    id: "mechanic",
    text: "Rides wear out and break down, and only a mechanic mends them. Hire one from Staff before the first breakdown.",
    ui: ["[data-build-item=staff_mechanic]", "[data-build-category=staff]", BUILD],
    done: (w) => w.num("n.staff_mechanic") > 0,
  },
];

/** The hint to show now: only in the first scenario, the first step not done. */
export function currentHint(w: WorldModel): HintStep | null {
  if (w.fact("scenario.id") !== FIRST_SCENARIO || w.fact("scenario.result") !== "") return null;
  return HINT_STEPS.find((step) => !step.done(w)) ?? null;
}
