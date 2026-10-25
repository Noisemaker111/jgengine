import { defineGameSpec } from "@jgengine/core/worldModel/gameSpec";
import {
  calm,
  type WorldActionDecl,
  type WorldFactsDecl,
  type WorldFlowDecl,
  type WorldKindDecl,
  type WorldModel,
  type WorldModelState,
  type WorldTotalDecl,
} from "@jgengine/core/worldModel/worldModel";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { DAY_LENGTH, GRID, STARTING_CASH, snapToGrid } from "./catalog";
import { LOT, sizeOf } from "./lot";
import { FLAT_LAND, LAND_FACT } from "./build/terrain";
import { BUILDABLES, BUILD_IDS, THEME_CAP, type BuildableDef } from "./objects/catalog";
import { SCENARIOS } from "./scenarios";
import { despawnObject, dispatchCrew, landed, scenarioEnded, spawnObject } from "./parkScene";

/**
 * Brightway Park is one declaration. Every ride, stall, path and post is a kind on the park lot;
 * the till, the crowd's mood, the rating, the loan and the scenario are facts; repairs, servicing,
 * restocking, prices and the loan are actions; upkeep and litter are flows; a breakdown and a guest
 * paying are ripples. The engine runs it (`brightway.place`, `brightway.act`, `brightway.remove`)
 * and keeps it in one store, `brightway.world`, that the park save writes whole.
 *
 * What stays game code: guests and janitors walking (agents), the ride cycles and lines (the shared
 * ride sim), the coaster circuit, and the rating's blend of mood, crowd and litter.
 */

export { LOT, sizeOf };

/**
 * The bank: the park opens owing `start`, may borrow up to `max` in steps of `step`, and pays
 * `dailyRate` interest on what it owes every midnight.
 */
export const LOAN = { start: 10_000, max: 25_000, step: 1_000, dailyRate: 0.008 } as const;

const ride = (def: BuildableDef) => def.ride !== undefined;

/** The lot cell a structure's corner sits on when the pointer lands at (x, z): the footprint centres on it. */
export function cellFor(kind: string, x: number, z: number): [number, number] {
  const n = sizeOf(BUILDABLES[kind]!);
  const start = -Math.floor((n - 1) / 2);
  const col = (snapToGrid(x) - LOT.origin[0] - GRID / 2) / GRID + start;
  const row = (snapToGrid(z) - LOT.origin[1] - GRID / 2) / GRID + start;
  return [col, row];
}

/** The world centre of every cell a structure placed at `cell` covers (the blueprint overlay draws these). */
export function cellCentres(kind: string, cell: readonly [number, number]): [number, number][] {
  const n = sizeOf(BUILDABLES[kind]!);
  const out: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) out.push([LOT.origin[0] + (cell[0] + i + 0.5) * GRID, LOT.origin[1] + (cell[1] + j + 0.5) * GRID]);
  }
  return out;
}

/** The fact a lab topic sets when it is done; a kind with research is locked until then. */
export const researched = (kind: string): string => `research.${kind}`;

function kindOf(def: BuildableDef): WorldKindDecl {
  // `rot`: the quarter turns it was built facing.
  const facts: Record<string, WorldFactsDecl[string]> = { appeal: def.appeal, rot: 0 };
  // A ride or shop no path reaches (or a ride with no entrance or exit) is shut: `closed`, until the
  // network says otherwise when it opens.
  if (def.ride !== undefined || def.stall !== undefined) facts.closed = true;
  if (def.ride !== undefined) {
    facts.broken = false;
    // Charm from scenery in reach, which the park adds to the ride's appeal and excitement.
    facts.theme = 0;
  }
  if (def.staff !== undefined) {
    // The patrol area's radius in metres, around the post.
    facts.patrol = { value: def.staff.patrol, min: PATROL.min, max: PATROL.max };
  }
  if (def.stall !== undefined) {
    facts.sold = { value: 0, min: 0, max: def.stall.stock };
    facts.sold_total = 0;
  }
  return {
    label: def.label,
    tags: [def.category],
    grid: "lot",
    size: [sizeOf(def), sizeOf(def)],
    cost: { "park.cash": -def.cost },
    refund: 0.5,
    facts,
    ...(def.research === undefined ? {} : { when: { [researched(def.id)]: true }, refuse: `Research the ${def.label} in the lab first` }),
    ...(def.id === "ride_coaster" ? { limit: 1 } : {}),
  };
}

