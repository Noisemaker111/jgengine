import { SECONDS_PER_GAME_DAY } from "../time/gameClock";

/** One authored stop in a day: where the agent belongs, and when it wants to get there. */
export interface RoutineStopSpec {
  /** Opaque place id the agent occupies; the caller owns what a place means and where it stands. */
  readonly place: string;
  /** Authored arrival time in game-seconds into the cycle (0 .. `cycleSeconds`). */
  readonly arriveAt: number;
  /** Opaque activity label the stop is for ("work", "meal", "sleep"); never interpreted here. */
  readonly activity?: string;
  /** Seconds spent walking here from the previous stop; overrides `RoutineConfig.travelSeconds`. */
  readonly travelSeconds?: number;
  /** Need refills applied on arrival — a meal restores hunger while the agent stands there. */
  readonly refill?: Readonly<Record<string, number>>;
}

/** Everything needed to resolve a routine: its authored stops, its cycle, and how far apart places are. */
export interface RoutineConfig {
  readonly stops: readonly RoutineStopSpec[];
  /** Cycle length in game-seconds; default one game day (`SECONDS_PER_GAME_DAY`). */
  readonly cycleSeconds?: number;
  /**
   * Injected travel time between two places, used when a stop does not author `travelSeconds`.
   * Default `0`, so a routine of places that are all the same spot needs no travel at all.
   */
  readonly travelSeconds?: (from: string, to: string) => number;
}

/** One stop after travel is accounted for: the authored time and the time the agent really gets there. */
export interface RoutineStop {
  readonly index: number;
  readonly place: string;
  readonly activity: string | null;
  /** The authored arrival time, in cycle seconds. */
  readonly plannedArriveAt: number;
  /** Real arrival — later than planned when the previous stop's walk ran into this one. */
  readonly arriveAt: number;
  /** When the agent must leave to reach the next stop on time; never before `arriveAt`. */
  readonly departAt: number;
  readonly refill: Readonly<Record<string, number>> | null;
}

/** Where a routine puts its agent at one instant. */
export interface RoutinePhase {
  /** Index of the stop held here, or the stop being walked away from. */
  readonly stop: number;
  /** Place the agent is at, or the place it is walking from. */
  readonly place: string;
  /** Place it is walking to; `null` while holding. */
  readonly nextPlace: string | null;
  readonly activity: string | null;
  readonly travelling: boolean;
  /** 0 at departure to 1 on arrival; `0` while holding. */
  readonly progress: number;
  /** Absolute game-second this phase began. */
  readonly since: number;
  /** Absolute game-second the next phase begins. */
  readonly until: number;
}

/**
 * An authored day resolved against time: arrival times after walking, departures early enough to
 * make the next stop, and a phase for any instant. Pure — there is no state to tick, so a far agent
 * and a loaded save read the same day from the same clock.
 */
export interface RoutineTimeline {
  /** Seconds in one cycle. */
  readonly cycleSeconds: number;
  /** Stops in order, with real arrival and departure times. */
  readonly stops: readonly RoutineStop[];
  /** Where the routine puts the agent at absolute game-second `time`; wraps every cycle. */
  phaseAt(time: number): RoutinePhase;
  /** Absolute game-second of the next arrival or departure strictly after `time`. */
  nextChangeAfter(time: number): number;
}

/**
 * Seconds into the cycle, plus how far float rounding can have moved them.
 *
 * `time` is a sum of whole cycles and a stop time, so it arrives with the low bits of the stop time
 * already rounded away; comparing a boundary against it needs a tolerance or a boundary that *is*
 * now reads as a change still to come, which would repeat forever.
 */
function localAt(time: number, cycleSeconds: number): { cycle: number; local: number; tolerance: number } {
  const cycle = Math.floor(time / cycleSeconds) * cycleSeconds;
  return { cycle, local: time - cycle, tolerance: Math.max(1e-9, Math.abs(time) * Number.EPSILON * 8) };
}

/**
 * Resolve an authored routine into a timeline driven by the world clock.
 *
 * Travel is what makes arrival times real: each stop departs early enough to walk there on time,
 * and when the previous stop ran long the arrival slips instead of the agent teleporting. A day
 * whose walks cannot fit its cycle throws rather than silently putting the agent in two places.
 *
 * @capability routine-timeline authored daily routines (home, work, meal) resolved against the world clock
 */
