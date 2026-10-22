import { devtools } from "../devtools/devtools";
import type { Vec3 } from "../world/geometry";

/** One visitor on site: the id its body, its needs and its money are keyed by. */
export interface Visitor {
  readonly id: string;
  /** Game-second it arrived; a restored visitor keeps the original. */
  readonly admittedAt: number;
}

/** What a flow policy reads to decide how many arrive and when one has had enough. */
export interface VisitorFlow {
  /** Visitors on site this tick — the member count, never a tally kept beside it. */
  readonly onSite: number;
  /** Most visitors the gates hold this tick, after resolving {@link VisitorPolicy.capacity}. */
  readonly capacity: number;
  /** Arrivals since {@link VisitorPopulation.rollDay}. */
  readonly arrivalsToday: number;
  readonly departuresToday: number;
  readonly now: number;
}

/** The game's world behind every counted visitor: it creates and removes the body. */
export interface VisitorWorld {
  /**
   * Create one visitor's body and its game-side record, and return where the body now stands.
   * `null` means the world refused it — no room, no walkable spot — and a refused body is never
   * counted as on site or as an arrival.
   */
  readonly admit: (visitor: Visitor) => Vec3 | null;
  /** Remove one visitor's body and record. Called for every departure, refusal and reset. */
  readonly release: (visitor: Visitor) => void;
  /**
   * True when the world currently holds a body for this id. `adopt` and `restore` refuse an id the
   * world does not hold, so the count can never name a body that is not on the ground.
   */
  readonly has: (id: string) => boolean;
}

/** The game's flow policy: what draws visitors in, how many fit, and when one has had enough. */
export interface VisitorPolicy {
  /** Most visitors on site at once; a function lets the cap follow a rating, a level or a build. */
  readonly capacity: number | ((now: number) => number);
  /** Visitors arriving per second at this instant; `0` with the gates shut. */
  readonly arrivalRate: (flow: VisitorFlow) => number;
  /** True when this visitor should leave now. Omit for a population that only leaves when told. */
  readonly shouldLeave?: (visitor: Visitor, flow: VisitorFlow) => boolean;
}

/** Flow policy fields a scenario can change in play. */
export interface VisitorPolicyPatch {
  readonly capacity?: number | ((now: number) => number);
  readonly arrivalRate?: (flow: VisitorFlow) => number;
  /** `null` removes the leaving rule, so visitors stay until {@link VisitorPopulation.leave}. */
  readonly shouldLeave?: ((visitor: Visitor, flow: VisitorFlow) => boolean) | null;
  readonly arrivalBudget?: number;
  /** `null` counts every admitted body as on site. */
  readonly inside?: ((position: Vec3) => boolean) | null;
}

/** Counters a HUD, a probe or a test reads. The on-site figure is the visitor list's length. */
export interface VisitorPopulationStats {
  onSite: number;
  capacity: number;
  arrivalsToday: number;
  departuresToday: number;
  /** Highest on-site count since the last {@link VisitorPopulation.rollDay}. */
  peakToday: number;
  /** Bodies the world or the bounds check refused. Never counted as arrivals. */
  refused: number;
  /** Arrival credit not yet spent. */
  pending: number;
}

/** How a body the game made itself joins the population. */
export interface VisitorAdoption {
  /** Game-second it arrived; defaults to the current tick's clock. */
  readonly admittedAt?: number;
  /** True for a body that is a new arrival today; false for one a save or a seed restored. */
  readonly arrival?: boolean;
}

/** Serializable state. No on-site count is stored: it is the restored visitor list. */
export interface VisitorPopulationSnapshot {
  visitors: { id: string; admittedAt: number }[];
  arrivalsToday: number;
  departuresToday: number;
  peakToday: number;
  pending: number;
  /** Next id suffix, so a restored save does not reuse an id. */
  sequence: number;
}

/** Options for {@link createVisitorPopulation}. */
export interface VisitorPopulationOptions {
  readonly world: VisitorWorld;
  readonly policy: VisitorPolicy;
  /** First half of every generated id. Default `"visitor#"`. */
  readonly idPrefix?: string;
  /** First suffix used after `idPrefix`. Default 1. */
  readonly sequenceStart?: number;
  /** Most bodies one tick may admit, so a long frame cannot flood the park. Default 4. */
  readonly arrivalBudget?: number;
  /** A body must stand here to count as on site; omit to count every admitted body. */
  readonly inside?: (position: Vec3) => boolean;
  /** Register a devtools probe under this name so the overlay shows the crowd and the day. */
  readonly devtoolsName?: string;
}

