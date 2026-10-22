import { devtools } from "../devtools/devtools";
import { restoreRng, rngStateOf, seededRng } from "../random/rng";
import { lanePoseInto, type LaneGraph, type LaneIntersection, type LaneSpan } from "./laneGraph";
import type { Waypoint } from "./pathFollow";

const EPSILON = 1e-9;
const TWO_PI = Math.PI * 2;

/** One car's live state, as a renderer, a game or the devtools overlay reads it. */
export interface TrafficCarView {
  id: string;
  laneId: string;
  /** Arc, in metres, along the lane. */
  arc: number;
  position: Waypoint;
  /** Yaw of travel, matching engine `rotationY`. */
  heading: number;
  /** World units per second. */
  speed: number;
  state: "driving" | "boxed" | "parked";
  /** Parking spot held or reserved, while parking. */
  spotId: string | null;
  /** Stable integer for the game's model or colour choice; derived from the injected RNG. */
  variant: number;
}

/** Caller-supplied exit choice at a junction: return one of `options`, or `null` to leave the graph. */
export type TrafficRoutePolicy = (context: {
  carId: string;
  laneId: string;
  nodeId: string;
  /** Outbound lanes that are not the lane the car arrived on, sorted by id. */
  options: readonly string[];
}) => string | null;

/** Every per-car behaviour number, retunable in play. */
export interface TrafficTuning {
  /** Body length, metres; sets the spacing a follower keeps. Default 4.4. */
  carLength: number;
  /** Body width, metres — one lane-change blend and the fallback lane spacing. Default 1.9. */
  carWidth: number;
  /** Acceleration while unobstructed, world units/s². Default 2.4. */
  maxAccel: number;
  /** Comfortable braking, world units/s². Default 3.2. */
  comfortBrake: number;
  /** Bumper-to-bumper gap at a standstill, metres. Default 1.6. */
  minGap: number;
  /** Time headway a follower keeps, seconds. Default 1.25. */
  timeHeadway: number;
  /** Multiplier on every lane's speed limit. Default 1. */
  speedScale: number;
  /** Free space the exit lane must show before a car is let into an intersection, metres. Default 6. */
  boxClearance: number;
  /** Seconds after a car clears an intersection before the next may enter. Default 0.55. */
  boxCooldownSeconds: number;
  /** Seconds a lane change takes to blend across. Default 1.2. */
  laneChangeSeconds: number;
  /** Seconds a car must be held up by a slower leader before it looks for another lane. Default 1.8. */
  laneChangeBlockedSeconds: number;
  /** Seconds between lane changes by one car. Default 4. */
  laneChangeCooldown: number;
  /** Clear window a lane change needs, as a multiple of the car's own length, each side. Default 1.6. */
  laneChangeGapFactor: number;
  /** Free stretch an entry lane must show before a car spawns on it, metres. Default 14. */
  spawnGap: number;
  /** Fraction of the lane limit a spawned car starts at. Default 0.55. */
  spawnSpeedFactor: number;
  /** Most cars spawned or retired in one tick. Default 3. */
  fleetPerTick: number;
  /**
   * Seconds a car may stay stopped before the deadlock watch reports it. A red light or a queue is
   * under this; a permanent stop is not. Default 60.
   */
  watchSeconds: number;
  /** Fraction of the lane limit a car may carry into a turn sharper than 45°. Default 0.55. */
  turnSpeedFactor: number;
}

/** Counters a devtools probe, a HUD or a test reads. */
export interface TrafficStats {
  cars: number;
  parked: number;
  boxed: number;
  /** Cars holding at a stop line. */
  waiting: number;
  /** Cars added by the demand controller. */
  spawned: number;
  /** Cars that reached the end of the graph. */
  exited: number;
  /** Cars the demand controller removed to shrink the fleet. */
  retired: number;
  laneChanges: number;
  parks: number;
  /** Cars the deadlock watch has reported (stopped longer than `watchSeconds`). */
  stalls: number;
  /** Longest single stop any car has made, seconds — a red light or a queue. */
  maxStillSeconds: number;
  /** Longest stop a car made with clear road ahead — the deadlock measure. */
  maxDeadlockSeconds: number;
  ticks: number;
  /** Slowest single `tick` seen so far, milliseconds. */
  slowestTickMs: number;
  /** Mean speed of every moving car, world units per second. */
  meanSpeed: number;
}

/** An intersection's signal right now: which phase is green and for how long. */
export interface TrafficSignalState {
  node: string;
  phase: number;
  state: "green" | "yellow" | "red";
  /** Seconds this phase has left, including its yellow and all-red. */
  remaining: number;
  /** In-lanes this green phase serves. */
  lanes: readonly string[];
}

