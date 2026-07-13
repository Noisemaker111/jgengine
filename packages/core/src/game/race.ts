export interface Checkpoint {
  id: string;
  center: readonly [number, number, number];
  half: readonly [number, number, number];
}

export interface RaceForkRoute {
  id: string;
  checkpoints: readonly Checkpoint[];
}

/**
 * An alternate-route section (#286.3): after passing mainline checkpoint `afterIndex`, a racer commits
 * to whichever route's first checkpoint they hit, runs its checkpoints in order, and rejoins at
 * mainline `afterIndex + 1`. Every completed route contributes exactly one checkpoint of `progress`
 * regardless of length, and each hit records a split — so route time accounting comes for free.
 */
export interface RaceFork {
  id: string;
  /** Mainline checkpoint index the fork opens after; must be before the finish line. */
  afterIndex: number;
  routes: readonly RaceForkRoute[];
}

export interface RaceTrackConfig {
  checkpoints: readonly Checkpoint[];
  laps?: number;
  forks?: readonly RaceFork[];
}

export interface RaceTrack {
  readonly checkpoints: readonly Checkpoint[];
  readonly laps: number;
  readonly forks: readonly RaceFork[];
}

/**
 * A race track is an ordered ring of checkpoint trigger volumes plus a lap count. The final checkpoint
 * is the lap/finish line: a racer completes a lap by passing all checkpoints in order and hitting the
 * last one. `forks` splice alternate route segments between mainline checkpoints.
 */
export function raceTrack(config: RaceTrackConfig): RaceTrack {
  const checkpoints = config.checkpoints;
  const forks = config.forks ?? [];
  for (const fork of forks) {
    if (fork.afterIndex < 0 || fork.afterIndex >= checkpoints.length - 1) {
      throw new Error(`race fork "${fork.id}" afterIndex ${fork.afterIndex} must sit before the finish line`);
    }
    if (fork.routes.length < 2) throw new Error(`race fork "${fork.id}" needs at least two routes`);
    for (const route of fork.routes) {
      if (route.checkpoints.length === 0) {
        throw new Error(`race fork "${fork.id}" route "${route.id}" needs at least one checkpoint`);
      }
    }
  }
  return { checkpoints, laps: Math.max(1, Math.floor(config.laps ?? 1)), forks };
}

export interface RacerProgress {
  racerId: string;
  lap: number;
  nextCheckpoint: number;
  lastCheckpoint: number;
  progress: number;
  position: number;
  finished: boolean;
  finishTime: number | null;
  eliminated: boolean;
  splits: readonly number[];
  /** Fork id → route id last taken through it. */
  routesTaken: Readonly<Record<string, string>>;
  /** Route the racer is currently inside, or `null` on the mainline. */
  activeRoute: { forkId: string; routeId: string } | null;
}

export type RaceEvent =
  | {
      type: "checkpoint.hit";
      racerId: string;
      checkpoint: number;
      lap: number;
      time: number;
      /** Set when the hit is a fork-route checkpoint (`checkpoint` is then the fork's `afterIndex`). */
      fork?: { forkId: string; routeId: string; index: number };
    }
  | { type: "fork.taken"; racerId: string; forkId: string; routeId: string; time: number }
  | { type: "lap.completed"; racerId: string; lap: number; time: number }
  | { type: "position.changed"; racerId: string; position: number; previous: number }
  | { type: "race.finished"; ranking: readonly string[]; time: number };

export type RaceWinCondition = (standings: readonly RacerProgress[], track: RaceTrack) => readonly string[] | null;

function rankIds(standings: readonly RacerProgress[]): readonly string[] {
  return standings.map((s) => s.racerId);
}

/** Race ends when `count` racers have crossed the finish; ranking is the current standings order. */
export function firstPastPost(count = 1): RaceWinCondition {
  return (standings) => {
    const finished = standings.filter((s) => s.finished).length;
    return finished >= count ? rankIds(standings) : null;
  };
}

