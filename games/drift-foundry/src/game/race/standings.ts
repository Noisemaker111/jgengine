import {
  createLapTimer,
  createRaceState,
  everyoneFinishes,
  raceTrack,
  type Checkpoint,
  type LapTimer,
  type RaceFork,
  type RaceEvent,
  type RaceState,
} from "@jgengine/core/game/race";

import { MAIN_ROUTE } from "@jgengine/core/world/routeCourse";

import { ROUTE_GATES } from "../route/gates";
import { CORRIDOR_DRIVE_HALF_WIDTH, EXIT_Z } from "../run/constants";
import { ROW_SIX_TRACK, type Track } from "../tracks/catalog";

/**
 * Live position, lap and finish for the four karts on the corridor. The ordering, splits, lap
 * bookkeeping, the wall clock and the finish condition are `@jgengine/core/game/race`; this file only
 * names the corridor's checkpoint ring and keeps the player's place to hand to the HUD.
 */

export const PLAYER_RACER_ID = "player";
export const RACE_LAPS = 1;

/** One checkpoint volume per barricade plus the finish line: the corridor's authored milestones. */
const ROW_SIX_CHECKPOINTS: readonly Checkpoint[] = [
  ...ROUTE_GATES.map((gate) => ({
    id: gate.id,
    center: [0, 0, gate.atZ] as readonly [number, number, number],
    half: [CORRIDOR_DRIVE_HALF_WIDTH, 8, 2] as readonly [number, number, number],
  })),
  { id: "finish", center: [0, 0, EXIT_Z] as readonly [number, number, number], half: [CORRIDOR_DRIVE_HALF_WIDTH, 8, 4] as readonly [number, number, number] },
];

export interface RacerStanding {
  id: string;
  name: string;
  place: number;
  lap: number;
  finished: boolean;
  /** Seconds this racer took from the green light to the flag, once home. */
  finishTime: number | null;
}

export interface RaceSnapshot {
  place: number;
  total: number;
  lap: number;
  laps: number;
  standings: readonly RacerStanding[];
  /** True once every kart is home - the full classification is final at that point. */
  finished: boolean;
  /** The player's lap clock this tick, seconds. */
  lapTime: number;
  /** The player's last completed lap, `null` before it closes. */
  lastLap: number | null;
  /** The player's fastest lap, `null` before the first one closes. */
  bestLap: number | null;
  /** Cumulative player split times, one per barricade and one at the flag. */
  splits: readonly number[];
}

export interface Standings {
  /** Advance the player's lap clock one tick, before `update`. */
  tick(dt: number): void;
  /** Advance the checkpoint ring with this tick's positions; returns the race's events. */
  update(now: number, positions: Record<string, readonly [number, number, number]>): readonly RaceEvent[];
  snapshot(): RaceSnapshot;
  placeOf(id: string): number;
  finishedOf(id: string): boolean;
  reset(): void;
}

/**
 * A track's checkpoint ring: one box per main-line barricade and the finish. The course drops the
 * marks a shortcut skips and hands back the forks, so a kart is placed fairly down either path.
 */
export function trackCheckpoints(track: Track): { checkpoints: readonly Checkpoint[]; forks: readonly RaceFork[] } {
  if (track.id === ROW_SIX_TRACK.id) return { checkpoints: ROW_SIX_CHECKPOINTS, forks: [] };
  const at = track.gates.filter((gate) => gate.route === MAIN_ROUTE).map((gate) => gate.atZ + track.origin);
  return track.course.checkpoints({ at, finish: track.exitAt + track.origin, height: 10 });
}

/** Racers are placed by their positions with `y` the road height under them (see the session). */
export function createStandings(names: Readonly<Record<string, string>>, course: Track = ROW_SIX_TRACK): Standings {
  const ids = Object.keys(names);
  const track = raceTrack({ ...trackCheckpoints(course), laps: RACE_LAPS });
  // Every kart must cross before the race closes: the player's own finish ends the run, and the
  // classification behind them is only honest once the field has actually stopped racing for it.
  const timer: LapTimer = createLapTimer();
  let race: RaceState = seed();

  function seed(): RaceState {
    const next = createRaceState({ track, win: everyoneFinishes() });
    for (const id of ids) next.addRacer(id);
    return next;
  }

  function snapshot(): RaceSnapshot {
    const standings = race.standings();
    const player = standings.find((entry) => entry.racerId === PLAYER_RACER_ID);
    const timing = timer.snapshot();
    return {
      place: player?.position ?? ids.length,
      total: ids.length,
      lap: Math.min(RACE_LAPS, player?.lap ?? 1),
      laps: RACE_LAPS,
      standings: standings.map((entry) => ({
        id: entry.racerId,
        name: names[entry.racerId] ?? entry.racerId,
        place: entry.position,
        lap: entry.lap,
        finished: entry.finished,
        finishTime: entry.finishTime,
      })),
      finished: race.finished,
      lapTime: timing.currentLap,
      lastLap: timing.lastLap,
      bestLap: timing.bestLap,
      splits: player?.splits ?? [],
    };
  }

  return {
    tick(dt) {
      timer.tick(dt);
    },
    update(now, positions) {
      const events = race.update(now, positions);
      // `createLapTimer` is the shared lap clock; the race state machine only reports that a lap
      // closed, so closing the timer is the one line this game owes it.
      for (const event of events) {
        if (event.type === "lap.completed" && event.racerId === PLAYER_RACER_ID) timer.completeLap();
      }
      return events;
    },
    snapshot,
    placeOf(id) {
      return race.progressOf(id)?.position ?? ids.length;
    },
    finishedOf(id) {
      return race.progressOf(id)?.finished ?? false;
    },
    reset() {
      race = seed();
      timer.reset();
    },
  };
}