export function resolveRoutine(config: RoutineConfig): RoutineTimeline {
  if (config.stops.length === 0) throw new Error("routine needs at least one stop");
  const cycleSeconds =
    config.cycleSeconds !== undefined && config.cycleSeconds > 0 ? config.cycleSeconds : SECONDS_PER_GAME_DAY;
  const specs = config.stops;

  for (let i = 0; i < specs.length; i += 1) {
    const stop = specs[i]!;
    if (!Number.isFinite(stop.arriveAt) || stop.arriveAt < 0 || stop.arriveAt >= cycleSeconds) {
      throw new Error(`routine stop ${i} ("${stop.place}") needs arriveAt in [0, ${cycleSeconds}), got ${stop.arriveAt}`);
    }
    if (i > 0 && stop.arriveAt <= specs[i - 1]!.arriveAt) {
      throw new Error(
        `routine stops must be authored in ascending order; "${stop.place}" is not after "${specs[i - 1]!.place}"`,
      );
    }
  }

  const travelFrom = (from: number): number => {
    const index = from % specs.length;
    const stop = specs[index]!;
    if (stop.travelSeconds !== undefined) return Math.max(0, stop.travelSeconds);
    if (config.travelSeconds === undefined || specs.length < 2) return 0;
    const previous = specs[(index - 1 + specs.length) % specs.length]!;
    return Math.max(0, config.travelSeconds(previous.place, stop.place));
  };

  const arrive: number[] = [];
  for (let i = 0; i < specs.length; i += 1) {
    const planned = specs[i]!.arriveAt;
    arrive.push(i === 0 ? planned : Math.max(planned, arrive[i - 1]! + travelFrom(i)));
  }

  const depart: number[] = [];
  for (let i = 0; i < specs.length; i += 1) {
    const nextArrive = i + 1 < specs.length ? arrive[i + 1]! : arrive[0]! + cycleSeconds;
    const leave = nextArrive - travelFrom(i + 1 < specs.length ? i + 1 : 0);
    if (leave < arrive[i]! - 1e-9) {
      let needed = 0;
      for (let index = 0; index < specs.length; index += 1) needed += travelFrom(index);
      throw new Error(
        `routine does not fit its ${cycleSeconds} s cycle: it needs ${needed} s of walking and the stops leave too little room`,
      );
    }
    depart.push(Math.max(arrive[i]!, leave));
  }

  const stops: RoutineStop[] = specs.map((spec, index) => ({
    index,
    place: spec.place,
    activity: spec.activity ?? null,
    plannedArriveAt: spec.arriveAt,
    arriveAt: arrive[index]!,
    departAt: depart[index]!,
    refill: spec.refill === undefined ? null : { ...spec.refill },
  }));

  function phaseAt(time: number): RoutinePhase {
    const { cycle, local, tolerance } = localAt(time, cycleSeconds);
    if (stops.length === 1) {
      const only = stops[0]!;
      return {
        stop: 0,
        place: only.place,
        nextPlace: null,
        activity: only.activity,
        travelling: false,
        progress: 0,
        since: cycle + only.arriveAt,
        until: cycle + only.arriveAt + cycleSeconds,
      };
    }
    for (const stop of stops) {
      if (local >= stop.arriveAt - tolerance && local < stop.departAt - tolerance) {
        return {
          stop: stop.index,
          place: stop.place,
          nextPlace: null,
          activity: stop.activity,
          travelling: false,
          progress: 0,
          since: cycle + stop.arriveAt,
          until: cycle + stop.departAt,
        };
      }
    }
    let from = stops.length - 1;
    for (let i = 0; i < stops.length; i += 1) {
      if (stops[i]!.departAt <= local + tolerance) from = i;
    }
    const next = (from + 1) % stops.length;
    const departLocal = stops[from]!.departAt;
    const arriveLocal = stops[next]!.arriveAt + (next === 0 ? cycleSeconds : 0);
    const span = arriveLocal - departLocal;
    const start = departLocal > local ? departLocal - cycleSeconds : departLocal;
    const raw = span <= 0 ? 1 : (local - start) / span;
    const progress = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 1;
    return {
      stop: from,
      place: stops[from]!.place,
      nextPlace: stops[next]!.place,
      activity: null,
      travelling: true,
      progress,
      since: cycle + start,
      until: cycle + start + span,
    };
  }

  return {
    cycleSeconds,
    stops,
    phaseAt,
    nextChangeAfter(time) {
      const { cycle, tolerance } = localAt(time, cycleSeconds);
      let best = Infinity;
      for (const stop of stops) {
        for (const boundary of [stop.arriveAt, stop.departAt]) {
          // Absolute time, so a boundary that rounding has put a hair behind `time` cannot answer
          // with `time` itself and stall every caller that steps by the answer.
          let candidate = cycle + boundary;
          if (candidate <= time + tolerance) candidate += cycleSeconds;
          if (candidate < best) best = candidate;
        }
      }
      return best;
    },
  };
}