/** Round-cut (Fall Guys): the first `k` finishers qualify; race resolves the moment `k` cross. */
export function topK(k: number): RaceWinCondition {
  return firstPastPost(k);
}

/** Every non-eliminated racer must finish. */
export function everyoneFinishes(): RaceWinCondition {
  return (standings) => {
    const active = standings.filter((s) => !s.eliminated);
    return active.length > 0 && active.every((s) => s.finished) ? rankIds(standings) : null;
  };
}

/** Destruction-derby last-man-standing: ends when at most one racer is left un-eliminated. */
export function lastStanding(): RaceWinCondition {
  return (standings) => {
    const alive = standings.filter((s) => !s.eliminated);
    return alive.length <= 1 && standings.length > 1 ? rankIds(standings) : null;
  };
}

interface ActiveFork {
  forkIndex: number;
  routeIndex: number;
  nextRouteCheckpoint: number;
}

interface RacerRecord {
  racerId: string;
  lap: number;
  nextCheckpoint: number;
  lastCheckpoint: number;
  progress: number;
  position: number;
  finished: boolean;
  finishTime: number | null;
  eliminated: boolean;
  startTime: number;
  splits: number[];
  fork: ActiveFork | null;
  routesTaken: Record<string, string>;
  forksDone: Record<string, true>;
  lastHit: Checkpoint | null;
}

export interface RaceStateConfig {
  track: RaceTrack;
  win?: RaceWinCondition;
}

function insideAabb(point: readonly [number, number, number], cp: Checkpoint): boolean {
  return (
    Math.abs(point[0] - cp.center[0]) <= cp.half[0] &&
    Math.abs(point[1] - cp.center[1]) <= cp.half[1] &&
    Math.abs(point[2] - cp.center[2]) <= cp.half[2]
  );
}

