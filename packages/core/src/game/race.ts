export interface Checkpoint {
  id: string;
  center: readonly [number, number, number];
  half: readonly [number, number, number];
}

export interface RaceTrackConfig {
  checkpoints: readonly Checkpoint[];
  laps?: number;
}

export interface RaceTrack {
  readonly checkpoints: readonly Checkpoint[];
  readonly laps: number;
}

/**
 * A race track is an ordered ring of checkpoint trigger volumes plus a lap count. The final checkpoint
 * is the lap/finish line: a racer completes a lap by passing all checkpoints in order and hitting the
 * last one.
 */
export function raceTrack(config: RaceTrackConfig): RaceTrack {
  return { checkpoints: config.checkpoints, laps: Math.max(1, Math.floor(config.laps ?? 1)) };
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
}

export type RaceEvent =
  | { type: "checkpoint.hit"; racerId: string; checkpoint: number; lap: number; time: number }
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
    };
  }

  standings(): readonly RacerProgress[] {
    return this.order
      .map((id) => this.racers.get(id)!)
      .slice()
      .sort((a, b) => this.compare(a, b, null))
      .map((r) => this.snapshot(r));
  }

  resetToCheckpoint(racerId: string): { position: [number, number, number]; heading: number } | null {
    const r = this.racers.get(racerId);
    if (r === undefined) return null;
    const cps = this.track.checkpoints;
    const idx = r.lastCheckpoint >= 0 ? r.lastCheckpoint : 0;
    const cp = cps[idx];
    if (cp === undefined) return null;
    const next = cps[(idx + 1) % cps.length]!;
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
      const cps = this.track.checkpoints;
      if (pa !== undefined && pb !== undefined && cps.length > 0) {
        const da = distanceToNext(pa, cps[a.nextCheckpoint]!);
        const db = distanceToNext(pb, cps[b.nextCheckpoint]!);
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
      for (const id of this.order) {
        const r = this.racers.get(id)!;
        if (r.finished || r.eliminated) continue;
        const pos = posMap.get(id);
        if (pos === undefined) continue;
        let guard = 0;
        while (guard < count && insideAabb(pos, cps[r.nextCheckpoint]!)) {
          guard += 1;
          const hit = r.nextCheckpoint;
          r.lastCheckpoint = hit;
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
