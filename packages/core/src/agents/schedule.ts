import { resolveRoutine, type RoutineStopSpec } from "../sim/routine";

/**
 * One authored stop in an agent's day. The shape is the routine owner's (`sim/routine`) plus a
 * beat: the places a working stop walks in order, so a janitor on patrol is an agent with a route
 * rather than a special case.
 */
export interface AgentScheduleStop extends RoutineStopSpec {
  /** Places walked in order while this stop holds. Omit to stay put at `place`. */
  readonly beat?: readonly string[];
  /** Seconds at each beat place. Default: the stop's own length split evenly across the beat. */
  readonly beatDwellSeconds?: number;
}

/** An agent's whole day as data: what it does, where, and when. */
export interface AgentScheduleConfig {
  readonly stops: readonly AgentScheduleStop[];
  /** Cycle length in game-seconds; default one game day. */
  readonly cycleSeconds?: number;
  /** Injected travel time between two places when a stop does not author `travelSeconds`. */
  readonly travelSeconds?: (from: string, to: string) => number;
}

/** Where a schedule puts an agent at one instant. */
export interface AgentSchedulePhase {
  /** Opaque place the agent occupies, or the place it is walking from. */
  readonly place: string;
  /** Place it is walking to; `null` while holding. */
  readonly nextPlace: string | null;
  /** The stop's activity label ("work", "meal", "sleep"); `null` while travelling. */
  readonly activity: string | null;
  /** Where the beat posts the agent right now: a patrol place on a beating stop, `place` otherwise, `null` while travelling. */
  readonly post: string | null;
  readonly travelling: boolean;
  /** 0 at departure to 1 on arrival. */
  readonly progress: number;
  /** Absolute game-second this phase began. */
  readonly since: number;
  /** Absolute game-second the next phase begins. */
  readonly until: number;
  /** Index of the stop held here, or the stop being walked away from. */
  readonly stop: number;
  /** Needs this stop refills on arrival, or `null`. */
  readonly refill: Readonly<Record<string, number>> | null;
}

/** A day plan resolved against the world clock. No state to tick: a far agent reads the same day. */
export interface AgentSchedule {
  readonly cycleSeconds: number;
  readonly stops: readonly AgentScheduleStop[];
  phaseAt(time: number): AgentSchedulePhase;
  /** Absolute game-second of the next arrival, departure or beat step strictly after `time`. */
  nextChangeAfter(time: number): number;
}

/** One compiled beat: places and the seconds each holds. */
interface CompiledBeat {
  readonly places: readonly string[];
  readonly dwellSeconds: number;
}

/**
 * Resolve an authored day plan into a clock-driven schedule. Timing, travel and arrival slips come
 * from `sim/routine`; this adds the work beat and the refills a stop carries, so an off-hours stop
 * is just another authored stop and a patrol is not a second scheduler.
 *
 * @capability agent-schedule an authored per-agent day plan with a work beat and off-hours behaviour
 */
export function createAgentSchedule(config: AgentScheduleConfig): AgentSchedule {
  const timeline = resolveRoutine({
    stops: config.stops,
    ...(config.cycleSeconds === undefined ? {} : { cycleSeconds: config.cycleSeconds }),
    ...(config.travelSeconds === undefined ? {} : { travelSeconds: config.travelSeconds }),
  });

  const beats: (CompiledBeat | null)[] = config.stops.map((stop, index) => {
    const resolved = timeline.stops[index]!;
    const places = stop.beat !== undefined && stop.beat.length > 0 ? [...stop.beat] : null;
    if (places === null) return null;
    const span = Math.max(0, resolved.departAt - resolved.arriveAt);
    const dwell = stop.beatDwellSeconds ?? span / places.length;
    return { places, dwellSeconds: Math.max(dwell, 0) };
  });

  const postAt = (time: number, phase: ReturnType<typeof timeline.phaseAt>): string | null => {
    if (phase.travelling) return null;
    const beat = beats[phase.stop] ?? null;
    if (beat === null) return phase.place;
    if (!(beat.dwellSeconds > 0)) return beat.places[0] ?? phase.place;
    const elapsed = Math.max(0, time - phase.since);
    const step = Math.floor(elapsed / beat.dwellSeconds) % beat.places.length;
    return beat.places[step] ?? phase.place;
  };

  const beatOf = (phase: { stop: number; travelling: boolean }): CompiledBeat | null => {
    if (phase.travelling) return null;
    const beat = beats[phase.stop] ?? null;
    return beat !== null && beat.dwellSeconds > 0 ? beat : null;
  };

  return {
    cycleSeconds: timeline.cycleSeconds,
    stops: config.stops,
    phaseAt(time) {
      const phase = timeline.phaseAt(time);
      const stop = config.stops[phase.stop]!;
      return {
        place: phase.place,
        nextPlace: phase.nextPlace,
        activity: phase.activity,
        post: postAt(time, phase),
        travelling: phase.travelling,
        progress: phase.progress,
        since: phase.since,
        until: phase.until,
        stop: phase.stop,
        refill: stop.refill ?? null,
      };
    },
    nextChangeAfter(time) {
      const phaseEnd = timeline.nextChangeAfter(time);
      const beat = beatOf(timeline.phaseAt(time));
      if (beat === null) return phaseEnd;
      const phase = timeline.phaseAt(time);
      const elapsed = Math.max(0, time - phase.since);
      const beatEnd = phase.since + (Math.floor(elapsed / beat.dwellSeconds) + 1) * beat.dwellSeconds;
      return beatEnd > time ? Math.min(phaseEnd, beatEnd) : phaseEnd;
    },
  };
}
