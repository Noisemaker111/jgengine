import {
  createUtilityBrain,
  sampleResponseCurve,
  type ResponseCurve,
  type UtilityBrain,
  type UtilityBrainSnapshot,
  type UtilityCandidate,
  type UtilityOption,
} from "../ai/utilityBrain";
import { devtools } from "../devtools/devtools";
import { clamp } from "../math/scalar";
import { resolveRng } from "../random/resolveRng";
import { createPhaseSchedule, type PhaseSchedule } from "../time/stateSchedule";
import { createWaitQueue, type QueueWait, type WaitQueue, type WaitQueueSnapshot } from "./queue";
import type { NeedSet } from "./needs";

export type RidePhase = "idle" | "loading" | "riding" | "unloading" | "broken";

const RIDE_PHASE_ORDER: readonly RidePhase[] = ["idle", "loading", "riding", "unloading", "broken"];

export interface RideRatings {
  readonly excitement: number;
  readonly intensity: number;
  readonly nausea: number;
}

/** Breakdown curve and money for one ride. All data, so a park tunes its own economy. */
export interface RideBreakdown {
  /** Chance one completed cycle breaks the ride at zero wear. */
  readonly baseChance: number;
  readonly wearChance: number;
  /** Seconds the ride is out while it is repaired. */
  readonly repairSeconds: number;
  readonly repairCost: number;
  /** Money charged when a mechanic services the ride before it breaks. */
  readonly serviceCost: number;
}

export interface RideDefinition {
  readonly id: string;
  readonly ratings: RideRatings;
  readonly capacity: number;
  readonly loadSeconds: number;
  readonly rideSeconds: number;
  readonly unloadSeconds: number;
  /** Omit for a ride that never breaks down. */
  readonly breakdown?: RideBreakdown | undefined;
}

export interface RideQueueView {
  readonly size: number;
  readonly wait: QueueWait;
}

export interface RideView {
  readonly id: string;
  readonly ratings: RideRatings;
  readonly capacity: number;
  readonly phase: RidePhase;
  /** Seconds left in the current phase; `0` while idle. */
  readonly phaseSeconds: number;
  readonly riders: number;
  readonly queue: RideQueueView;
  readonly cycles: number;
  readonly wear: number;
  readonly breakdowns: number;
  readonly spend: number;
}

export interface RideStats {
  rides: number;
  broken: number;
  riders: number;
  queued: number;
  boarded: number;
  cycles: number;
  breakdowns: number;
  spend: number;
  ticks: number;
  /** Slowest single `tick` seen so far, in milliseconds. */
  slowestTickMs: number;
}

export interface RideTickSink {
  onBoard?(rideId: string, guestId: string, at: number): void;
  onAlight?(rideId: string, guestId: string, at: number): void;
  onBreak?(rideId: string, at: number): void;
  onRepaired?(rideId: string, cost: number, at: number): void;
}

export interface RideRetune {
  readonly ratings?: Partial<RideRatings>;
  readonly capacity?: number;
  readonly loadSeconds?: number;
  readonly rideSeconds?: number;
  readonly unloadSeconds?: number;
  readonly breakdown?: Partial<RideBreakdown> | null;
}

export interface RideServiceResult {
  readonly id: string;
  readonly cost: number;
  readonly wear: number;
}

export interface RideSystemSnapshot {
  elapsed: number;
  rides: {
    definition: RideDefinition;
    phase: RidePhase;
    timer: number;
    riders: string[];
    cycles: number;
    wear: number;
    breakdowns: number;
    repairSpend: number;
    serviceSpend: number;
    boarded: number;
    queue: WaitQueueSnapshot;
  }[];
}

export interface RideSystemConfig {
  readonly rides: readonly RideDefinition[];
  readonly rng?: () => number;
  /** Seed seconds per guest for a line that has not boarded yet. Default 8. */
  readonly queueSeedServiceSeconds?: number;
  /** Register a devtools probe under this name so the perf overlay shows the park. */
  readonly devtoolsName?: string;
}

/**
 * The park's rides: each runs its own load → ride → unload cycle at its own capacity, takes guests
 * off its own line, wears out against its own breakdown curve, and reports its own repairs and
 * services. The clock is internal and only `tick` moves it, so a replay, a save and a test read the
 * same cycle.
 *
 * Cost per tick is bounded by the ride count plus the guests one cycle boards.
 */