function distanceToNext(point: readonly [number, number, number], cp: Checkpoint): number {
  const dx = point[0] - cp.center[0];
  const dz = point[2] - cp.center[2];
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Race state machine (issue #87). Drive it each tick with `update(now, positions)` — `now` is game time
 * (`ctx.time`), `positions` maps each racer to a world point tested against the ordered checkpoint
 * volumes. It emits `checkpoint.hit` / `lap.completed` / `position.changed` / `race.finished`, keeps
 * cumulative split times for PB deltas, resolves a pluggable win condition (first-past-post, round-cut,
 * derby last-standing), and `resetToCheckpoint` hands back a respawn pose at the racer's last checkpoint.
 * `removeRacer` drops a racer mid-race and `reset` returns the whole instance to its pre-race state for reuse.
 */
export class RaceState {
  private readonly track: RaceTrack;
  private readonly win: RaceWinCondition;
  private readonly racers = new Map<string, RacerRecord>();
  private readonly order: string[] = [];
  private raceFinished = false;
  private finalRanking: readonly string[] = [];

  constructor(config: RaceStateConfig) {
    this.track = config.track;
    this.win = config.win ?? firstPastPost(1);
  }

  addRacer(racerId: string, startTime = 0): void {
    if (this.racers.has(racerId)) return;
    this.racers.set(racerId, {
      racerId,
      lap: 1,
      nextCheckpoint: 0,
      lastCheckpoint: -1,
      progress: 0,
      position: this.order.length + 1,
      finished: false,
      finishTime: null,
      eliminated: false,
      startTime,
      splits: [],
      fork: null,
      routesTaken: {},
      forksDone: {},
      lastHit: null,
    });
    this.order.push(racerId);
  }

  /** Removes a racer's progress/standing and renumbers the remaining field's positions; a no-op for an unknown id. */
  removeRacer(racerId: string): void {
    if (!this.racers.delete(racerId)) return;
    const idx = this.order.indexOf(racerId);
    if (idx >= 0) this.order.splice(idx, 1);
    const remaining = this.order.map((id) => this.racers.get(id)!).sort((a, b) => this.compare(a, b, null));
    remaining.forEach((r, i) => {
      r.position = i + 1;
    });
  }

  /** Clears all racer progress and finish state back to construction time; `track` and `win` are untouched, so the same instance can run another race. */
  reset(): void {
    this.racers.clear();
    this.order.length = 0;
    this.raceFinished = false;
    this.finalRanking = [];
  }

  eliminate(racerId: string): void {
    const r = this.racers.get(racerId);
    if (r !== undefined) r.eliminated = true;
  }

  get finished(): boolean {
    return this.raceFinished;
  }

  get ranking(): readonly string[] {
    return this.finalRanking;
  }

  progressOf(racerId: string): RacerProgress | null {
    const r = this.racers.get(racerId);
    return r === null || r === undefined ? null : this.snapshot(r);
  }

  private snapshot(r: RacerRecord): RacerProgress {
    const activeFork = r.fork === null ? null : this.track.forks[r.fork.forkIndex]!;
    return {
      racerId: r.racerId,
      lap: r.lap,
      nextCheckpoint: r.nextCheckpoint,
      lastCheckpoint: r.lastCheckpoint,
      progress: r.progress,
      position: r.position,
      finished: r.finished,
      finishTime: r.finishTime,
      eliminated: r.eliminated,
      splits: [...r.splits],
      routesTaken: { ...r.routesTaken },
      activeRoute:
        activeFork === null || r.fork === null
          ? null
          : { forkId: activeFork.id, routeId: activeFork.routes[r.fork.routeIndex]!.id },
    };
  }

  standings(): readonly RacerProgress[] {
    return this.order
      .map((id) => this.racers.get(id)!)
      .slice()
      .sort((a, b) => this.compare(a, b, null))
      .map((r) => this.snapshot(r));
  }

  private expectedCheckpoint(r: RacerRecord): Checkpoint | null {
    if (r.fork !== null) {
      const fork = this.track.forks[r.fork.forkIndex]!;
      const route = fork.routes[r.fork.routeIndex]!;
      return route.checkpoints[r.fork.nextRouteCheckpoint] ?? this.track.checkpoints[r.nextCheckpoint] ?? null;
    }
    return this.track.checkpoints[r.nextCheckpoint] ?? null;
  }

  resetToCheckpoint(racerId: string): { position: [number, number, number]; heading: number } | null {
    const r = this.racers.get(racerId);
    if (r === undefined) return null;
    const cp = r.lastHit ?? this.track.checkpoints[0];
    if (cp === undefined) return null;
    let next = this.expectedCheckpoint(r) ?? cp;
    if (next === cp) next = this.track.checkpoints[1 % this.track.checkpoints.length] ?? cp;
    const heading = Math.atan2(next.center[0] - cp.center[0], next.center[2] - cp.center[2]);
    return { position: [cp.center[0], cp.center[1], cp.center[2]], heading };
  }

  private compare(a: RacerRecord, b: RacerRecord, positions: Map<string, readonly [number, number, number]> | null): number {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    if (a.progress !== b.progress) return b.progress - a.progress;
    if (positions !== null) {
      const pa = positions.get(a.racerId);
      const pb = positions.get(b.racerId);
      const ca = this.expectedCheckpoint(a);
      const cb = this.expectedCheckpoint(b);
      if (pa !== undefined && pb !== undefined && ca !== null && cb !== null) {
        const da = distanceToNext(pa, ca);
        const db = distanceToNext(pb, cb);
        if (da !== db) return da - db;
      }
    }
    return this.order.indexOf(a.racerId) - this.order.indexOf(b.racerId);
  }

  update(now: number, positions: Record<string, readonly [number, number, number]> | Map<string, readonly [number, number, number]>): readonly RaceEvent[] {
    const posMap = positions instanceof Map ? positions : new Map(Object.entries(positions));
    const events: RaceEvent[] = [];
    const cps = this.track.checkpoints;
    const count = cps.length;

    if (count > 0) {
      const forks = this.track.forks;
      const maxSteps =
        count + forks.reduce((sum, fork) => sum + Math.max(...fork.routes.map((route) => route.checkpoints.length)), 0) + 2;
      for (const id of this.order) {
        const r = this.racers.get(id)!;
        if (r.finished || r.eliminated) continue;
        const pos = posMap.get(id);
        if (pos === undefined) continue;
        let guard = 0;
        while (guard < maxSteps) {
          guard += 1;

          if (r.fork !== null) {
            const fork = forks[r.fork.forkIndex]!;
            const route = fork.routes[r.fork.routeIndex]!;
            const cp = route.checkpoints[r.fork.nextRouteCheckpoint]!;
            if (!insideAabb(pos, cp)) break;
            r.lastHit = cp;
            r.progress += 1 / route.checkpoints.length;
            r.splits.push(now - r.startTime);
            events.push({
              type: "checkpoint.hit",
              racerId: id,
              checkpoint: fork.afterIndex,
              lap: r.lap,
              time: now,
              fork: { forkId: fork.id, routeId: route.id, index: r.fork.nextRouteCheckpoint },
            });
            r.fork.nextRouteCheckpoint += 1;
            if (r.fork.nextRouteCheckpoint >= route.checkpoints.length) {
              r.forksDone[fork.id] = true;
              r.fork = null;
            }
            continue;
          }

          let tookRoute = false;
          for (let forkIndex = 0; forkIndex < forks.length; forkIndex += 1) {
            const fork = forks[forkIndex]!;
            if (fork.afterIndex !== r.lastCheckpoint || r.nextCheckpoint !== fork.afterIndex + 1) continue;
            if (r.forksDone[fork.id] === true) continue;
            for (let routeIndex = 0; routeIndex < fork.routes.length; routeIndex += 1) {
              const route = fork.routes[routeIndex]!;
              if (!insideAabb(pos, route.checkpoints[0]!)) continue;
              r.fork = { forkIndex, routeIndex, nextRouteCheckpoint: 0 };
              r.routesTaken[fork.id] = route.id;
              events.push({ type: "fork.taken", racerId: id, forkId: fork.id, routeId: route.id, time: now });
              tookRoute = true;
              break;
            }
            if (tookRoute) break;
          }
          if (tookRoute) continue;

          const cp = cps[r.nextCheckpoint]!;
          if (!insideAabb(pos, cp)) break;
          const hit = r.nextCheckpoint;
          r.lastCheckpoint = hit;
          r.lastHit = cp;
          r.forksDone = {};
          r.progress += 1;
          r.splits.push(now - r.startTime);
          events.push({ type: "checkpoint.hit", racerId: id, checkpoint: hit, lap: r.lap, time: now });
          if (hit === count - 1) {
            events.push({ type: "lap.completed", racerId: id, lap: r.lap, time: now });
            if (r.lap >= this.track.laps) {
              r.finished = true;
              r.finishTime = now;
              break;
            }
            r.lap += 1;
            r.nextCheckpoint = 0;
          } else {
            r.nextCheckpoint = hit + 1;
          }
        }
      }
    }

    const sorted = this.order
      .map((id) => this.racers.get(id)!)
      .slice()
      .sort((a, b) => this.compare(a, b, posMap));
    for (let i = 0; i < sorted.length; i += 1) {
      const r = sorted[i]!;
      const newPos = i + 1;
      if (r.position !== newPos) {
        events.push({ type: "position.changed", racerId: r.racerId, position: newPos, previous: r.position });
        r.position = newPos;
      }
    }

    if (!this.raceFinished) {
      const ranking = this.win(sorted.map((r) => this.snapshot(r)), this.track);
      if (ranking !== null) {
        this.raceFinished = true;
        this.finalRanking = ranking;
        events.push({ type: "race.finished", ranking, time: now });
      }
    }

    return events;
  }
}

export function createRaceState(config: RaceStateConfig): RaceState {
  return new RaceState(config);
}

/** Wall-clock lap timing: the current/last/best/total split-book every racing HUD reads. */
export interface LapTimerSnapshot {
  /** Seconds elapsed in the lap now underway. */
  currentLap: number;
  /** Duration of the lap just completed, or `null` before the first lap closes. */
  lastLap: number | null;
  /** Fastest completed lap so far, or `null` before the first lap closes. */
  bestLap: number | null;
  /** Total time across every lap, including the current one. */
  total: number;
  /** Number of laps completed. */
  lapCount: number;
  /** Completed lap durations in order — the split book for a results screen. */
  splits: readonly number[];
}

/**
 * Wall-clock lap timer complementing {@link RaceState}: feed it `tick(dt)` each frame and call
 * `completeLap()` when the race emits a player `lap.completed` event. It accumulates the current lap,
 * carries best/last, banks splits, and `penalize()` folds a time penalty into the running lap — the
 * timing bookkeeping every racer reimplemented on top of the position-only race state.
 */
export interface LapTimer {
  /** Advance the current lap and total by `dt` seconds. */
  tick(dt: number): void;
  /** Close the current lap: bank its split, update last/best, reset the current lap to 0, and return its time. */
  completeLap(): number;
  /** Add a time penalty (seconds) to the lap currently underway. */
  penalize(seconds: number): void;
  /** Clear all timing back to the start line. */
  reset(): void;
  /** Immutable view of the current timing state. */
  snapshot(): LapTimerSnapshot;
}

/** Create a {@link LapTimer} starting at lap 0 with no splits, best, or last time recorded. */
export function createLapTimer(): LapTimer {
  let currentLap = 0;
  let lastLap: number | null = null;
  let bestLap: number | null = null;
  let total = 0;
  const splits: number[] = [];
  return {
    tick(dt) {
      if (dt <= 0) return;
      currentLap += dt;
      total += dt;
    },
    completeLap() {
      const lapTime = currentLap;
      lastLap = lapTime;
      bestLap = bestLap === null || lapTime < bestLap ? lapTime : bestLap;
      splits.push(lapTime);
      currentLap = 0;
      return lapTime;
    },
    penalize(seconds) {
      if (seconds <= 0) return;
      currentLap += seconds;
      total += seconds;
    },
    reset() {
      currentLap = 0;
      lastLap = null;
      bestLap = null;
      total = 0;
      splits.length = 0;
    },
    snapshot() {
      return { currentLap, lastLap, bestLap, total, lapCount: splits.length, splits: [...splits] };
    },
  };
}

/**
 * Per-segment durations from a cumulative split book (`splits[i]` = elapsed time at checkpoint `i`):
 * `segments[i] = splits[i] − splits[i−1]`, the first measured from `start` (default 0). Turns the
 * cumulative splits {@link RacerProgress} records into the individual leg times a results screen shows.
 */
export function splitSegments(splits: readonly number[], start = 0): number[] {
  const segments: number[] = [];
  let previous = start;
  for (const split of splits) {
    segments.push(split - previous);
    previous = split;
  }
  return segments;
}

/**
 * Per-lap durations from a cumulative split book with `gatesPerLap` checkpoints per lap — each lap's time
 * is its finish-gate split minus the previous lap's finish. Only complete laps are returned.
 */
export function lapDurations(splits: readonly number[], gatesPerLap: number): number[] {
  if (gatesPerLap <= 0) return [];
  const laps: number[] = [];
  for (let lap = 0; ; lap += 1) {
    const finish = lap * gatesPerLap + (gatesPerLap - 1);
    if (finish >= splits.length) break;
    const previousFinish = lap === 0 ? 0 : (splits[lap * gatesPerLap - 1] ?? 0);
    laps.push(splits[finish]! - previousFinish);
  }
  return laps;
}

/**
 * Elementwise delta of a cumulative split book against a `reference` book (a personal best or par lap):
 * positive means behind the reference at that checkpoint. Compared up to the shorter length — the
 * `+0.3s` / `−1.2s` gap every racing HUD shows against its ghost.
 */
export function parDelta(splits: readonly number[], reference: readonly number[]): number[] {
  const count = Math.min(splits.length, reference.length);
  const deltas: number[] = [];
  for (let i = 0; i < count; i += 1) deltas.push(splits[i]! - reference[i]!);
  return deltas;
}
