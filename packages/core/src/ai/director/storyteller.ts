/**
 * The storyteller: what happens to a colony, a household or a crew between the player's own
 * decisions. Threat points build with play time (and with whatever the game says makes it a richer
 * target), and every gap an incident is drawn from the ones the points can afford, so early days
 * get small trouble and boons while later days can afford the big ones. A threat that spends a lot
 * buys extra quiet afterwards. The game owns what an incident does; this owns when and which.
 */

import { pickWeighted } from "../../random/pick";

/** One thing that can happen. Boons cost nothing; threats spend the points they cost. */
export interface StoryIncident<R = unknown> {
  id: string;
  /** Points this incident spends when it fires. `0` for a boon or a neutral beat. */
  cost: number;
  /** Relative pick weight among the incidents that can fire. Default `1`. */
  weight?: number;
  /** Seconds after it fires before it may fire again. Default `0`. */
  cooldownSeconds?: number;
  /** Elapsed seconds before it may fire at all. Default `0`. */
  after?: number;
  /** The game's own condition (nothing to break, nobody to visit). Omitted: always allowed. */
  when?: (reading: R) => boolean;
}

/** Pacing: how fast points build, how far apart incidents are and how picks lean. */
export interface StorytellerConfig<R = unknown> {
  incidents: readonly StoryIncident<R>[];
  /** Points gained per second, or a ramp read from elapsed seconds. */
  pointsPerSecond: number | ((elapsedSeconds: number) => number);
  /** Multiplier on point gain read from the game (wealth, notoriety). Default `1`. */
  scale?: (reading: R) => number;
  /** Points never build past this. Default unbounded. */
  maxPoints?: number;
  /** Points at the start. Default `0`. */
  startPoints?: number;
  /** Seconds between incidents, drawn uniformly. */
  gap: { min: number; max: number };
  /** Seconds before the first incident. Default `gap.min`. */
  firstAfter?: number;
  /** Extra quiet seconds per point a threat spent. Default `0`. */
  restPerPoint?: number;
  /** Weight multiplier for an incident among the last `memory` picks. Default `0.25`. */
  repeatPenalty?: number;
  /** How many recent picks the repeat penalty remembers. Default `3`. */
  memory?: number;
  /**
   * How strongly picks lean toward spending the points on hand, `0..` (default `0`). At `1` an
   * incident costing all the points weighs twice its base weight, so a long quiet ends in a big beat.
   */
  preferSpend?: number;
}

/** Serializable storyteller state. */
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

/** One incident the storyteller chose, with the points it spent. */
export interface StoryBeat<R = unknown> {
  incident: StoryIncident<R>;
  spent: number;
  /** Points on hand before the spend. */
  pointsBefore: number;
  elapsed: number;
}

/** The storyteller as a HUD or probe reads it. */
export interface StorytellerView {
  points: number;
  secondsToNext: number;
  fired: number;
  elapsed: number;
}

/** A running storyteller: advance it with play time and apply the incidents it draws. */
export interface Storyteller<R = unknown> {
  /** Advance by `dtSeconds`; returns the incident drawn on this step, or null. The caller applies it. */
  advance(dtSeconds: number, reading: R, rng: () => number): StoryBeat<R> | null;
  /** Incident ids that could fire right now with the points on hand. */
  eligible(reading: R): string[];
  view(): StorytellerView;
  snapshot(): StorytellerState;
  restore(next: StorytellerState): void;
  /** Change pacing or the incident list; points, history and the next draw time are kept. */
  retune(config: StorytellerConfig<R>): void;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Build a storyteller that paces incidents by threat points.
 *
 * @capability storyteller incident pacing by threat points that build with play time, with cooldowns, repeat damping and rest after big threats
 */
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