export interface RideSystem {
  /** Seconds this system has ticked. */
  now(): number;
  /** Bumped by `retune` and `restore`, so a chooser can rebuild stale options. */
  revision(): number;
  rideIds(): readonly string[];
  definitions(): readonly RideDefinition[];
  ride(id: string): RideView | null;
  rides(): readonly RideView[];
  queue(id: string): WaitQueue | null;
  join(id: string, guestId: string): boolean;
  leave(id: string, guestId: string): boolean;
  /** Seconds a guest joining now would wait; `0` on an unknown ride. */
  waitSeconds(id: string): number;
  /** Advance every ride's cycle by `dt` seconds. */
  tick(dt: number, sink?: RideTickSink): void;
  service(id: string): RideServiceResult | null;
  retune(id: string, patch: RideRetune): boolean;
  stats(): RideStats;
  snapshot(): RideSystemSnapshot;
  restore(next: RideSystemSnapshot): void;
  dispose(): void;
}

export const DEFAULT_RIDE_BREAKDOWN: RideBreakdown = {
  baseChance: 0,
  wearChance: 0,
  repairSeconds: 60,
  repairCost: 0,
  serviceCost: 0,
};

interface RideState {
  def: RideDefinition;
  queue: WaitQueue;
  schedule: PhaseSchedule<RidePhase>;
  riders: string[];
  cycles: number;
  wear: number;
  breakdowns: number;
  repairSpend: number;
  serviceSpend: number;
  boarded: number;
}

function cloneBreakdown(breakdown: RideBreakdown | undefined): RideBreakdown | undefined {
  return breakdown === undefined ? undefined : { ...breakdown };
}

function cloneDefinition(def: RideDefinition): RideDefinition {
  return {
    id: def.id,
    ratings: { ...def.ratings },
    capacity: def.capacity,
    loadSeconds: def.loadSeconds,
    rideSeconds: def.rideSeconds,
    unloadSeconds: def.unloadSeconds,
    breakdown: cloneBreakdown(def.breakdown),
  };
}

function validateDefinition(def: RideDefinition): void {
  if (typeof def.id !== "string" || def.id === "") throw new Error("ride needs a non-empty id");
  if (!Number.isFinite(def.capacity) || def.capacity < 1) {
    throw new Error(`ride "${def.id}" needs a capacity of at least 1, got ${def.capacity}`);
  }
  for (const field of ["loadSeconds", "rideSeconds", "unloadSeconds"] as const) {
    if (!Number.isFinite(def[field]) || def[field] < 0) {
      throw new Error(`ride "${def.id}" needs a non-negative ${field}, got ${def[field]}`);
    }
  }
  for (const field of ["excitement", "intensity", "nausea"] as const) {
    if (!Number.isFinite(def.ratings[field])) {
      throw new Error(`ride "${def.id}" needs a finite ${field} rating, got ${def.ratings[field]}`);
    }
  }
}

function secondsOf(def: RideDefinition, phase: RidePhase): number {
  switch (phase) {
    case "idle":
      return 0;
    case "loading":
      return Math.max(0, def.loadSeconds);
    case "riding":
      return Math.max(0, def.rideSeconds);
    case "unloading":
      return Math.max(0, def.unloadSeconds);
    case "broken":
      return Math.max(0, def.breakdown?.repairSeconds ?? 0);
  }
}

/** One ride's cycle: a phase ends on its own seconds, and only a line of guests or a repair starts the next one. */
function rideSchedule(def: RideDefinition): PhaseSchedule<RidePhase> {
  return createPhaseSchedule<RidePhase>({
    phases: RIDE_PHASE_ORDER.map((phase) => ({
      state: phase,
      ...(phase === "idle" ? {} : { durationSeconds: secondsOf(def, phase) }),
      ...(phase === "unloading" || phase === "broken" ? { next: "idle" } : {}),
    })),
    loop: true,
    overshoot: "drop",
  });
}

/**
 * Create the rides a park runs. Each ride cycles on its own data, boards from its own line up to its
 * own capacity, wears against its own breakdown curve and reports its repairs through the sink, so
 * the caller keeps the wallet, the bodies and the visuals.
 *
 * @capability ride-sim rides with capacity, cycles, queues, ratings, breakdowns and maintenance
 */