/** How far a patrol area reaches, and the step the inspector widens or narrows it by. */
export const PATROL = { min: 8, max: 40, step: 4 } as const;

function staffActions(def: BuildableDef): Record<string, WorldActionDecl> {
  return {
    [`patrol_wider_${def.id}`]: { label: `Widen the ${def.label}'s patrol`, on: def.id, effect: { patrol: PATROL.step } },
    [`patrol_narrower_${def.id}`]: { label: `Narrow the ${def.label}'s patrol`, on: def.id, effect: { patrol: -PATROL.step } },
  };
}

/** A mechanic bay cuts a repair by a third. */
export const QUICK_REPAIR = 0.65;

function rideActions(def: BuildableDef): Record<string, WorldActionDecl> {
  const ride = def.ride!;
  const repair = (takes: number, when: WorldActionDecl["when"]): WorldActionDecl => ({
    label: `Repair ${def.label}`,
    on: def.id,
    when,
    whenTarget: { broken: true },
    cost: { "park.cash": -ride.breakdown.repairCost },
    world: { "park.spent_today": ride.breakdown.repairCost },
    takes,
    queue: "crew",
    effect: { broken: false },
    emit: "repaired",
    note: "The crew has the {target} running again.",
  });
  return {
    [`repair_${def.id}`]: repair(ride.breakdown.repairSeconds, { "n.staff_mechanic": { atMost: 0 } }),
    [`quickfix_${def.id}`]: repair(Math.round(ride.breakdown.repairSeconds * QUICK_REPAIR), { "n.staff_mechanic": { atLeast: 1 } }),
    [`service_${def.id}`]: {
      label: `Service ${def.label}`,
      on: def.id,
      whenTarget: { broken: false },
      cost: { "park.cash": -ride.breakdown.serviceCost },
      world: { "park.spent_today": ride.breakdown.serviceCost },
      note: "Serviced the {target}: its wear is cleared.",
    },
    [`price_up_${def.id}`]: { label: `Raise the ${def.label} ticket`, world: { [`price.${def.id}`]: 1 } },
    [`price_down_${def.id}`]: { label: `Lower the ${def.label} ticket`, world: { [`price.${def.id}`]: -1 } },
  };
}

function stallActions(def: BuildableDef): Record<string, WorldActionDecl> {
  const stall = def.stall!;
  return {
    [`price_up_${def.id}`]: { label: `Raise the ${def.label} price`, world: { [`price.${def.id}`]: 1 } },
    [`price_down_${def.id}`]: { label: `Lower the ${def.label} price`, world: { [`price.${def.id}`]: -1 } },
    // Scaled by what sold since the last restock: an untouched stall restocks for nothing.
    [`restock_${def.id}`]: {
      label: `Restock ${def.label}`,
      on: def.id,
      scaleBy: "sold",
      cost: { "park.cash": -stall.restock },
      world: { "park.spent_today": stall.restock },
      effect: { sold: -stall.stock },
    },
  };
}

const kinds: Record<string, WorldKindDecl> = {};
const actions: Record<string, WorldActionDecl> = {
  ticket_up: { label: "Raise the entry ticket", world: { "park.ticket": 1 } },
  ticket_down: { label: "Lower the entry ticket", world: { "park.ticket": -1 } },
  take_loan: {
    label: `Borrow $${LOAN.step.toLocaleString()}`,
    when: { "park.loan_owed": { atMost: LOAN.max - LOAN.step } },
    refuse: `The bank won't lend more than $${LOAN.max.toLocaleString()}`,
    world: { "park.cash": LOAN.step, "park.loan_owed": LOAN.step },
    note: `Borrowed $${LOAN.step.toLocaleString()} from the bank`,
  },
  repay_loan: {
    label: `Repay $${LOAN.step.toLocaleString()}`,
    when: { "park.loan_owed": { atLeast: LOAN.step } },
    refuse: "The park owes the bank nothing",
    cost: { "park.cash": -LOAN.step },
    world: { "park.loan_owed": -LOAN.step },
    note: `Paid $${LOAN.step.toLocaleString()} back to the bank`,
  },
};

/**
 * The lab: each topic is an action that costs its fee up front, waits its time in the `lab` queue
 * and sets `research.<kind>`; the topic before it in its family must be done first.
 */
