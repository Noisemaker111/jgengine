import { pickWeighted } from "../../random/pick";

export interface StoryIncident<R = unknown> {
  id: string;
  cost: number;
  weight?: number;
  /** Seconds after it fires before it may fire again. Default `0`. */
  cooldownSeconds?: number;
  /** Elapsed seconds before it may fire at all. Default `0`. */
  after?: number;
  /** The game's own condition (nothing to break, nobody to visit). Omitted: always allowed. */
  when?: (reading: R) => boolean;
}

export interface StorytellerConfig<R = unknown> {
  incidents: readonly StoryIncident<R>[];
  /** Points gained per second, or a ramp read from elapsed seconds. */
  pointsPerSecond: number | ((elapsedSeconds: number) => number);
  scale?: (reading: R) => number;
  /** Points never build past this. Default unbounded. */
  maxPoints?: number;
  startPoints?: number;
  /** Seconds between incidents, drawn uniformly. */
  gap: { min: number; max: number };
  /** Seconds before the first incident. Default `gap.min`. */
  firstAfter?: number;
  /** Extra quiet seconds per point a threat spent. Default `0`. */
  restPerPoint?: number;
  repeatPenalty?: number;
  memory?: number;
  /**
   * How strongly picks lean toward spending the points on hand, `0..` (default `0`). At `1` an
   * incident costing all the points weighs twice its base weight, so a long quiet ends in a big beat.
   */
  preferSpend?: number;
}

export interface StorytellerState {
  elapsed: number;
  points: number;
  /** Elapsed seconds at which the next incident is drawn. */
  nextAt: number;
  /** Elapsed seconds each incident last fired. */
  lastFiredAt: Record<string, number>;
  /** Most recent picks, newest last, bounded by `memory`. */
  recent: string[];
  fired: number;
}

export interface StoryBeat<R = unknown> {
  incident: StoryIncident<R>;
  spent: number;
  /** Points on hand before the spend. */
  pointsBefore: number;
  elapsed: number;
}

export interface StorytellerView {
  points: number;
  secondsToNext: number;
  fired: number;
  elapsed: number;
}

export interface Storyteller<R = unknown> {
  advance(dtSeconds: number, reading: R, rng: () => number): StoryBeat<R> | null;
  eligible(reading: R): string[];
  view(): StorytellerView;
  snapshot(): StorytellerState;
  restore(next: StorytellerState): void;
  retune(config: StorytellerConfig<R>): void;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** @capability storyteller incident pacing by threat points that build with play time, with cooldowns, repeat damping and rest after big threats */
export function createStoryteller<R = unknown>(config: StorytellerConfig<R>): Storyteller<R> {
  let current = config;
  const gapMin = () => Math.max(0, finite(current.gap.min, 0));
  const gapMax = () => Math.max(gapMin(), finite(current.gap.max, gapMin()));
  let state: StorytellerState = {
    elapsed: 0,
    points: Math.max(0, finite(config.startPoints ?? 0, 0)),
    nextAt: Math.max(0, finite(config.firstAfter ?? config.gap.min, 0)),
    lastFiredAt: {},
    recent: [],
    fired: 0,
  };

  const rate = (elapsed: number): number => {
    const raw = typeof current.pointsPerSecond === "function" ? current.pointsPerSecond(elapsed) : current.pointsPerSecond;
    return Math.max(0, finite(raw, 0));
  };

  const allowed = (incident: StoryIncident<R>, reading: R): boolean => {
    if (incident.cost > state.points) return false;
    if (state.elapsed < (incident.after ?? 0)) return false;
    const last = state.lastFiredAt[incident.id];
    if (last !== undefined && state.elapsed - last < (incident.cooldownSeconds ?? 0)) return false;
    return incident.when === undefined || incident.when(reading);
  };

  const weightOf = (incident: StoryIncident<R>): number => {
    let weight = Math.max(0, finite(incident.weight ?? 1, 0));
    if (state.recent.includes(incident.id)) weight *= Math.max(0, finite(current.repeatPenalty ?? 0.25, 0.25));
    const lean = Math.max(0, finite(current.preferSpend ?? 0, 0));
    if (lean > 0 && state.points > 0) weight *= 1 + lean * Math.min(1, Math.max(0, incident.cost) / state.points);
    return weight;
  };

  return {
    advance(dtSeconds, reading, rng) {
      const dt = Math.max(0, finite(dtSeconds, 0));
      const scale = Math.max(0, finite(current.scale?.(reading) ?? 1, 1));
      state.points += rate(state.elapsed) * scale * dt;
      if (current.maxPoints !== undefined) state.points = Math.min(state.points, Math.max(0, current.maxPoints));
      state.elapsed += dt;
      if (state.elapsed < state.nextAt) return null;
      const pool = current.incidents.filter((incident) => allowed(incident, reading));
      const incident = pickWeighted(() => finite(rng(), 0), pool, weightOf);
      if (incident === undefined) {
        state.nextAt = state.elapsed + Math.max(1, gapMin());
        return null;
      }
      const pointsBefore = state.points;
      const spent = Math.max(0, incident.cost);
      state.points = Math.max(0, state.points - spent);
      state.lastFiredAt[incident.id] = state.elapsed;
      state.recent = [...state.recent, incident.id].slice(-Math.max(0, Math.round(current.memory ?? 3)));
      state.fired += 1;
      const gap = gapMin() + (gapMax() - gapMin()) * Math.min(1, Math.max(0, finite(rng(), 0)));
      state.nextAt = state.elapsed + gap + spent * Math.max(0, finite(current.restPerPoint ?? 0, 0));
      return { incident, spent, pointsBefore, elapsed: state.elapsed };
    },
    eligible(reading) {
      return current.incidents.filter((incident) => allowed(incident, reading)).map((incident) => incident.id);
    },
    view() {
      return { points: state.points, secondsToNext: Math.max(0, state.nextAt - state.elapsed), fired: state.fired, elapsed: state.elapsed };
    },
    snapshot() {
      return { ...state, lastFiredAt: { ...state.lastFiredAt }, recent: [...state.recent] };
    },
    restore(next) {
      const lastFiredAt: Record<string, number> = {};
      for (const [id, at] of Object.entries(next.lastFiredAt ?? {})) if (Number.isFinite(at)) lastFiredAt[id] = at;
      state = {
        elapsed: Math.max(0, finite(next.elapsed, 0)),
        points: Math.max(0, finite(next.points, 0)),
        nextAt: Math.max(0, finite(next.nextAt, 0)),
        lastFiredAt,
        recent: Array.isArray(next.recent) ? next.recent.filter((id): id is string => typeof id === "string") : [],
        fired: Math.max(0, Math.round(finite(next.fired, 0))),
      };
    },
    retune(next) {
      current = next;
    },
  };
}