export function createRideSystem(config: RideSystemConfig): RideSystem {
  const rides: RideState[] = [];
  const stateOf = new Map<string, RideState>();
  const defs: RideDefinition[] = [];
  const ids: string[] = [];
  const seedServiceSeconds = config.queueSeedServiceSeconds;
  for (const definition of config.rides) {
    validateDefinition(definition);
    if (stateOf.has(definition.id)) throw new Error(`duplicate ride id "${definition.id}"`);
    const def = cloneDefinition(definition);
    const state: RideState = {
      def,
      queue: createWaitQueue({ seedServiceSeconds }),
      schedule: rideSchedule(def),
      riders: [],
      cycles: 0,
      wear: 0,
      breakdowns: 0,
      repairSpend: 0,
      serviceSpend: 0,
      boarded: 0,
    };
    rides.push(state);
    defs.push(def);
    ids.push(def.id);
    stateOf.set(def.id, state);
  }

  let elapsed = 0;
  let revision = 0;
  let ticks = 0;
  let slowestTickMs = 0;
  let rng = config.rng;

  function rollRng(): number {
    if (rng === undefined) rng = resolveRng(undefined, "createRideSystem");
    return rng();
  }

  function probeLine(): string {
    let broken = 0;
    let queued = 0;
    let boarded = 0;
    for (const state of rides) {
      if (state.schedule.state() === "broken") broken += 1;
      queued += state.queue.size();
      boarded += state.boarded;
    }
    return `${rides.length} rides ${broken} broken ${queued} queued ${boarded} carried ${ticks} ticks ${slowestTickMs.toFixed(2)} ms slowest`;
  }

  const unregister =
    config.devtoolsName === undefined ? null : devtools.probes.register(config.devtoolsName, () => probeLine());

  function board(state: RideState, sink: RideTickSink | undefined): void {
    const capacity = Math.max(1, Math.floor(state.def.capacity));
    let boarded = 0;
    while (boarded < capacity) {
      const guestId = state.queue.dequeue();
      if (guestId === null) break;
      state.riders.push(guestId);
      boarded += 1;
      state.boarded += 1;
      sink?.onBoard?.(state.def.id, guestId, elapsed);
    }
    if (boarded > 0) state.queue.recordBoard(elapsed, boarded);
    state.schedule.advance();
  }

  function finishCycle(state: RideState, sink: RideTickSink | undefined): void {
    const id = state.def.id;
    for (const guestId of state.riders) sink?.onAlight?.(id, guestId, elapsed);
    state.riders.length = 0;
    state.cycles += 1;
    state.wear += 1;
    const breakdown = state.def.breakdown;
    if (breakdown !== undefined) {
      const chance = clamp(breakdown.baseChance + breakdown.wearChance * state.wear, 0, 1);
      if (chance > 0 && rollRng() < chance) {
        state.schedule.retune("broken", Math.max(0, breakdown.repairSeconds));
        state.schedule.goTo("broken");
        state.breakdowns += 1;
        sink?.onBreak?.(id, elapsed);
      }
    }
  }

  function tickRide(state: RideState, dt: number, sink: RideTickSink | undefined): void {
    const schedule = state.schedule;
    if (schedule.state() === "idle") {
      if (state.queue.size() > 0) board(state, sink);
      return;
    }
    for (const step of schedule.tick(dt)) {
      switch (step.from) {
        case "broken": {
          const id = state.def.id;
          const cost = state.def.breakdown?.repairCost ?? 0;
          state.repairSpend += cost;
          sink?.onRepaired?.(id, cost, elapsed);
          break;
        }
        case "unloading":
          finishCycle(state, sink);
          break;
        case "idle":
        case "loading":
        case "riding":
          break;
      }
    }
  }

  function viewOf(state: RideState): RideView {
    return {
      id: state.def.id,
      ratings: state.def.ratings,
      capacity: state.def.capacity,
      phase: state.schedule.state(),
      phaseSeconds: state.schedule.remainingSeconds() ?? 0,
      riders: state.riders.length,
      queue: { size: state.queue.size(), wait: state.queue.wait() },
      cycles: state.cycles,
      wear: state.wear,
      breakdowns: state.breakdowns,
      spend: state.repairSpend + state.serviceSpend,
    };
  }

  return {
    now: () => elapsed,
    revision: () => revision,
    rideIds: () => ids,
    definitions: () => defs,
    ride(id) {
      const state = stateOf.get(id);
      return state === undefined ? null : viewOf(state);
    },
    rides: () => rides.map(viewOf),
    queue(id) {
      const state = stateOf.get(id);
      return state === undefined ? null : state.queue;
    },
    join(id, guestId) {
      const state = stateOf.get(id);
      if (state === undefined) return false;
      return state.queue.enqueue(guestId, elapsed);
    },
    leave(id, guestId) {
      const state = stateOf.get(id);
      if (state === undefined) return false;
      return state.queue.remove(guestId);
    },
    waitSeconds(id) {
      const state = stateOf.get(id);
      return state === undefined ? 0 : state.queue.wait().seconds;
    },
    tick(dt, sink) {
      if (!(dt > 0) || rides.length === 0) return;
      const started = performance.now();
      elapsed += dt;
      for (const state of rides) tickRide(state, dt, sink);
      ticks += 1;
      slowestTickMs = Math.max(slowestTickMs, performance.now() - started);
    },
    service(id) {
      const state = stateOf.get(id);
      if (state === undefined) return null;
      const wear = state.wear;
      const breakdown = state.def.breakdown;
      if (breakdown === undefined || wear <= 0) return { id, cost: 0, wear };
      state.wear = 0;
      state.serviceSpend += breakdown.serviceCost;
      return { id, cost: breakdown.serviceCost, wear };
    },
    retune(id, patch) {
      const state = stateOf.get(id);
      if (state === undefined) return false;
      const def = state.def;
      const index = rides.indexOf(state);
      const breakdown =
        patch.breakdown === undefined
          ? def.breakdown
          : patch.breakdown === null
            ? undefined
            : { ...(def.breakdown ?? DEFAULT_RIDE_BREAKDOWN), ...patch.breakdown };
      const next: RideDefinition = {
        id: def.id,
        ratings: patch.ratings === undefined ? def.ratings : { ...def.ratings, ...patch.ratings },
        capacity: patch.capacity === undefined ? def.capacity : Math.max(1, Math.floor(patch.capacity)),
        loadSeconds: patch.loadSeconds === undefined ? def.loadSeconds : Math.max(0, patch.loadSeconds),
        rideSeconds: patch.rideSeconds === undefined ? def.rideSeconds : Math.max(0, patch.rideSeconds),
        unloadSeconds: patch.unloadSeconds === undefined ? def.unloadSeconds : Math.max(0, patch.unloadSeconds),
        breakdown,
      };
      validateDefinition(next);
      state.def = next;
      defs[index] = next;
      state.schedule.retune("loading", secondsOf(next, "loading"));
      state.schedule.retune("riding", secondsOf(next, "riding"));
      state.schedule.retune("unloading", secondsOf(next, "unloading"));
      state.schedule.retune("broken", secondsOf(next, "broken"));
      revision += 1;
      return true;
    },
    stats() {
      let broken = 0;
      let riders = 0;
      let queued = 0;
      let boarded = 0;
      let cycles = 0;
      let breakdowns = 0;
      let spend = 0;
      for (const state of rides) {
        if (state.schedule.state() === "broken") broken += 1;
        riders += state.riders.length;
        queued += state.queue.size();
        boarded += state.boarded;
        cycles += state.cycles;
        breakdowns += state.breakdowns;
        spend += state.repairSpend + state.serviceSpend;
      }
      return { rides: rides.length, broken, riders, queued, boarded, cycles, breakdowns, spend, ticks, slowestTickMs };
    },
    snapshot() {
      return {
        elapsed,
        rides: rides.map((state) => ({
          definition: cloneDefinition(state.def),
          phase: state.schedule.state(),
          timer: state.schedule.remainingSeconds() ?? 0,
          riders: [...state.riders],
          cycles: state.cycles,
          wear: state.wear,
          breakdowns: state.breakdowns,
          repairSpend: state.repairSpend,
          serviceSpend: state.serviceSpend,
          boarded: state.boarded,
          queue: state.queue.snapshot(),
        })),
      };
    },
    restore(next) {
      rides.length = 0;
      stateOf.clear();
      defs.length = 0;
      ids.length = 0;
      for (const saved of next.rides) {
        const def = cloneDefinition(saved.definition);
        const schedule = rideSchedule(def);
        const at = RIDE_PHASE_ORDER.indexOf(saved.phase);
        const index = at < 0 ? 0 : at;
        const duration = secondsOf(def, RIDE_PHASE_ORDER[index] ?? "idle");
        const timer = Number.isFinite(saved.timer) ? Math.max(0, saved.timer) : 0;
        schedule.restore({ index, elapsedSeconds: Math.max(0, duration - timer), ended: false });
        const state: RideState = {
          def,
          queue: createWaitQueue({ seedServiceSeconds }),
          schedule,
          riders: [...saved.riders],
          cycles: saved.cycles,
          wear: saved.wear,
          breakdowns: saved.breakdowns,
          repairSpend: saved.repairSpend,
          serviceSpend: saved.serviceSpend,
          boarded: saved.boarded,
        };
        state.queue.restore(saved.queue);
        rides.push(state);
        defs.push(def);
        ids.push(def.id);
        stateOf.set(def.id, state);
      }
      elapsed = Number.isFinite(next.elapsed) ? next.elapsed : 0;
      revision += 1;
    },
    dispose() {
      unregister?.();
    },
  };
}

