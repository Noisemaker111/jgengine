import { devtools } from "../devtools/devtools";
import type { Vec3 } from "../world/geometry";

export interface Visitor {
  readonly id: string;
  /** Game-second it arrived; a restored visitor keeps the original. */
  readonly admittedAt: number;
}

export interface VisitorFlow {
  /** Visitors on site this tick — the member count, never a tally kept beside it. */
  readonly onSite: number;
  readonly capacity: number;
  readonly arrivalsToday: number;
  readonly departuresToday: number;
  readonly now: number;
}

export interface VisitorWorld {
  /**
   * Create one visitor's body and its game-side record, and return where the body now stands.
   * `null` means the world refused it — no room, no walkable spot — and a refused body is never
   * counted as on site or as an arrival.
   */
  readonly admit: (visitor: Visitor) => Vec3 | null;
  readonly release: (visitor: Visitor) => void;
  /**
   * True when the world currently holds a body for this id. `adopt` and `restore` refuse an id the
   * world does not hold, so the count can never name a body that is not on the ground.
   */
  readonly has: (id: string) => boolean;
}

export interface VisitorPolicy {
  readonly capacity: number | ((now: number) => number);
  /** Visitors arriving per second at this instant; `0` with the gates shut. */
  readonly arrivalRate: (flow: VisitorFlow) => number;
  readonly shouldLeave?: (visitor: Visitor, flow: VisitorFlow) => boolean;
}

export interface VisitorPolicyPatch {
  readonly capacity?: number | ((now: number) => number);
  readonly arrivalRate?: (flow: VisitorFlow) => number;
  readonly shouldLeave?: ((visitor: Visitor, flow: VisitorFlow) => boolean) | null;
  readonly arrivalBudget?: number;
  readonly inside?: ((position: Vec3) => boolean) | null;
}

export interface VisitorPopulationStats {
  onSite: number;
  capacity: number;
  arrivalsToday: number;
  departuresToday: number;
  peakToday: number;
  /** Bodies the world or the bounds check refused. Never counted as arrivals. */
  refused: number;
  pending: number;
}

export interface VisitorAdoption {
  /** Game-second it arrived; defaults to the current tick's clock. */
  readonly admittedAt?: number;
  readonly arrival?: boolean;
}

export interface VisitorPopulationSnapshot {
  visitors: { id: string; admittedAt: number }[];
  arrivalsToday: number;
  departuresToday: number;
  peakToday: number;
  pending: number;
  /** Next id suffix, so a restored save does not reuse an id. */
  sequence: number;
}

export interface VisitorPopulationOptions {
  readonly world: VisitorWorld;
  readonly policy: VisitorPolicy;
  readonly idPrefix?: string;
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
  onSite(): number;
  arrivalsToday(): number;
  departuresToday(): number;
  peakToday(): number;
  ids(): readonly string[];
  has(id: string): boolean;
  visitor(id: string): Visitor | null;
  leave(id: string): boolean;
  /**
   * Reserve the next generated id for a body the game makes itself (a crowd seeded at park open, a
   * scripted visitor), so it never collides with an arrival's id. `adopt` the body once it exists.
   */
  nextId(): string;
  adopt(id: string, adoption?: VisitorAdoption): boolean;
  rollDay(): void;
  retune(patch: VisitorPolicyPatch): void;
  stats(): VisitorPopulationStats;
  snapshot(): VisitorPopulationSnapshot;
  restore(next: VisitorPopulationSnapshot): void;
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

  function takeId(): string {
    const id = `${idPrefix}${sequence}`;
    sequence += 1;
    return id;
  }

  function admitOne(at: number): boolean {
    const visitor: Visitor = { id: takeId(), admittedAt: at };
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
    nextId: takeId,
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
