import { hashString } from "../random/rng";

/**
 * Interest scheduling: the scale primitive that lets far-away agents sleep instead of running
 * acquisition and pathing every frame. A per-agent gate decides — from proximity to the nearest
 * interest source plus explicit wake signals — whether this tick does expensive work, at what
 * cadence, with hysteresis so it never thrashes at the boundary and deterministic staggering so a
 * thousand siblings do not all wake on the same frame. State is a plain serializable object; the
 * caller drives it from a bounded spatial query, never a full-world scan.
 */

/** Whether an agent's gate is doing work (`active`) or culled (`dormant`). */
export type InterestState = "active" | "dormant";

/** A distance-keyed cadence tier: nearer agents tick faster, farther-but-awake agents tick slower. */
export interface InterestTier {
  /** Applies when proximity is at or below this distance. */
  readonly within: number;
  /** Seconds between active ticks in this tier (`0` = every tick). */
  readonly interval: number;
}

/** Static configuration shared by every gate of one behavior class. */
export interface InterestSchedulerConfig {
  /** Proximity at or below which a dormant agent wakes. */
  readonly wakeRadius: number;
  /**
   * Proximity above which an active agent sleeps. Must be >= `wakeRadius`; the gap between them is
   * the hysteresis band that stops sleep/wake thrash at the edge. Default: `wakeRadius` (no band).
   */
  readonly sleepRadius?: number;
  /** Seconds between active ticks while awake (`0` = every tick). Overridden by a matching tier. */
  readonly activeInterval?: number;
  /**
   * Distance-keyed cadence tiers, checked in array order with the first `proximity <= within` match
   * winning — so order them nearest-first (smallest `within` first). Overrides `activeInterval`.
   */
  readonly tiers?: readonly InterestTier[];
  /** After any wake signal, stay active at least this long regardless of proximity. Default `0`. */
  readonly stayAwakeSeconds?: number;
}

/** Per-agent serializable gate state. Round-trip the whole object; never read fields to drive logic. */
export interface InterestGateState {
  state: InterestState;
  /** Time accrued toward the next active tick. */
  clock: number;
  /** Remaining forced-awake time from the last wake signal. */
  awakeHold: number;
  /** Deterministic `[0,1)` cadence offset so sibling agents fire on different frames. */
  phase: number;
}

/** Per-tick input the caller supplies to a gate. */
export interface InterestGateInput {
  /** Distance to the nearest interest source (player, threat, owner); `null` when none / unknown. */
  readonly proximity?: number | null;
  /** Explicit wake trigger — damage, event, ownership change, caller override. Forces active. */
  readonly wake?: boolean;
}

/** Per-tick output that tells the caller whether to run expensive work. */
export interface InterestGateStep {
  /** The gate's state after this tick. */
  readonly state: InterestState;
  /** Run the expensive work (acquisition, pathing) this tick? */
  readonly active: boolean;
  /** Transitioned dormant→active this tick — the single-frame wake edge. */
  readonly woke: boolean;
  /** Transitioned active→dormant this tick — the single-frame sleep edge. */
  readonly slept: boolean;
}

/**
 * A deterministic `[0,1)` cadence phase derived from a stable id, for staggering sibling gates so a
 * batch of agents spawned together does not fire their first active tick on the same frame. Pass the
 * result as the `phase` argument to {@link createInterestGateState}.
 *
 * @capability interest-stagger deterministic per-id cadence phase that spreads sibling gate ticks across frames
 */
export function interestPhase(seed: string | number): number {
  const hashed = typeof seed === "number" ? hashString(String(seed)) : hashString(seed);
  return (hashed % 100000) / 100000;
}

function nominalInterval(config: InterestSchedulerConfig): number {
  return config.activeInterval ?? config.tiers?.[0]?.interval ?? 0;
}