/** The rating scale a park's taste curves are normalized against. */
export interface RideRatingRange {
  readonly excitementMax: number;
  readonly intensityMax: number;
  readonly nauseaMax: number;
}

export const DEFAULT_RIDE_RATING_RANGE: RideRatingRange = { excitementMax: 10, intensityMax: 10, nauseaMax: 10 };

export const DEFAULT_RIDE_FUN_CURVE: ResponseCurve = { kind: "linear", from: 0.15, to: 0.9 };

export interface RideTaste {
  readonly intensityComfort: number;
  readonly nauseaComfort: number;
  /** Seconds of queue this guest accepts; at that wait a ride's appeal is spent. */
  readonly queueTolerance: number;
}

export interface RideChoicePolicy {
  readonly range?: RideRatingRange;
  readonly funNeed?: string;
  readonly funCurve?: ResponseCurve;
  readonly funWeight?: number;
}

/**
 * Appeal that rises with the rating: `0` at zero, `1` at `max`. Response curves sample a `0..1`
 * satisfaction, so a rating is normalized against the park's own scale first.
 */
function risesTo(rating: number, max: number): number {
  if (!(max > 0)) return 1;
  return sampleResponseCurve({ kind: "linear", from: 1, to: 0 }, clamp(rating / max, 0, 1));
}