function researchAction(def: BuildableDef): WorldActionDecl {
  const research = def.research!;
  const after = research.after;
  return {
    label: `Research ${def.label}`,
    when: { [researched(def.id)]: false, ...(after === undefined || BUILDABLES[after]?.research === undefined ? {} : { [researched(after)]: true }) },
    refuse: after === undefined ? `${def.label} is already researched` : `Research the ${BUILDABLES[after]!.label} first`,
    cost: { "park.cash": -research.cost },
    takes: research.seconds,
    queue: "lab",
    world: { [researched(def.id)]: true, "park.spent_today": research.cost },
    note: `Research complete: the ${def.label} can now be built`,
  };
}
const totals: Record<string, WorldTotalDecl> = {
  // Across every kind by its category tag: the dashboard's counts.
  "park.rides": { of: "ride" },
  "park.rides_open": { of: "ride", where: { broken: false, closed: false } },
  "park.stalls": { of: "stall" },
};
const flows: Record<string, WorldFlowDecl> = {
  // Every guest drops a little litter; every janitor post sweeps it up.
  litter: { to: "park.litter", from: "park.guests", rate: 0.006 },
  sweep: { to: "park.litter", from: "n.staff_janitor", rate: -(BUILDABLES.staff_janitor!.staff!.cleaning * 0.08) },
};
// The ground's height levels, a digit a cell; and which version of the path rules the park was laid under.
const prices: Record<string, WorldFactsDecl[string]> = { [LAND_FACT]: FLAT_LAND, "park.netv": 0 };

for (const id of BUILD_IDS) {
  const def = BUILDABLES[id]!;
  kinds[id] = kindOf(def);
  totals[`n.${id}`] = { of: id };
  // A broken or shut ride draws no one: its appeal drops out of the park's until it runs again.
  totals[`appeal.${id}`] = { of: id, sum: "appeal", ...(ride(def) ? { where: { broken: false, closed: false } } : def.stall !== undefined ? { where: { closed: false } } : {}) };
  if (def.ride !== undefined) {
    prices[`price.${id}`] = { value: def.ride.price, min: 0, max: 20 };
    Object.assign(actions, rideActions(def));
  }
  if (def.stall !== undefined) {
    prices[`price.${id}`] = { value: def.stall.price, min: 0, max: 20 };
    Object.assign(actions, stallActions(def));
  }
  if (def.staff !== undefined) Object.assign(actions, staffActions(def));
  if (def.research !== undefined) {
    prices[researched(id)] = false;
    actions[`research_${id}`] = researchAction(def);
  }
  if (def.upkeep > 0) {
    // Upkeep and wages run by the second through the day, and the day's bill keeps count.
    flows[`upkeep_${id}`] = { to: "park.cash", from: `n.${id}`, rate: -def.upkeep / DAY_LENGTH };
    flows[`bill_${id}`] = { to: "park.spent_today", from: `n.${id}`, rate: def.upkeep / DAY_LENGTH };
  }
}

const jobs = Object.fromEntries(
  SCENARIOS.map((scenario) => [scenario.id, { title: scenario.title, mission: scenario.mission, kind: "side" as const, repeatable: true, pitch: scenario.goal }]),
);

