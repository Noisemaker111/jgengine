import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { MILESTONES } from "./milestones";
import { BUILDABLES, type BuildCategory } from "./objects/catalog";
import { hintsTaught } from "./onboarding";
import { park, researched } from "./park";
import { SCENARIOS, scenarioLock } from "./scenarios";
import { session } from "./session";

/** What the proofs and the depth check read from a live park. */
export interface ParkProbe {
  [reading: string]: number;
  guests: number;
  queued: number;
  riding: number;
  rating: number;
  cash: number;
  breakdowns: number;
  rides: number;
  /** First-scenario hints done. */
  taught: number;
  /** Lab topics finished plus rating awards won. */
  unlocks: number;
  ridesSeen: number;
  ridesTotal: number;
  shopsSeen: number;
  shopsTotal: number;
  scenerySeen: number;
  sceneryTotal: number;
  staffSeen: number;
  staffTotal: number;
  awardsSeen: number;
  awardsTotal: number;
  scenariosSeen: number;
  scenariosTotal: number;
  structures: number;
  researched: number;
  staffHired: number;
  visitors: number;
  loanOwed: number;
}

/** Open to the player (no lab topic, or its topic done) and how many there are, for one build category. */
function kindCount(ctx: GameContext, category: BuildCategory): { seen: number; total: number; researched: number } {
  const w = park.of(ctx);
  let seen = 0;
  let total = 0;
  let done = 0;
  for (const def of Object.values(BUILDABLES)) {
    if (def.category !== category) continue;
    total += 1;
    const finished = def.research !== undefined && w.fact(researched(def.id)) === true;
    if (finished) done += 1;
    if (def.research === undefined || finished) seen += 1;
  }
  return { seen, total, researched: done };
}

/**
 * The park's probe: the crowd and the till, plus the design brief's readings (`PLAN.md`): `taught`,
 * `unlocks`, each budget kind's `<kind>Seen` (open to the player, or met) and `<kind>Total`, and one
 * reading per system that moves when the player uses it.
 */
export function parkProbe(ctx: GameContext): ParkProbe {
  const w = park.of(ctx);
  let queued = 0;
  let riding = 0;
  for (const guest of session.guests.values()) {
    if (guest.phase === "queued") queued += 1;
    else if (guest.phase === "riding") riding += 1;
  }
  const rides = kindCount(ctx, "ride");
  const shops = kindCount(ctx, "stall");
  const scenery = kindCount(ctx, "scenery");
  const staff = kindCount(ctx, "staff");
  const topics = rides.researched + shops.researched + scenery.researched + staff.researched;
  const peak = w.num("park.peak");
  const awards = MILESTONES.filter((milestone) => peak >= milestone.rating).length;
  let staffHired = 0;
  for (const def of Object.values(BUILDABLES)) if (def.category === "staff") staffHired += w.num(`n.${def.id}`);
  return {
    guests: session.guests.size,
    queued,
    riding,
    rating: w.num("park.rating"),
    cash: w.num("park.cash"),
    breakdowns: w.num("park.breakdowns"),
    rides: w.num("park.rides"),
    taught: hintsTaught(ctx),
    unlocks: topics + awards,
    ridesSeen: rides.seen,
    ridesTotal: rides.total,
    shopsSeen: shops.seen,
    shopsTotal: shops.total,
    scenerySeen: scenery.seen,
    sceneryTotal: scenery.total,
    staffSeen: staff.seen,
    staffTotal: staff.total,
    awardsSeen: awards,
    awardsTotal: MILESTONES.length,
    scenariosSeen: SCENARIOS.filter((scenario) => scenarioLock(scenario.id) === null).length,
    scenariosTotal: SCENARIOS.length,
    structures: w.instances().length,
    researched: topics,
    staffHired,
    visitors: w.num("park.scenario_visitors"),
    loanOwed: w.num("park.loan_owed"),
  };
}