function comfortFit(rating: number, comfort: number, max: number): number {
  if (!(max > comfort)) return 1;
  return sampleResponseCurve(
    { kind: "linear", from: clamp(comfort / max, 0, 1), to: 1 },
    clamp(rating / max, 0, 1),
  );
}

/** @capability ride-appeal how much one guest likes one ride, from its ratings and their taste */
export function rideAppeal(ratings: RideRatings, taste: RideTaste, range: RideRatingRange = DEFAULT_RIDE_RATING_RANGE): number {
  return (
    risesTo(ratings.excitement, range.excitementMax) *
    comfortFit(ratings.intensity, taste.intensityComfort, range.intensityMax) *
    comfortFit(ratings.nausea, taste.nauseaComfort, range.nauseaMax)
  );
}

/**
 * Compile a guest's taste and the park's ride data into utility options, so the guest's pick comes
 * from `createUtilityBrain` like every other decision it makes. Ride choice is one more set of
 * options a guest can score, not a separate scoring function.
 *
 * @capability ride-choice guests pick rides by taste and queue tolerance through the utility brain
 */
export function rideChoiceOptions(
  rides: readonly RideDefinition[],
  taste: RideTaste,
  policy: RideChoicePolicy = {},
): UtilityOption[] {
  const range = policy.range ?? DEFAULT_RIDE_RATING_RANGE;
  const terms =
    policy.funNeed === undefined
      ? {}
      : { terms: [{ need: policy.funNeed, curve: policy.funCurve ?? DEFAULT_RIDE_FUN_CURVE, weight: policy.funWeight ?? 1 }] };
  return rides.map((ride) => ({ id: ride.id, base: rideAppeal(ride.ratings, taste, range), ...terms }));
}

export interface RideWaitSource {
  rideIds(): readonly string[];
  waitSeconds(id: string): number;
}