export const park = defineGameSpec({
  id: "brightway",
  world: {
    factions: {
      park: {
        label: "Brightway Park",
        facts: {
          cash: STARTING_CASH,
          // The crowd's mood, as the guest agents average it.
          mood: 55,
          // What the crowd is saying right now: a breakdown sours it, it settles back on its own.
          buzz: calm(0, 0.5, { min: -40, max: 40 }),
          rating: 0,
          // The best rating the park has reached: each award is paid once, the first time it is crossed.
          peak: 0,
          litter: { value: 0, min: 0, max: 100 },
          // Share of the crowd (0-1) whose latest thought is a complaint; the rating reads it.
          complaints: 0,
          ticket: { value: 8, min: 0, max: 40 },
          guests: { value: 0, min: 0 },
          guests_today: 0,
          revenue_today: 0,
          spent_today: 0,
          revenue_yesterday: 0,
          upkeep_yesterday: 0,
          breakdowns: 0,
          day: 1,
          open: false,
          loan_owed: { value: LOAN.start, min: 0 },
          bankrupt_days: 0,
          game_over: false,
          won: false,
          win_dismissed: false,
          interest_paid: 0,
          price_complaints: 0,
          scenario_visitors: 0,
          scenario_revenue: 0,
        },
      },
    },
    facts: { ...prices, "scenario.id": "", "scenario.result": "", "scenario.reason": "" },
    grids: { lot: LOT },
    kinds,
    actions,
    totals,
    flows,
    queues: { crew: { lanes: 2 }, lab: { lanes: 1, capacity: 4 } },
    ripples: {
      // A guest through the turnstile; the ticket is paid with `pay`.
      admit: { world: { "park.guests": 1, "park.guests_today": 1, "park.scenario_visitors": 1 } },
      // Any money a guest hands over - gate, ride or stall - scaled by the amount.
      pay: { world: { "park.cash": 1, "park.revenue_today": 1, "park.scenario_revenue": 1 } },
      leave: { world: { "park.guests": -1 } },
      breakdown: { world: { "park.buzz": -15, "park.breakdowns": 1 }, note: "A ride broke down - the crowd groans", hook: "dispatch_crew" },
      repaired: { world: { "park.buzz": 6 } },
      // Midnight's interest on the loan, scaled by what it comes to.
      interest: {
        when: { "park.loan_owed": { atLeast: 1 } },
        world: { "park.cash": -1, "park.spent_today": 1, "park.interest_paid": 1 },
      },
      // A rating award, scaled by its prize.
      award: { world: { "park.cash": 1 } },
      // A guest who wanted something but wouldn't pay the price.
      refused_price: { world: { "park.price_complaints": 1 } },
    },
    jobs,
  },
  hooks: {
    // The event names the ride (`by`); the hook marks it down and sends the crew if the till can pay.
    dispatch_crew: (ctx, call) => {
      if (call.event?.by !== undefined) dispatchCrew(ctx, call.world, call.event.by);
    },
  },
  onReady: (ctx, instance) => spawnObject(ctx, instance),
  onRemoved: (ctx, gone) => despawnObject(ctx, gone.id, Number(gone.refund["park.cash"] ?? 0)),
  // Once the park has gone under, nothing more is built, run or sold.
  accepting: (ctx) => (park.of(ctx).fact("park.game_over") === true ? "The park has closed for good" : null),
  onLanded: (ctx, action, target) => landed(ctx, action, target),
  onReward: (ctx, rewards) => {
    const cash = rewards.economy?.cash ?? 0;
    if (cash > 0) park.of(ctx).change({ "park.cash": cash });
  },
  onJob: (ctx, event) => scenarioEnded(ctx, event),
});

/** A placed structure as the guests, rides and staff read it: what it is and where it stands. */
export interface ParkObject {
  id: string;
  kind: string;
  def: BuildableDef;
  x: number;
  z: number;
}

const indexes = new WeakMap<object, { list: ParkObject[]; byId: Map<string, ParkObject> }>();
const EMPTY = { list: [] as ParkObject[], byId: new Map<string, ParkObject>() };

/** The read of the world's instances everything else walks, rebuilt only when something is built or removed. */
function index(ctx: GameContext): { list: ParkObject[]; byId: Map<string, ParkObject> } {
  const state = park.store.read(ctx) as WorldModelState | undefined;
  const instances = state?.instances;
  if (instances === undefined) return EMPTY;
  const cached = indexes.get(instances);
  if (cached !== undefined) return cached;
  const list: ParkObject[] = [];
  for (const view of park.of(ctx).instances()) {
    if (!view.ready || view.position === null) continue;
    list.push({ id: view.id, kind: view.kind, def: BUILDABLES[view.kind]!, x: view.position[0], z: view.position[1] });
  }
  const built = { list, byId: new Map(list.map((entry) => [entry.id, entry])) };
  indexes.set(instances, built);
  return built;
}

export const parkObjects = (ctx: GameContext): readonly ParkObject[] => index(ctx).list;
export const parkObject = (ctx: GameContext, id: string | null): ParkObject | undefined => (id === null ? undefined : index(ctx).byId.get(id));

/** How many of a kind stand in the park. */
export const countOf = (w: WorldModel, kind: string): number => w.num(`n.${kind}`);

/** A stall's stock left, read from what it sold since its last restock. */
export function stockOf(w: WorldModel, obj: ParkObject): number {
  return obj.def.stall === undefined ? 0 : obj.def.stall.stock - w.num(`${obj.id}.sold`);
}

/** What the park sets for a ride's ticket. */
export const ridePrice = (w: WorldModel, kind: string): number => w.num(`price.${kind}`);

/** What the park charges for one item at a shop. */
export const stallPrice = (w: WorldModel, kind: string): number => w.num(`price.${kind}`);