/** Serializable traffic state: the fleet, the parking occupancy, the signal clocks and the demand. */
export interface TrafficSnapshot {
  tunables: TrafficTuning;
  demand: number;
  counter: number;
  rng: number | null;
  cars: {
    id: string;
    laneId: string;
    arc: number;
    speed: number;
    maxSpeed: number;
    desiredSpeed: number;
    state: "driving" | "boxed" | "parked";
    cleared: boolean;
    nextLane: string | null;
    spotId: string | null;
    lateral: number;
    lateralRate: number;
    changeCooldown: number;
    blockedSeconds: number;
    stillSeconds: number;
    deadlockSeconds: number;
    waitingSeconds: number;
    stalled: boolean;
    variant: number;
  }[];
  spots: { id: string; carId: string | null }[];
  intersections: { node: string; elapsed: number; cooldown: number; holder: string | null }[];
  counters: {
    spawned: number;
    exited: number;
    retired: number;
    laneChanges: number;
    parks: number;
    stalls: number;
    ticks: number;
    maxStillSeconds: number;
    maxDeadlockSeconds: number;
    slowestTickMs: number;
  };
}

/** Everything {@link createTraffic} needs: the graph, the injected generator and the caller's policies. */
export interface TrafficOptions {
  graph: LaneGraph;
  /** Seed for the injected generator that varies cars. Same seed, same fleet. */
  seed?: string | number;
  /** Inject a generator instead of seeding one; its cursor is snapshotted when it has one. */
  rng?: () => number;
  tuning?: Partial<TrafficTuning>;
  /** Exit choice at a junction. Omit for "least turn, never straight back". */
  route?: TrafficRoutePolicy;
  /** Initial fleet target; the caller moves this with the time of day. Omit to keep the fleet caller-driven. */
  demand?: number;
  /** Prefix for demand-spawned ids. Default `"traffic"`. */
  idPrefix?: string;
  /** Register a devtools probe under this name so the perf overlay shows traffic counters. */
  devtoolsName?: string;
}

/**
 * Traffic on an authored lane graph: cars follow lane spans with IDM car-following, hold at stop
 * lines, cross intersections under a signal phase or first-come right-of-way, change lanes, park in
 * authored spots, and grow or shrink with the caller's `demand`. Deterministic — cars advance in
 * insertion order, ties break on id, and the injected generator is the only source of variety.
 * Bounded per tick: one pass over the cars, one sorted pass per occupied lane, no path search.
 */
export interface Traffic {
  /** Add a car at the start of a lane. False when the id exists or the lane is unknown. */
  add(id: string, spec: { laneId: string; arc?: number; speed?: number }): boolean;
  remove(id: string): boolean;
  has(id: string): boolean;
  count(): number;
  ids(): readonly string[];
  car(id: string): TrafficCarView | null;
  /** Visit every car in insertion order — one view record per car, no snapshot copy. */
  forEachCar(visit: (car: Readonly<TrafficCarView>) => void): void;
  /** Advance the whole fleet by `dt` seconds. */
  tick(dt: number): void;
  retune(patch: Partial<TrafficTuning>): void;
  /**
   * Fleet size the demand controller drives towards — a time-of-day count the caller computes, never a
   * built-in curve. `-1` turns the controller off and leaves the fleet entirely caller-driven.
   */
  setDemand(count: number): void;
  /** Current fleet target, or `-1` when the fleet is caller-driven. */
  demand(): number;
  /** Send a car to a parking spot on the lane it is already on. False when the spot is taken. */
  park(id: string, spotId?: string): boolean;
  /** Give up a parked spot and rejoin the lane. */
  releaseParking(id: string): boolean;
  /** Id of the car holding or reserving a spot, or null. */
  spotOwner(spotId: string): string | null;
  signal(nodeId: string): TrafficSignalState | null;
  stats(): TrafficStats;
  snapshot(): TrafficSnapshot;
  restore(next: TrafficSnapshot): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

const DEFAULT_TUNING: TrafficTuning = {
  carLength: 4.4,
  carWidth: 1.9,
  maxAccel: 2.4,
  comfortBrake: 3.2,
  minGap: 1.6,
  timeHeadway: 1.25,
  speedScale: 1,
  boxClearance: 6,
  boxCooldownSeconds: 0.55,
  laneChangeSeconds: 1.2,
  laneChangeBlockedSeconds: 1.8,
  laneChangeCooldown: 4,
  laneChangeGapFactor: 1.6,
  spawnGap: 14,
  spawnSpeedFactor: 0.55,
  fleetPerTick: 3,
  watchSeconds: 60,
  turnSpeedFactor: 0.55,
};

interface Car {
  id: string;
  laneId: string;
  arc: number;
  speed: number;
  maxSpeed: number;
  desiredSpeed: number;
  state: "driving" | "boxed" | "parked";
  cleared: boolean;
  nextLane: string | null;
  spotId: string | null;
  lateral: number;
  lateralRate: number;
  changeCooldown: number;
  blockedSeconds: number;
  stillSeconds: number;
  deadlockSeconds: number;
  waitingSeconds: number;
  stalled: boolean;
  variant: number;
  queueIndex: number;
  x: number;
  y: number;
  z: number;
  heading: number;
}

interface IntersectionState {
  lane: LaneIntersection;
  phases: readonly (readonly string[])[];
  phaseOfLane: Map<string, number>;
  elapsed: number;
  cooldown: number;
  holder: Car | null;
  /** Waiting cars collected during this tick's movement pass. */
  waiting: Car[];
  signal: TrafficSignalState | null;
}

function resolveTuning(base: TrafficTuning, patch: Partial<TrafficTuning> | undefined): TrafficTuning {
  if (patch === undefined) return { ...base };
  const next = { ...base };
  for (const key of Object.keys(base) as (keyof TrafficTuning)[]) {
    const value = patch[key];
    if (typeof value === "number" && Number.isFinite(value)) next[key] = Math.max(0, value);
  }
  next.timeHeadway = Math.max(0.05, next.timeHeadway);
  next.maxAccel = Math.max(0.05, next.maxAccel);
  next.fleetPerTick = Math.max(1, Math.floor(next.fleetPerTick));
  return next;
}

/** Shortest signed difference between two headings, radians. */
function headingDelta(from: number, to: number): number {
  let delta = (to - from) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta < -Math.PI) delta += TWO_PI;
  return delta;
}