/**
 * Cost each ride by the wait its own line reports, so a guest weighs a ride by seconds in line
 * rather than by a fixed order. `out` is reused for the array; the candidate records are not.
 *
 * @capability ride-choice guests pick rides by taste and queue tolerance through the utility brain
 */
export function rideChoiceCandidates(source: RideWaitSource, out: UtilityCandidate[] = []): UtilityCandidate[] {
  out.length = 0;
  for (const id of source.rideIds()) out.push({ option: id, cost: source.waitSeconds(id) });
  return out;
}

/**
 * Score points per second of queue wait: a guest's own tolerance is the denominator. A guest who
 * merges rides into a brain that also scores food and exits uses this as its `costWeight`.
 *
 * @capability ride-choice guests pick rides by taste and queue tolerance through the utility brain
 */
export function rideQueueCostWeight(taste: RideTaste): number {
  return 1 / Math.max(taste.queueTolerance, 1e-3);
}

function validateTaste(taste: RideTaste): void {
  for (const field of ["intensityComfort", "nauseaComfort", "queueTolerance"] as const) {
    if (!Number.isFinite(taste[field]) || taste[field] < 0) {
      throw new Error(`ride taste needs a non-negative ${field}, got ${taste[field]}`);
    }
  }
}

export interface RideChooserSnapshot {
  taste: RideTaste;
  brain: UtilityBrainSnapshot;
}

export interface RideChooserConfig {
  readonly system: RideSystem;
  readonly taste: RideTaste;
  readonly needs: NeedSet;
  readonly policy?: RideChoicePolicy;
  /** Score margin a rival ride must clear before the guest changes their mind. Default `0.05`. */
  readonly switchMargin?: number;
  /** Seconds a pick is held before a rival may replace it. Default `0`. */
  readonly minHoldSeconds?: number;
  readonly rng?: () => number;
  readonly devtoolsName?: string;
}

/**
 * One guest's ride choice over one park: taste becomes utility options, each ride is costed by its
 * own line's wait, and the pick comes from the shared utility brain — so the same brain that picks
 * food picks rides, and a guest's queue tolerance is a weight rather than a rule.
 */
export interface RideChooser {
  choose(): string | null;
  scoreOf(rideId: string): number;
  advance(dt: number): void;
  setTaste(taste: RideTaste): void;
  snapshot(): RideChooserSnapshot;
  restore(next: RideChooserSnapshot): void;
  dispose(): void;
}

/**
 * Create one guest's ride choice over a park. Options are rebuilt when the park is retuned, so a
 * coaster whose track changes its ratings is re-scored without rebuilding the guest.
 *
 * @capability ride-choice guests pick rides by taste and queue tolerance through the utility brain
 */
export function createRideChooser(config: RideChooserConfig): RideChooser {
  const system = config.system;
  let taste: RideTaste = { ...config.taste };
  validateTaste(taste);

  const candidates: UtilityCandidate[] = [];
  let brain: UtilityBrain | null = null;
  let builtRevision = -1;

  function build(): UtilityBrain {
    const held = brain?.chosen() ?? null;
    brain?.dispose();
    const options = rideChoiceOptions(system.definitions(), taste, config.policy);
    const next = createUtilityBrain({
      needs: config.needs,
      options,
      costWeight: rideQueueCostWeight(taste),
      switchMargin: config.switchMargin,
      minHoldSeconds: config.minHoldSeconds,
      rng: config.rng,
      devtoolsName: config.devtoolsName,
    });
    brain = next;
    builtRevision = system.revision();
    if (held !== null && options.some((option) => option.id === held)) next.decide([{ option: held, cost: 0 }]);
    return next;
  }

  function active(): UtilityBrain {
    if (brain === null || system.revision() !== builtRevision) return build();
    return brain;
  }

  return {
    choose() {
      const pick = active().decide(rideChoiceCandidates(system, candidates));
      return pick.option;
    },
    scoreOf: (rideId) => active().scoreOf(rideId),
    advance(dt) {
      active().advance(dt);
    },
    setTaste(next) {
      validateTaste(next);
      taste = { ...next };
      build();
    },
    snapshot: () => ({ taste: { ...taste }, brain: (brain ?? build()).snapshot() }),
    restore(next) {
      taste = { ...next.taste };
      build().restore(next.brain);
    },
    dispose() {
      brain?.dispose();
      brain = null;
    },
  };
}
