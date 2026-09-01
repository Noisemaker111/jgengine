/** How the simulation is stepped: a fixed rate with a catch-up cap, or once per frame with the frame's dt. */
export interface SimulationConfig {
  /**
   * Fixed simulation rate in steps per second, or `"variable"` to run one step per frame with the frame's
   * clamped dt. Default `"variable"` (the historical behavior). A fixed rate makes every step's dt identical,
   * which is what determinism, replay, rollback, and a stable physics solver need; renderers read
   * `ctx.sim.renderPose` to interpolate between steps.
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
}

/** The stepper handle: advance with real time, read the tick and interpolation alpha, retune the rate, snapshot and restore. */
export interface SimLoop {
  /** Feed real elapsed seconds; runs `step(dt, tick)` zero or more times and returns what happened. */
  advance(realDt: number, step: (dt: number, tick: number) => void): SimAdvanceResult;
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

const DEFAULT_MAX_CATCH_UP = 5;
const DEFAULT_SNAP_DISTANCE = 8;

function resolveConfig(config: SimulationConfig | undefined): Required<SimulationConfig> {
  const hz = config?.hz;
  return {
    hz: typeof hz === "number" && Number.isFinite(hz) && hz > 0 ? hz : "variable",
    maxCatchUpSteps: Math.max(1, Math.floor(config?.maxCatchUpSteps ?? DEFAULT_MAX_CATCH_UP)),
    snapDistance: config?.snapDistance ?? DEFAULT_SNAP_DISTANCE,
  };
}

/**
 * The simulation stepper every driver (shell frame, headless runner, authoritative host) advances through, so
 * the sim sees the same dt sequence regardless of who drives it. Fixed mode accumulates real time and steps in
 * equal slices with a catch-up cap; variable mode steps once per advance.
 *
 * @capability sim-loop fixed-step or variable simulation stepping with tick count, catch-up cap, and interpolation alpha
 */
export function createSimLoop(initial?: SimulationConfig): SimLoop {
  let config = resolveConfig(initial);
  let tick = 0;
  let accumulator = 0;
  let alpha = 1;

  function stepSeconds(): number | null {
    return config.hz === "variable" ? null : 1 / config.hz;
  }

  return {
    advance(realDt, step) {
      if (!(realDt > 0)) return { steps: 0, alpha, tick, dropped: 0 };
      const stepDt = stepSeconds();
      if (stepDt === null) {
        tick += 1;
        alpha = 1;
        step(realDt, tick);
        return { steps: 1, alpha, tick, dropped: 0 };
      }
      accumulator += realDt;
      let steps = 0;
      while (accumulator >= stepDt && steps < config.maxCatchUpSteps) {
        tick += 1;
        step(stepDt, tick);
        accumulator -= stepDt;
        steps += 1;
      }
      let dropped = 0;
      if (accumulator >= stepDt) {
        dropped = Math.floor(accumulator / stepDt);
        accumulator -= dropped * stepDt;
      }
      alpha = accumulator / stepDt;
      return { steps, alpha, tick, dropped };
    },
    tick: () => tick,
    alpha: () => alpha,
    stepSeconds,
    isFixed: () => config.hz !== "variable",
    retune(next) {
      config = resolveConfig({ ...config, ...next });
      if (config.hz === "variable") {
        accumulator = 0;
        alpha = 1;
      }
    },
    config: () => config,
    snapshot: () => ({ tick, accumulator }),
    restore(state) {
      tick = state.tick;
      accumulator = state.accumulator;
      alpha = config.hz === "variable" ? 1 : accumulator * config.hz;
    },
  };
}
