/** How the simulation is stepped: a fixed rate with a catch-up cap, or once per frame with the frame's dt. */
export interface SimulationConfig {
  /**
   * Fixed simulation rate in steps per second, or `"variable"` to run one step per frame with the frame's
   * clamped dt. Default {@link DEFAULT_SIM_HZ}. A fixed rate makes every step's dt identical, which is what
   * determinism, replay, rollback, and a stable physics solver need; the shell draws entities and points its
   * follow cameras at `ctx.sim.renderPose`, interpolated between steps. `"variable"` is an explicit choice.
   */
  hz?: number | "variable";
  /** Fixed steps run per advance before the loop drops the remaining time instead of spiralling. Default 5. */
  maxCatchUpSteps?: number;
  /** Entities that move farther than this in one step snap instead of interpolating (teleports, respawns). Default 8 world units. */
  snapDistance?: number;
}

/** Serializable loop position: the tick count and the real seconds accumulated toward the next fixed step. */
export interface SimLoopState {
  tick: number;
  accumulator: number;
}

/** What one {@link SimLoop.advance} did. */
export interface SimAdvanceResult {
  /** Steps run this advance. */
  steps: number;
  /** Fraction of a step accumulated but not yet simulated, 0..1; always 1 on a variable loop. */
  alpha: number;
  /** Tick count after this advance. */
  tick: number;
  /** Steps discarded because the catch-up cap was hit. */
  dropped: number;
  /** Of `steps`, those already run early by {@link SimLoop.stepAhead}, so this advance only accounted for them. */
  early: number;
}

/** The stepper handle: advance with real time, read the tick and interpolation alpha, retune the rate, snapshot and restore. */
export interface SimLoop {
  /** Feed real elapsed seconds; runs `step(dt, tick)` zero or more times and returns what happened. */
  advance(realDt: number, step: (dt: number, tick: number) => void): SimAdvanceResult;
  /**
   * Run the next fixed step now, before the advance that owes it, so a renderer can spend idle time between
   * frames on it instead of the frame where it falls due. That advance then counts it without running it;
   * if that advance is a little short of the step, the loop keeps the step and owes the time back, so the
   * sim never runs ahead of real time by more than one step. Returns false on a variable loop or when a step
   * is already ahead.
   */
  stepAhead(step: (dt: number, tick: number) => void): boolean;
  /** Real seconds still to accumulate before the next step not yet run falls due; `null` on a variable loop. */
  untilStep(): number | null;
  tick(): number;
  alpha(): number;
  /** Seconds per fixed step, `null` on a variable loop. */
  stepSeconds(): number | null;
  isFixed(): boolean;
  retune(config: SimulationConfig): void;
  config(): Readonly<Required<SimulationConfig>>;
  snapshot(): SimLoopState;
  restore(state: SimLoopState): void;
}

/** Steps per second a loop runs at when `hz` is not set: the physics backends' own substep rate, so one sim step is one solver step. */
export const DEFAULT_SIM_HZ = 60;
const DEFAULT_MAX_CATCH_UP = 5;
const DEFAULT_SNAP_DISTANCE = 8;

function resolveConfig(config: SimulationConfig | undefined): Required<SimulationConfig> {
  const hz = config?.hz;
  return {
    hz: hz === "variable" ? "variable" : typeof hz === "number" && Number.isFinite(hz) && hz > 0 ? hz : DEFAULT_SIM_HZ,
    maxCatchUpSteps: Math.max(1, Math.floor(config?.maxCatchUpSteps ?? DEFAULT_MAX_CATCH_UP)),
    snapDistance: config?.snapDistance ?? DEFAULT_SNAP_DISTANCE,
  };
}

/**
 * The simulation stepper every driver (shell frame, headless runner, authoritative host) advances through, so
 * the sim sees the same dt sequence regardless of who drives it. Fixed mode accumulates real time and steps in
 * equal slices with a catch-up cap (60 Hz unless the game picks another rate); variable mode steps once per advance.
 *
 * @capability sim-loop fixed-step or variable simulation stepping with tick count, catch-up cap, and interpolation alpha
 */
export function createSimLoop(initial?: SimulationConfig): SimLoop {
  let config = resolveConfig(initial);
  let tick = 0;
  let accumulator = 0;
  let alpha = 1;
  // A step run early by stepAhead and not yet reached by real time.
  let ahead = false;

  /** Count an early step as reached: the accumulator may go below zero, which the next frames repay. */
  function settleAhead(stepDt: number): void {
    if (!ahead) return;
    ahead = false;
    accumulator -= stepDt;
  }

  function stepSeconds(): number | null {
    return config.hz === "variable" ? null : 1 / config.hz;
  }

  return {
    advance(realDt, step) {
      if (!(realDt > 0)) return { steps: 0, alpha, tick, dropped: 0, early: 0 };
      const stepDt = stepSeconds();
      if (stepDt === null) {
        tick += 1;
        alpha = 1;
        step(realDt, tick);
        return { steps: 1, alpha, tick, dropped: 0, early: 0 };
      }
      accumulator += realDt;
      // Time fed as exact multiples of a step (1 s at 60 Hz in slices) must run every step despite float drift.
      const due = stepDt * (1 - 1e-9);
      let steps = 0;
      let early = 0;
      if (ahead) {
        // The early step is the first one this advance owes; a frame that ends just short of it still shows
        // it, owing the remainder, rather than holding a world the sim has already moved past.
        settleAhead(stepDt);
        steps = 1;
        early = 1;
      }
      while (accumulator >= due && steps < config.maxCatchUpSteps) {
        tick += 1;
        step(stepDt, tick);
        accumulator = Math.max(0, accumulator - stepDt);
        steps += 1;
      }
      let dropped = 0;
      if (accumulator >= due) {
        dropped = Math.floor(accumulator / due);
        accumulator = Math.max(0, accumulator - dropped * stepDt);
      }
      alpha = Math.max(0, accumulator) / stepDt;
      return { steps, alpha, tick, dropped, early };
    },
    stepAhead(step) {
      const stepDt = stepSeconds();
      if (stepDt === null || ahead) return false;
      ahead = true;
      tick += 1;
      step(stepDt, tick);
      return true;
    },
    untilStep() {
      const stepDt = stepSeconds();
      if (stepDt === null) return null;
      return Math.max(0, stepDt * (ahead ? 2 : 1) - accumulator);
    },
    tick: () => tick,
    alpha: () => alpha,
    stepSeconds,
    isFixed: () => config.hz !== "variable",
    retune(next) {
      const before = stepSeconds();
      if (before !== null) settleAhead(before);
      config = resolveConfig({ ...config, ...next });
      if (config.hz === "variable") {
        accumulator = 0;
        alpha = 1;
      }
    },
    config: () => config,
    snapshot: () => {
      const stepDt = stepSeconds();
      return { tick, accumulator: ahead && stepDt !== null ? accumulator - stepDt : accumulator };
    },
    restore(state) {
      tick = state.tick;
      accumulator = state.accumulator;
      ahead = false;
      alpha = config.hz === "variable" ? 1 : Math.max(0, accumulator) * config.hz;
    },
  };
}