/**
 * Create a dormant gate state, staggered by `phase` (`[0,1)`, typically {@link interestPhase} of the
 * agent id) so siblings created together do not all fire their first active tick on the same frame.
 *
 * @capability interest-gate per-agent sleep/wake + cadence gate state so far agents skip expensive ticks
 */
export function createInterestGateState(config: InterestSchedulerConfig, phase = 0): InterestGateState {
  const clamped = phase - Math.floor(phase);
  return {
    state: "dormant",
    clock: clamped * nominalInterval(config),
    awakeHold: 0,
    phase: clamped,
  };
}

function intervalFor(config: InterestSchedulerConfig, proximity: number | null): number {
  if (config.tiers !== undefined && proximity !== null) {
    for (const tier of config.tiers) {
      if (proximity <= tier.within) return Math.max(0, tier.interval);
    }
  }
  return Math.max(0, config.activeInterval ?? 0);
}

/**
 * Advance one gate by `dt` seconds against this tick's `input`, mutating `state` in place and
 * returning what the caller should do. Sleeping skips the expensive work (`active: false`) while the
 * gate's timers keep advancing, so state is preserved; a `wake` signal or crossing `wakeRadius`
 * flips it back to active and fires an immediate tick.
 *
 * @capability interest-scheduler advance a sleep/wake gate with hysteresis, cadence tiers, and stagger
 */
export function advanceInterestGate(
  state: InterestGateState,
  config: InterestSchedulerConfig,
  dt: number,
  input: InterestGateInput = {},
): InterestGateStep {
  const wakeRadius = config.wakeRadius;
  const sleepRadius = Math.max(config.sleepRadius ?? wakeRadius, wakeRadius);
  const proximity = input.proximity ?? null;
  const prev = state.state;

  if (input.wake === true) {
    state.awakeHold = Math.max(state.awakeHold, config.stayAwakeSeconds ?? 0);
  }

  let want: InterestState;
  if (input.wake === true || state.awakeHold > 0) {
    want = "active";
  } else if (proximity === null) {
    want = prev;
  } else if (prev === "dormant") {
    want = proximity <= wakeRadius ? "active" : "dormant";
  } else {
    want = proximity > sleepRadius ? "dormant" : "active";
  }

  state.state = want;
  const woke = prev === "dormant" && want === "active";
  const slept = prev === "active" && want === "dormant";

  let active = false;
  if (want === "active") {
    const interval = intervalFor(config, proximity);
    if (interval <= 0 || woke || input.wake === true) {
      active = true;
      state.clock = 0;
    } else {
      state.clock += dt;
      if (state.clock >= interval) {
        active = true;
        state.clock -= interval;
      }
    }
  } else {
    // Dormant: expensive work is skipped, but the gate keeps its timers so a later wake resumes cleanly.
    state.clock = 0;
  }

  if (state.awakeHold > 0) state.awakeHold = Math.max(0, state.awakeHold - dt);

  return { state: want, active, woke, slept };
}

/** Aggregate counts of active vs dormant gates — the metric the issue asks a scheduler to expose. */
export interface InterestCensus {
  active: number;
  dormant: number;
  total: number;
}

/** A running census accumulator; call `record` inside the caller's existing tick loop (no extra pass). */
export interface InterestCensusAccumulator {
  record(state: InterestState | InterestGateState): void;
  snapshot(): InterestCensus;
  reset(): void;
}

/**
 * Create a census accumulator so the caller can tally active/dormant gates during the loop it already
 * runs, avoiding any separate full-world scan just to report scheduler metrics.
 *
 * @capability interest-census running active/dormant gate tally folded into the caller's tick loop
 */
export function createInterestCensus(): InterestCensusAccumulator {
  let active = 0;
  let dormant = 0;
  return {
    record(state) {
      const value = typeof state === "string" ? state : state.state;
      if (value === "active") active += 1;
      else dormant += 1;
    },
    snapshot: () => ({ active, dormant, total: active + dormant }),
    reset() {
      active = 0;
      dormant = 0;
    },
  };
}
