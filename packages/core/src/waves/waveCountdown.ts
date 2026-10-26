/**
 * The clock between waves: once a wave has finished arriving, the next one goes out on its own when
 * the intermission runs down, and calling it early pays for the seconds skipped. Tower defense's
 * "send early" economy, a horde mode's breather, an arena's next round: the game decides what a
 * release is and what the bonus buys; this owns the timing and the price.
 */

/** What calling a wave early pays: gold, score or charge per second left on the clock. */
export interface EarlyCallBonus {
  perSecond: number;
  /** Most one call can pay. */
  max?: number;
}

/** How long each intermission runs and what calling a wave early pays. */
export interface WaveCountdownConfig {
  /** Seconds of intermission before `nextWave` (1-based) goes out on its own. */
  intermission: number | ((nextWave: number) => number);
  /** Omitted: calling early pays nothing. */
  earlyBonus?: EarlyCallBonus;
}

/** Serializable clock state. */
export interface WaveCountdownState {
  armed: boolean;
  /** The wave the clock is counting down to (1-based); 0 before the first arm. */
  nextWave: number;
  remaining: number;
  total: number;
}

/** The clock as a HUD reads it. */
export interface WaveCountdownView extends WaveCountdownState {
  /** Share of the intermission already gone, `0..1` (1 when not armed). */
  elapsed: number;
  /** What calling early would pay right now. */
  bonus: number;
}

/** What an early call did: the wave it released, the seconds it skipped and what that paid. */
export interface EarlyCall {
  wave: number;
  secondsSkipped: number;
  bonus: number;
}

/** The clock between waves: arm it when a wave has arrived, tick it, and release on the tick it runs out. */
export interface WaveCountdown {
  /** Start counting down to `nextWave`, replacing any clock already running. */
  arm(nextWave: number): void;
  /** Stop the clock without releasing anything (a paused intermission, a run that ended). */
  disarm(): void;
  /** Advance the clock; true on the tick it runs out, which disarms it. The caller releases the wave. */
  tick(dtSeconds: number): boolean;
  /** Call the counted wave now: disarms and reports the bonus, or null when no clock is running. */
  callEarly(): EarlyCall | null;
  /** What calling early would pay now (0 when not armed). */
  bonusNow(): number;
  view(): WaveCountdownView;
  snapshot(): WaveCountdownState;
  restore(next: WaveCountdownState): void;
  /** Change the intermission or the bonus; a running clock keeps its remaining seconds. */
  retune(config: WaveCountdownConfig): void;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Build the clock between waves.
 *
 * @capability wave-countdown intermission clock between waves that releases the next one when it runs out and prices calling it early
 */
export function createWaveCountdown(config: WaveCountdownConfig): WaveCountdown {
  let current = config;
  let state: WaveCountdownState = { armed: false, nextWave: 0, remaining: 0, total: 0 };

  const intermissionFor = (wave: number): number => {
    const raw = typeof current.intermission === "function" ? current.intermission(wave) : current.intermission;
    return Math.max(0, finite(raw, 0));
  };

  const bonusFor = (remaining: number): number => {
    const bonus = current.earlyBonus;
    if (bonus === undefined || remaining <= 0) return 0;
    const raw = Math.floor(Math.max(0, finite(bonus.perSecond, 0)) * remaining);
    return bonus.max === undefined ? raw : Math.min(Math.max(0, bonus.max), raw);
  };

  return {
    arm(nextWave) {
      const total = intermissionFor(nextWave);
      state = { armed: true, nextWave, remaining: total, total };
    },
    disarm() {
      state = { ...state, armed: false, remaining: 0 };
    },
    tick(dtSeconds) {
      if (!state.armed) return false;
      const remaining = state.remaining - Math.max(0, finite(dtSeconds, 0));
      if (remaining > 0) {
        state = { ...state, remaining };
        return false;
      }
      state = { ...state, armed: false, remaining: 0 };
      return true;
    },
    callEarly() {
      if (!state.armed) return null;
      const call: EarlyCall = { wave: state.nextWave, secondsSkipped: state.remaining, bonus: bonusFor(state.remaining) };
      state = { ...state, armed: false, remaining: 0 };
      return call;
    },
    bonusNow() {
      return state.armed ? bonusFor(state.remaining) : 0;
    },
    view() {
      const elapsed = !state.armed || state.total <= 0 ? 1 : 1 - state.remaining / state.total;
      return { ...state, elapsed, bonus: state.armed ? bonusFor(state.remaining) : 0 };
    },
    snapshot() {
      return { ...state };
    },
    restore(next) {
      state = {
        armed: next.armed === true,
        nextWave: Math.max(0, Math.round(finite(next.nextWave, 0))),
        remaining: Math.max(0, finite(next.remaining, 0)),
        total: Math.max(0, finite(next.total, 0)),
      };
    },
    retune(next) {
      current = next;
    },
  };
}