/** A guest pays up to this much over what they think a thing is worth before refusing it. */
export const PRICE_TOLERANCE = 1.25;

/** What a guest thinks a ride is worth: its excitement, scenery charm included. */
export function rideValue(excitement: number): number {
  return Math.round((0.6 + excitement * 0.55) * 10) / 10;
}

/** Most a guest will pay for a ride or an item before saying it's too expensive. */
export function fairPrice(w: WorldModel, obj: ParkObject, excitement: number): number {
  if (obj.def.stall !== undefined) return obj.def.stall.value * PRICE_TOLERANCE;
  return rideValue(excitement) * PRICE_TOLERANCE;
}

/**
 * Scenery charms the rides in its reach: each ride's `theme` is the bonus of every scenery piece
 * within that piece's radius (measured to the ride's edge), capped, and its appeal is its own plus
 * that charm. Run after anything is built or removed.
 */
export function rethemeRides(ctx: GameContext): void {
  const w = park.of(ctx);
  const objects = parkObjects(ctx);
  const scenery = objects.filter((obj) => obj.def.theme !== undefined);
  for (const obj of objects) {
    if (obj.def.ride === undefined) continue;
    let theme = 0;
    for (const deco of scenery) {
      const reach = deco.def.theme!.radius + obj.def.footprint / 2;
      if (Math.hypot(deco.x - obj.x, deco.z - obj.z) <= reach) theme += deco.def.theme!.bonus;
    }
    theme = Math.round(Math.min(THEME_CAP, theme) * 10) / 10;
    if (w.num(`${obj.id}.theme`) !== theme) {
      w.set(`${obj.id}.theme`, theme);
      w.set(`${obj.id}.appeal`, Math.round((obj.def.appeal + theme) * 10) / 10);
    }
  }
}

/** The repair the park's crew runs on this ride now: quicker once a mechanic bay stands. */
/** A staff post's patrol radius in metres. */
export function patrolRadius(w: WorldModel, postId: string): number {
  return w.num(`${postId}.patrol`);
}

/** Every placed ride. */
export const rideObjects = (ctx: GameContext): readonly ParkObject[] => parkObjects(ctx).filter((obj) => obj.def.ride !== undefined);

export const repairAction = (w: WorldModel, kind: string): string => (countOf(w, "staff_mechanic") > 0 ? `quickfix_${kind}` : `repair_${kind}`);

/** The park as the dashboard and the rating read it: sums over every kind's totals. */
export interface ParkMetrics {
  rides: number;
  ridesOpen: number;
  stalls: number;
  tracks: number;
  variety: number;
  totalAppeal: number;
  /** Every structure's upkeep per day, wages included. */
  dailyUpkeep: number;
  /** The staff share of `dailyUpkeep`. */
  wages: number;
  facilitiesUpkeep: number;
}

export function parkMetrics(w: WorldModel): ParkMetrics {
  let totalAppeal = 0;
  let dailyUpkeep = 0;
  let wages = 0;
  let variety = 0;
  const needs = new Set<string>();
  for (const id of BUILD_IDS) {
    const def = BUILDABLES[id]!;
    const n = countOf(w, id);
    totalAppeal += w.num(`appeal.${id}`);
    if (n === 0) continue;
    dailyUpkeep += def.upkeep * n;
    if (def.category === "staff") wages += def.upkeep * n;
    if (def.ride !== undefined) variety += 1;
    if (def.stall !== undefined) needs.add(def.stall.need);
  }
  return {
    rides: w.num("park.rides"),
    ridesOpen: w.num("park.rides_open"),
    stalls: w.num("park.stalls"),
    tracks: countOf(w, "track_piece"),
    variety: variety + needs.size,
    totalAppeal,
    dailyUpkeep,
    wages,
    facilitiesUpkeep: dailyUpkeep - wages,
  };
}

/** Bring a fresh world: drop the old one, then write the declared start so every read sees one state. */
export function freshWorld(ctx: GameContext, cash = STARTING_CASH): WorldModel {
  park.store.write(ctx, undefined);
  const w = park.of(ctx);
  w.change({ "park.cash": cash - STARTING_CASH });
  return w;
}

/** Put an authored structure down without charging the till: the starter park comes with the lot. */
export function placeFree(w: WorldModel, kind: string, cell: readonly [number, number]): string | null {
  const result = w.place(kind, { cell }, { free: true });
  return result.ok ? result.id : null;
}