/**
 * Intelligent-driver-model acceleration for the tightest constraint ahead: `gap` metres to a leader
 * moving at `leaderSpeed`. Free-flowing at zero gap-to-nothing, hard braking when the gap closes.
 */
function idmAccel(
  speed: number,
  desired: number,
  gap: number,
  leaderSpeed: number,
  tuning: TrafficTuning,
  minGap = tuning.minGap,
): number {
  const free = 1 - Math.pow(speed / Math.max(EPSILON, desired), 4);
  if (!Number.isFinite(gap)) return tuning.maxAccel * free;
  const closing = speed - leaderSpeed;
  const desiredGap =
    minGap + speed * tuning.timeHeadway + (speed * closing) / (2 * Math.sqrt(tuning.maxAccel * tuning.comfortBrake));
  const interaction = gap > EPSILON ? (desiredGap / gap) ** 2 : 4;
  return tuning.maxAccel * (free - interaction);
}

/**
 * Traffic for an authored lane graph (see {@link createLaneGraph}).
 *
 * @capability traffic lane-graph traffic with car following, signals, right-of-way, lane changes and parking
 */
export function createTraffic(options: TrafficOptions): Traffic {
  const graph = options.graph;
  const laneOf = new Map<string, LaneSpan>();
  for (const laneId of graph.laneIds()) laneOf.set(laneId, graph.lane(laneId)!);
  const spotOf = new Map(graph.spots().map((spot) => [spot.id, spot]));
  const spotOwner = new Map<string, string>();

  let tuning = resolveTuning(DEFAULT_TUNING, options.tuning);
  const rng = options.rng ?? seededRng(options.seed ?? "traffic");
  const idPrefix = options.idPrefix ?? "traffic";
  const route = options.route;
  const cars: Car[] = [];
  const carOf = new Map<string, number>();
  const laneCars = new Map<string, Car[]>();
  for (const laneId of laneOf.keys()) laneCars.set(laneId, []);
  const laneFirst = new Map<string, { arc: number; half: number }>();
  const intersections = new Map<string, IntersectionState>();

  /**
   * Default phase program: one green per line of travel, so opposite approaches share a window. The
   * box stays exclusive, so a crossing movement inside a shared phase still has to wait its turn.
   */
  function defaultPhases(inter: LaneIntersection): string[][] {
    const buckets = new Map<number, string[]>();
    for (const laneId of inter.inLanes) {
      const heading = graph.heading(laneId, 0);
      const axis = ((heading % Math.PI) + Math.PI) % Math.PI;
      const key = Math.round(axis / (Math.PI / 4));
      const bucket = buckets.get(key);
      if (bucket === undefined) buckets.set(key, [laneId]);
      else bucket.push(laneId);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, laneIds]) => laneIds.sort());
  }
  for (const lane of graph.intersections()) {
    const phases = lane.signal?.phases ?? defaultPhases(lane);
    const phaseOfLane = new Map<string, number>();
    phases.forEach((phase, index) => {
      for (const laneId of phase) if (!phaseOfLane.has(laneId)) phaseOfLane.set(laneId, index);
    });
    intersections.set(lane.node, {
      lane,
      phases,
      phaseOfLane,
      elapsed: 0,
      cooldown: 0,
      holder: null,
      waiting: [],
      signal: null,
    });
  }
  /** Which intersection a lane ends at, when its end is a crossing rather than a plain continuation. */
  const intersectionAtEnd = new Map<string, IntersectionState>();
  for (const lane of laneOf.values()) {
    // A lane marked `exit` hands its cars back to the caller at the far end, so there is no crossing
    // to negotiate there.
    if (lane.exit) continue;
    const state = intersections.get(lane.to);
    if (state !== undefined) intersectionAtEnd.set(lane.id, state);
  }

  let demand = options.demand === undefined ? -1 : Math.max(0, Math.floor(options.demand));
  let counter = 0;
  let spawned = 0;
  let exited = 0;
  let retired = 0;
  let laneChanges = 0;
  let parks = 0;
  let stalls = 0;
  let ticks = 0;
  let maxStillSeconds = 0;
  let maxDeadlockSeconds = 0;
  let slowestTickMs = 0;
  const pose = { x: 0, y: 0, z: 0, heading: 0 };

  function probeLine(): string {
    let parked = 0;
    let boxed = 0;
    let topStill = 0;
    for (const car of cars) {
      if (car.state === "parked") parked += 1;
      if (car.state === "boxed") boxed += 1;
      if (car.stillSeconds > topStill) topStill = car.stillSeconds;
    }
    return `${cars.length} cars ${parked} parked ${boxed} boxed ${spawned} spawned ${exited} exited ${stalls} stalls ${topStill.toFixed(1)} s longest stop ${slowestTickMs.toFixed(2)} ms slowest`;
  }

  const unregister = options.devtoolsName === undefined ? null : devtools.probes.register(options.devtoolsName, () => probeLine());

  function indexOf(id: string): number | undefined {
    return carOf.get(id);
  }

  function removeAt(index: number): Car {
    const car = cars[index]!;
    const last = cars.pop()!;
    carOf.delete(car.id);
    if (index < cars.length) {
      cars[index] = last;
      carOf.set(last.id, index);
    }
    if (car.spotId !== null) {
      spotOwner.delete(car.spotId);
      car.spotId = null;
    }
    return car;
  }

  function applyPose(car: Car): void {
    const lane = laneOf.get(car.laneId);
    if (lane === undefined) return;
    lanePoseInto(lane, car.arc, car.lateral, pose);
    car.x = pose.x;
    car.y = pose.y;
    car.z = pose.z;
    car.heading = pose.heading;
  }

  function createCar(id: string, laneId: string, arc: number, speed: number, variant: number): Car | null {
    const lane = laneOf.get(laneId);
    if (lane === undefined) return null;
    const car: Car = {
      id,
      laneId,
      arc: Math.max(0, Math.min(arc, lane.length)),
      speed: Math.max(0, speed),
      maxSpeed: Math.max(1, lane.speed * tuning.speedScale),
      desiredSpeed: 0,
      state: "driving",
      cleared: false,
      nextLane: null,
      spotId: null,
      lateral: 0,
      lateralRate: 0,
      changeCooldown: 0,
      blockedSeconds: 0,
      stillSeconds: 0,
      deadlockSeconds: 0,
      waitingSeconds: 0,
      stalled: false,
      variant,
      queueIndex: -1,
      x: 0,
      y: 0,
      z: 0,
      heading: 0,
    };
    car.desiredSpeed = car.maxSpeed * (0.85 + rng() * 0.3);
    applyPose(car);
    cars.push(car);
    carOf.set(id, cars.length - 1);
    return car;
  }

  function phaseSignals(dt: number): void {
    for (const state of intersections.values()) {
      state.elapsed += dt;
      if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - dt);
      const lane = state.lane;
      const program = lane.signal;
      if (program === null || state.phases.length === 0) {
        state.signal = null;
        continue;
      }
      const green = Math.max(0.1, program.greenSeconds);
      const yellow = Math.max(0, program.yellowSeconds);
      const allRed = Math.max(0, program.allRedSeconds ?? 0);
      const slot = green + yellow + allRed;
      const cycle = slot * state.phases.length;
      const local = (((state.elapsed + lane.offsetSeconds) % cycle) + cycle) % cycle;
      const index = Math.min(state.phases.length - 1, Math.floor(local / slot));
      const within = local - index * slot;
      const stateName = within < green ? "green" : within < green + yellow ? "yellow" : "red";
      state.signal = {
        node: lane.node,
        phase: index,
        state: stateName,
        remaining: slot - within,
        lanes: state.phases[index] ?? [],
      };
    }
  }

  function noteLaneFirst(laneId: string, arc: number): void {
    const current = laneFirst.get(laneId);
    const half = tuning.carLength / 2;
    if (current === undefined || arc < current.arc) laneFirst.set(laneId, { arc, half });
  }

  /** Outbound options at a lane's end, never the lane the car arrived on unless it is the only one. */
  function exitOptions(lane: LaneSpan): string[] {
    const out = graph.outLanes(lane.to).filter((id) => {
      const candidate = laneOf.get(id);
      return candidate !== undefined && candidate.to !== lane.from;
    });
    if (out.length > 0) return out;
    return graph.outLanes(lane.to).slice();
  }

  function resolveExit(car: Car, lane: LaneSpan): string | null {
    const options = exitOptions(lane);
    if (options.length === 0) return null;
    if (route !== undefined) {
      const chosen = route({ carId: car.id, laneId: lane.id, nodeId: lane.to, options });
      if (chosen === null) return null;
      if (options.includes(chosen)) return chosen;
    }
    const heading = graph.heading(lane.id, lane.length);
    let best = options[0]!;
    let bestDot = -Infinity;
    for (const optionId of options) {
      const dot = Math.cos(headingDelta(heading, graph.heading(optionId, 0)));
      if (dot > bestDot + 1e-9 || (Math.abs(dot - bestDot) <= 1e-9 && optionId < best)) {
        bestDot = dot;
        best = optionId;
      }
    }
    return best;
  }

  function exitClear(exitLaneId: string, speed: number): boolean {
    const first = laneFirst.get(exitLaneId);
    if (first === undefined) return true;
    const room = first.arc - first.half - tuning.carLength / 2;
    return room >= Math.max(tuning.minGap, tuning.boxClearance * Math.min(1, Math.max(0.4, speed / 10)));
  }

  function stopArcOf(lane: LaneSpan, state: IntersectionState): number {
    return Math.max(0, lane.length - state.lane.stopLine);
  }

  function moveCars(dt: number): void {
    for (const car of cars) {
      if (car.state === "parked") {
        car.speed = 0;
        car.stillSeconds += dt;
        continue;
      }
      const lane = laneOf.get(car.laneId);
      if (lane === undefined) continue;
      const state = intersectionAtEnd.get(car.laneId) ?? null;
      let hardArc = Number.POSITIVE_INFINITY;
      let limitSpeed = 0;
      let atLine = false;
      let gapBias = tuning.minGap;

      const list = laneCars.get(car.laneId);
      if (list !== undefined && car.queueIndex >= 0) {
        const leader = list[car.queueIndex + 1];
        if (leader !== undefined) {
          hardArc = leader.arc - tuning.carLength - 0.02;
          limitSpeed = leader.speed;
        }
      }

      if (state !== null && !car.cleared) {
        const stopArc = stopArcOf(lane, state);
        if (stopArc < hardArc) {
          hardArc = stopArc;
          limitSpeed = 0;
        }
        if (car.arc >= stopArc - tuning.minGap - 0.5) {
          state.waiting.push(car);
          car.waitingSeconds += dt;
          atLine = true;
        }
      } else if (car.cleared) {
        car.waitingSeconds = 0;
      }

      if (car.spotId !== null) {
        const spot = spotOf.get(car.spotId);
        if (spot !== undefined && spot.lane === car.laneId && spot.arc < hardArc) {
          hardArc = spot.arc;
          limitSpeed = 0;
          // A car parks against the kerb, not a car's length short of it.
          gapBias = 0.05;
        }
      }

      const target = Math.min(car.desiredSpeed, lane.speed * tuning.speedScale);
      const gap = hardArc - car.arc;
      const accel = idmAccel(car.speed, target, gap, limitSpeed, tuning, gapBias);
      car.speed = Math.max(0, car.speed + accel * dt);
      let arc = car.arc + car.speed * dt;
      if (arc > hardArc) {
        arc = Math.max(car.arc, hardArc);
        car.speed = Math.min(car.speed, limitSpeed);
      }
      if (arc > lane.length) arc = lane.length;

      if (car.speed < 0.15) {
        car.stillSeconds += dt;
        if (car.stillSeconds > maxStillSeconds) maxStillSeconds = car.stillSeconds;
        // A stopped car only counts as a deadlock when the road ahead is actually clear: a car
        // holding at its stop line or tucked in behind another is waiting, not stuck.
        const leaderGap = Number.isFinite(hardArc) && hardArc < lane.length ? hardArc - arc : Number.POSITIVE_INFINITY;
        const clearAhead = atLine ? false : leaderGap > tuning.minGap + 1.5;
        if (clearAhead) {
          car.deadlockSeconds += dt;
          if (car.deadlockSeconds > maxDeadlockSeconds) maxDeadlockSeconds = car.deadlockSeconds;
          if (!car.stalled && car.deadlockSeconds > tuning.watchSeconds) {
            car.stalled = true;
            stalls += 1;
          }
        } else if (car.stalled) {
          car.stalled = false;
          car.deadlockSeconds = 0;
        } else {
          car.deadlockSeconds = 0;
        }
      } else {
        car.stillSeconds = 0;
        car.deadlockSeconds = 0;
        car.stalled = false;
      }

      const blocked =
        list !== undefined && car.queueIndex >= 0 && list[car.queueIndex + 1] !== undefined && car.speed < target * 0.6;
      car.blockedSeconds = blocked ? car.blockedSeconds + dt : 0;
      if (car.changeCooldown > 0) car.changeCooldown = Math.max(0, car.changeCooldown - dt);

      car.arc = arc;
      if (car.lateral > EPSILON) {
        car.lateral = Math.max(0, car.lateral - car.lateralRate * dt);
      }
      applyPose(car);
    }
  }

  function grantIntersections(): void {
    for (const state of intersections.values()) {
      if (state.waiting.length === 0) continue;
      if (state.holder !== null || state.cooldown > 0) continue;
      const signal = state.signal;
      const eligible: Car[] = [];
      for (const car of state.waiting) {
        if (car.cleared) continue;
        if (signal !== null) {
          const phase = state.phaseOfLane.get(car.laneId);
          if (phase === undefined) continue;
          if (signal.state !== "green" || signal.phase !== phase) continue;
        }
        eligible.push(car);
      }
      if (eligible.length === 0) continue;
      eligible.sort(
        (a, b) =>
          b.waitingSeconds - a.waitingSeconds ||
          (a.laneId < b.laneId ? -1 : a.laneId > b.laneId ? 1 : 0) ||
          (a.id < b.id ? -1 : 1),
      );
      for (const car of eligible) {
        const lane = laneOf.get(car.laneId);
        if (lane === undefined) continue;
        const next = resolveExit(car, lane);
        if (next === null) continue;
        if (!exitClear(next, car.speed)) continue;
        car.cleared = true;
        car.nextLane = next;
        car.state = "boxed";
        car.waitingSeconds = 0;
        state.holder = car;
        break;
      }
    }
  }

  function transferCars(): void {
    for (let index = cars.length - 1; index >= 0; index -= 1) {
      const car = cars[index];
      if (car === undefined || car.state === "parked") continue;
      const lane = laneOf.get(car.laneId);
      if (lane === undefined) continue;
      if (car.arc < lane.length - 1e-6) continue;
      const state = intersectionAtEnd.get(car.laneId) ?? null;
      if (state !== null && !car.cleared) continue;
      if (lane.exit) {
        removeAt(index);
        exited += 1;
        continue;
      }
      const nextId = car.nextLane ?? resolveExit(car, lane);
      if (nextId === null) {
        removeAt(index);
        exited += 1;
        continue;
      }
      const turn = Math.abs(headingDelta(graph.heading(lane.id, lane.length), graph.heading(nextId, 0)));
      if (turn > Math.PI / 4) car.speed = Math.min(car.speed, car.maxSpeed * tuning.turnSpeedFactor);
      // A car always enters its exit lane at the junction end; `exitClear` already guaranteed the
      // room for it, so there is no rear-most car to tuck behind here.
      car.laneId = nextId;
      car.arc = 0;
      car.cleared = false;
      car.nextLane = null;
      car.state = "driving";
      noteLaneFirst(nextId, car.arc);
      if (state !== null) {
        if (state.holder === car) state.holder = null;
        state.cooldown = tuning.boxCooldownSeconds;
      }
      if (car.spotId !== null) {
        const spot = spotOf.get(car.spotId);
        if (spot === undefined || spot.lane !== car.laneId) {
          spotOwner.delete(car.spotId);
          car.spotId = null;
        }
      }
      applyPose(car);
    }
  }

  function changeLanes(): void {
    for (const car of cars) {
      if (car.state !== "driving" || car.cleared) continue;
      if (car.changeCooldown > 0 || car.blockedSeconds < tuning.laneChangeBlockedSeconds) continue;
      if (car.spotId !== null) continue;
      const lane = laneOf.get(car.laneId);
      if (lane === undefined) continue;
      const window = tuning.carLength * tuning.laneChangeGapFactor;
      for (const neighbourId of [lane.left, lane.right]) {
        if (neighbourId === null) continue;
        const neighbour = laneOf.get(neighbourId);
        if (neighbour === undefined) continue;
        const arc = graph.project(neighbourId, car.x, car.z);
        const headingDot = Math.cos(
          Math.abs(headingDelta(graph.heading(car.laneId, car.arc), graph.heading(neighbourId, arc))),
        );
        if (headingDot < 0.7) continue;
        const list = laneCars.get(neighbourId);
        if (list !== undefined && list.length > 0) {
          let clear = true;
          for (const other of list) {
            if (Math.abs(other.arc - arc) < window + tuning.carLength) {
              clear = false;
              break;
            }
          }
          if (!clear) continue;
        }
        const nextPose = graph.pose(neighbourId, arc);
        if (nextPose === null) continue;
        // Blend across from the old centerline: the lateral offset is the car's current position
        // measured against the lane it is joining, so the switch never moves it in world space.
        const lateral =
          (car.x - nextPose.position[0]) * Math.cos(nextPose.heading) -
          (car.z - nextPose.position[2]) * Math.sin(nextPose.heading);
        if (Math.abs(lateral) > neighbour.width * 2) continue;
        car.laneId = neighbourId;
        car.arc = arc;
        car.lateral = lateral;
        car.lateralRate = tuning.laneChangeSeconds > 0 ? lateral / tuning.laneChangeSeconds : lateral;
        car.changeCooldown = tuning.laneChangeCooldown;
        car.blockedSeconds = 0;
        laneChanges += 1;
        applyPose(car);
        break;
      }
    }
  }

  function settleParking(): void {
    for (const car of cars) {
      if (car.spotId === null || car.state === "parked") continue;
      const spot = spotOf.get(car.spotId);
      if (spot === undefined || spot.lane !== car.laneId) continue;
      if (car.arc >= spot.arc - 0.6 && car.speed < 0.35) {
        car.state = "parked";
        car.speed = 0;
        car.arc = spot.arc;
        spotOwner.set(spot.id, car.id);
        parks += 1;
      }
    }
  }

  function spawnOn(laneId: string): boolean {
    const lane = laneOf.get(laneId);
    if (lane === undefined) return false;
    const first = laneFirst.get(laneId);
    if (first !== undefined && first.arc - first.half < tuning.spawnGap) return false;
    const id = `${idPrefix}-${counter}`;
    counter += 1;
    if (carOf.has(id)) return false;
    const variant = Math.floor(rng() * 8);
    const car = createCar(id, laneId, 0, Math.min(lane.speed, lane.speed * tuning.spawnSpeedFactor), variant);
    if (car === null) return false;
    spawned += 1;
    noteLaneFirst(laneId, car.arc);
    return true;
  }

  function applyDemand(): void {
    if (demand < 0) return;
    let budget = tuning.fleetPerTick;
    if (cars.length < demand) {
      for (const laneId of graph.entries()) {
        if (budget <= 0 || cars.length >= demand) break;
        while (budget > 0 && cars.length < demand && spawnOn(laneId)) budget -= 1;
      }
      return;
    }
    while (cars.length > demand && budget > 0) {
      budget -= 1;
      let worst = -1;
      let worstProgress = -1;
      for (let index = 0; index < cars.length; index += 1) {
        const car = cars[index]!;
        if (car.state === "boxed" || car.spotId !== null) continue;
        const lane = laneOf.get(car.laneId);
        const progress = lane === undefined ? 0 : car.arc / Math.max(EPSILON, lane.length);
        if (progress > worstProgress) {
          worstProgress = progress;
          worst = index;
        }
      }
      if (worst < 0) break;
      const car = cars[worst]!;
      const state = intersections.get(laneOf.get(car.laneId)?.to ?? "");
      if (state !== undefined && state.holder === car) state.holder = null;
      removeAt(worst);
      retired += 1;
    }
  }

  function resetLaneArrays(): void {
    for (const list of laneCars.values()) list.length = 0;
    laneFirst.clear();
    for (const car of cars) {
      const list = laneCars.get(car.laneId);
      if (list === undefined) continue;
      car.queueIndex = list.length;
      list.push(car);
    }
    for (const [laneId, list] of laneCars) {
      if (list.length === 0) continue;
      list.sort((a, b) => a.arc - b.arc || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      list.forEach((car, index) => {
        car.queueIndex = index;
      });
      const first = list[0]!;
      laneFirst.set(laneId, { arc: first.arc, half: tuning.carLength / 2 });
    }
  }

  return {
    add(id, spec) {
      if (carOf.has(id)) return false;
      const car = createCar(id, spec.laneId, spec.arc ?? 0, spec.speed ?? 0, Math.floor(rng() * 8));
      return car !== null;
    },
    remove(id) {
      const at = indexOf(id);
      if (at === undefined) return false;
      const car = cars[at]!;
      const state = intersections.get(laneOf.get(car.laneId)?.to ?? "");
      if (state !== undefined && state.holder === car) state.holder = null;
      removeAt(at);
      return true;
    },
    has: (id) => carOf.has(id),
    count: () => cars.length,
    ids: () => cars.map((car) => car.id),
    car(id) {
      const at = indexOf(id);
      if (at === undefined) return null;
      const car = cars[at]!;
      return {
        id: car.id,
        laneId: car.laneId,
        arc: car.arc,
        position: [car.x, car.y, car.z],
        heading: car.heading,
        speed: car.speed,
        state: car.state,
        spotId: car.spotId,
        variant: car.variant,
      };
    },
    forEachCar(visit) {
      for (const car of cars) {
        visit({
          id: car.id,
          laneId: car.laneId,
          arc: car.arc,
          position: [car.x, car.y, car.z],
          heading: car.heading,
          speed: car.speed,
          state: car.state,
          spotId: car.spotId,
          variant: car.variant,
        });
      }
    },
    tick(dt) {
      if (!(dt > 0)) return;
      const started = performance.now();
      phaseSignals(dt);
      for (const state of intersections.values()) state.waiting.length = 0;
      resetLaneArrays();
      moveCars(dt);
      grantIntersections();
      transferCars();
      changeLanes();
      settleParking();
      applyDemand();
      ticks += 1;
      slowestTickMs = Math.max(slowestTickMs, performance.now() - started);
    },
    retune(patch) {
      tuning = resolveTuning(tuning, patch);
      for (const car of cars) {
        const lane = laneOf.get(car.laneId);
        if (lane !== undefined) car.maxSpeed = Math.max(1, lane.speed * tuning.speedScale);
      }
    },
    setDemand(count) {
      demand = Math.max(0, Math.floor(count));
    },
    demand: () => demand,    park(id, spotId) {
      const at = indexOf(id);
      if (at === undefined) return false;
      const car = cars[at]!;
      if (car.state === "parked") return true;
      let target: string | null = null;
      if (spotId !== undefined) {
        const spot = spotOf.get(spotId);
        if (spot === undefined || spot.lane !== car.laneId) return false;
        if (spotOwner.has(spot.id) && spotOwner.get(spot.id) !== car.id) return false;
        target = spot.id;
      } else {
        let bestArc = Infinity;
        for (const spot of spotOf.values()) {
          if (spot.lane !== car.laneId || spot.arc < car.arc) continue;
          const owner = spotOwner.get(spot.id);
          if (owner !== undefined && owner !== car.id) continue;
          if (spot.arc < bestArc) {
            bestArc = spot.arc;
            target = spot.id;
          }
        }
        if (target === null) return false;
      }
      if (car.spotId !== null && car.spotId !== target) {
        spotOwner.delete(car.spotId);
      }
      car.spotId = target;
      spotOwner.set(target, car.id);
      return true;
    },
    releaseParking(id) {
      const at = indexOf(id);
      if (at === undefined) return false;
      const car = cars[at]!;
      if (car.spotId === null) return false;
      spotOwner.delete(car.spotId);
      car.spotId = null;
      if (car.state === "parked") car.state = "driving";
      return true;
    },
    spotOwner: (spotId) => spotOwner.get(spotId) ?? null,
    signal(nodeId) {
      const state = intersections.get(nodeId);
      return state?.signal ?? null;
    },
    stats() {
      let parked = 0;
      let boxed = 0;
      let waiting = 0;
      let speedSum = 0;
      let moving = 0;
      for (const car of cars) {
        if (car.state === "parked") parked += 1;
        if (car.state === "boxed") boxed += 1;
        if (car.waitingSeconds > 0) waiting += 1;
        if (car.speed > 0.1) {
          speedSum += car.speed;
          moving += 1;
        }
      }
      return {
        cars: cars.length,
        parked,
        boxed,
        waiting,
        spawned,
        exited,
        retired,
        laneChanges,
        parks,
        stalls,
        maxStillSeconds,
        maxDeadlockSeconds,
        ticks,
        slowestTickMs,
        meanSpeed: moving === 0 ? 0 : speedSum / moving,
      };
    },
    snapshot() {
      return {
        tunables: { ...tuning },
        demand,
        counter,
        rng: rngStateOf(rng),
        cars: cars.map((car) => ({
          id: car.id,
          laneId: car.laneId,
          arc: car.arc,
          speed: car.speed,
          maxSpeed: car.maxSpeed,
          desiredSpeed: car.desiredSpeed,
          state: car.state,
          cleared: car.cleared,
          nextLane: car.nextLane,
          spotId: car.spotId,
          lateral: car.lateral,
          lateralRate: car.lateralRate,
          changeCooldown: car.changeCooldown,
          blockedSeconds: car.blockedSeconds,
          stillSeconds: car.stillSeconds,
          deadlockSeconds: car.deadlockSeconds,
          waitingSeconds: car.waitingSeconds,
          stalled: car.stalled,
          variant: car.variant,
        })),
        spots: [...spotOf.keys()].map((spotId) => ({ id: spotId, carId: spotOwner.get(spotId) ?? null })),
        intersections: [...intersections.values()].map((state) => ({
          node: state.lane.node,
          elapsed: state.elapsed,
          cooldown: state.cooldown,
          holder: state.holder?.id ?? null,
        })),
        counters: {
          spawned,
          exited,
          retired,
          laneChanges,
          parks,
          stalls,
          ticks,
          maxStillSeconds,
          maxDeadlockSeconds,
          slowestTickMs,
        },
      };
    },
    restore(next) {
      tuning = resolveTuning({ ...DEFAULT_TUNING }, next.tunables);
      demand = next.demand < 0 ? -1 : Math.max(0, Math.floor(next.demand));
      counter = Math.max(0, Math.floor(next.counter));
      if (next.rng !== null) restoreRng(rng, next.rng);
      cars.length = 0;
      carOf.clear();
      spotOwner.clear();
      spawned = next.counters.spawned;
      exited = next.counters.exited;
      retired = next.counters.retired;
      laneChanges = next.counters.laneChanges;
      parks = next.counters.parks;
      stalls = next.counters.stalls;
      ticks = next.counters.ticks;
      maxStillSeconds = next.counters.maxStillSeconds;
      maxDeadlockSeconds = next.counters.maxDeadlockSeconds;
      slowestTickMs = next.counters.slowestTickMs;
      for (const saved of next.cars) {
        const car: Car = {
          ...saved,
          queueIndex: -1,
          x: 0,
          y: 0,
          z: 0,
          heading: 0,
        };
        applyPose(car);
        cars.push(car);
        carOf.set(car.id, cars.length - 1);
      }
      for (const spot of next.spots) {
        if (spot.carId === null) continue;
        spotOwner.set(spot.id, spot.carId);
      }
      for (const saved of next.intersections) {
        const state = intersections.get(saved.node);
        if (state === undefined) continue;
        state.elapsed = saved.elapsed;
        state.cooldown = saved.cooldown;
        state.holder = saved.holder === null ? null : cars[carOf.get(saved.holder) ?? -1] ?? null;
      }
      resetLaneArrays();
    },
    dispose() {
      unregister?.();
    },
  };
}