/**
 * The crowd a scene reports. Every visitor is a member with a body the game's world made, so the
 * on-site figure is the member count and the daily figure is the sum of admissions the world
 * accepted — there is no second tally to drift from what is on the ground. Arrivals, capacity and
 * leaving are the game's policy; ids, day rollover and counting are this seam's.
 */
export interface VisitorPopulation {
  /** Run the flow for `dt` seconds: leaving first, then arrivals within the budget and the cap. */
  tick(dt: number, now: number): void;
  /** Visitors on site. Reads the member count — no scan of the world, safe for a per-frame HUD. */
  onSite(): number;
  arrivalsToday(): number;
  departuresToday(): number;
  peakToday(): number;
  /** Ids on site, arrival order. Allocates — HUD lists and tests. */
  ids(): readonly string[];
  has(id: string): boolean;
  visitor(id: string): Visitor | null;
  /** Send one visitor home now (it reached the exit, or the game evicted it). */
  leave(id: string): boolean;
  /**
   * Take over a body the game created itself — one restored from a save, seeded at park open, or
   * scripted. It is on site from now on; pass `arrival: true` when it is also a new arrival today.
   */
  adopt(id: string, adoption?: VisitorAdoption): boolean;
  /** Close the day: arrivals, departures and peak reset. The crowd stays where it stands. */
  rollDay(): void;
  retune(patch: VisitorPolicyPatch): void;
  stats(): VisitorPopulationStats;
  snapshot(): VisitorPopulationSnapshot;
  /**
   * Replace the members with the saved ones. Only visitors the world already holds come back, so
   * restore the bodies first (or `adopt` each one as it spawns); the rest count as refused.
   */
  restore(next: VisitorPopulationSnapshot): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

const DEFAULT_ARRIVAL_BUDGET = 4;

function countOf(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Create the population a scene reports, with the game owning arrival and leaving policy. A
 * visitor only exists once the world has made its body, so the HUD's count and the bodies on
 * screen are the same list: `admit` returning `null` is a refused arrival, not a number.
 *
 * @capability visitor-population a crowd whose on-site and daily counts are the bodies the game made
 */
export function createVisitorPopulation(options: VisitorPopulationOptions): VisitorPopulation {
  const world = options.world;
  let policy = { ...options.policy };
  const idPrefix = options.idPrefix ?? "visitor#";
  let arrivalBudget = Math.max(1, Math.floor(options.arrivalBudget ?? DEFAULT_ARRIVAL_BUDGET));
  let inside = options.inside;
  let members = new Map<string, Visitor>();
  let sequence = Math.max(1, Math.floor(options.sequenceStart ?? 1));
  let arrivalsToday = 0;
  let departuresToday = 0;
  let peakToday = 0;
  let refused = 0;
  let pending = 0;
  let now = 0;
  let capacityNow = 0;

  function resolveCapacity(at: number): number {
    const value = typeof policy.capacity === "function" ? policy.capacity(at) : policy.capacity;
    return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  }

  capacityNow = resolveCapacity(0);

  function flow(): VisitorFlow {
    return { onSite: members.size, capacity: capacityNow, arrivalsToday, departuresToday, now };
  }

  function admitOne(at: number): boolean {
    const visitor: Visitor = { id: `${idPrefix}${sequence}`, admittedAt: at };
    sequence += 1;
    const position = world.admit(visitor);
    if (position === null || (inside !== undefined && !inside(position))) {
      if (position !== null) world.release(visitor);
      refused += 1;
      return false;
    }
    members.set(visitor.id, visitor);
    arrivalsToday += 1;
    if (members.size > peakToday) peakToday = members.size;
    return true;
  }

  function removeVisitor(visitor: Visitor): void {
    members.delete(visitor.id);
    world.release(visitor);
    departuresToday += 1;
  }

  function probeLine(): string {
    return `${members.size}/${capacityNow} on site ${arrivalsToday} arrived ${departuresToday} left ${refused} refused`;
  }

  const unregister =
    options.devtoolsName === undefined ? null : devtools.probes.register(options.devtoolsName, () => probeLine());

  return {
    tick(dt, at) {
      if (!(dt > 0) || !Number.isFinite(at)) return;
      now = at;
      capacityNow = resolveCapacity(at);
      const read = flow();
      const leave = policy.shouldLeave;
      if (leave !== undefined) {
        for (const visitor of members.values()) {
          if (leave(visitor, read)) removeVisitor(visitor);
        }
      }
      if (members.size < capacityNow) pending += Math.max(0, policy.arrivalRate(read)) * dt;
      let budget = arrivalBudget;
      while (pending >= 1 && budget > 0 && members.size < capacityNow) {
        pending -= 1;
        budget -= 1;
        admitOne(at);
      }
      if (pending < 0) pending = 0;
    },
    onSite: () => members.size,
    arrivalsToday: () => arrivalsToday,
    departuresToday: () => departuresToday,
    peakToday: () => peakToday,
    ids() {
      const out: string[] = [];
      for (const id of members.keys()) out.push(id);
      return out;
    },
    has: (id) => members.has(id),
    visitor: (id) => members.get(id) ?? null,
    leave(id) {
      const visitor = members.get(id);
      if (visitor === undefined) return false;
      removeVisitor(visitor);
      return true;
    },
    adopt(id, adoption) {
      if (id === "" || members.has(id) || !world.has(id)) return false;
      const saved = adoption?.admittedAt;
      const at = saved !== undefined && Number.isFinite(saved) ? saved : now;
      members.set(id, { id, admittedAt: at });
      if (members.size > peakToday) peakToday = members.size;
      if (adoption?.arrival === true) arrivalsToday += 1;
      return true;
    },
    rollDay() {
      arrivalsToday = 0;
      departuresToday = 0;
      peakToday = members.size;
    },
    retune(patch) {
      if (patch.capacity !== undefined) {
        policy = { ...policy, capacity: patch.capacity };
        capacityNow = resolveCapacity(now);
      }
      if (patch.arrivalRate !== undefined) policy = { ...policy, arrivalRate: patch.arrivalRate };
      if (patch.shouldLeave === null) policy = { capacity: policy.capacity, arrivalRate: policy.arrivalRate };
      else if (patch.shouldLeave !== undefined) policy = { ...policy, shouldLeave: patch.shouldLeave };
      if (patch.arrivalBudget !== undefined) {
        arrivalBudget = Math.max(1, Math.floor(Number.isFinite(patch.arrivalBudget) ? patch.arrivalBudget : arrivalBudget));
      }
      if (patch.inside === null) inside = undefined;
      else if (patch.inside !== undefined) inside = patch.inside;
    },
    stats: () => ({
      onSite: members.size,
      capacity: capacityNow,
      arrivalsToday,
      departuresToday,
      peakToday,
      refused,
      pending,
    }),
    snapshot() {
      const visitors: { id: string; admittedAt: number }[] = [];
      for (const visitor of members.values()) visitors.push({ id: visitor.id, admittedAt: visitor.admittedAt });
      return { visitors, arrivalsToday, departuresToday, peakToday, pending, sequence };
    },
    restore(next) {
      for (const visitor of members.values()) world.release(visitor);
      members = new Map();
      arrivalsToday = countOf(next.arrivalsToday);
      departuresToday = countOf(next.departuresToday);
      peakToday = countOf(next.peakToday);
      pending = Number.isFinite(next.pending) && next.pending > 0 ? next.pending : 0;
      sequence = Math.max(1, Math.floor(Number.isFinite(next.sequence) ? next.sequence : 1));
      for (const saved of next.visitors) {
        if (typeof saved?.id !== "string" || saved.id === "" || members.has(saved.id)) continue;
        if (!world.has(saved.id)) {
          refused += 1;
          continue;
        }
        const at = Number.isFinite(saved.admittedAt) ? saved.admittedAt : 0;
        members.set(saved.id, { id: saved.id, admittedAt: at });
      }
      if (members.size > peakToday) peakToday = members.size;
    },
    dispose() {
      unregister?.();
    },
  };
}
