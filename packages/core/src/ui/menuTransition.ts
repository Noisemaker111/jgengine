/**
 * The phase timing behind an animated menu screen: closed → entering → open → exiting → closed. Pure
 * timing over an injected clock, so a React block can animate with CSS and still know exactly when an
 * exit finished and the screen may unmount. Reduced motion collapses every duration to zero instead
 * of skipping the state machine, so callers never branch on it.
 */

/** Where a menu screen is in its enter/exit animation. */
export type MenuTransitionPhase = "closed" | "enter" | "open" | "exit";

/** Durations and accessibility policy for one transition. */
export interface MenuTransitionConfig {
  /** Enter duration, ms. Default 220. */
  enterMs?: number;
  /** Exit duration, ms. Default 160. */
  exitMs?: number;
  /** Collapse both durations to zero (the accessibility "reduced motion" preference). */
  reducedMotion?: boolean;
}

/** Serializable phase state. */
export interface MenuTransitionSnapshot {
  phase: MenuTransitionPhase;
  /** Clock time (ms) the phase started. */
  since: number;
}

/** Observable enter/exit phase machine. */
export interface MenuTransition {
  state(): MenuTransitionSnapshot;
  /** Begin entering from closed/exit, or go straight to open when motion is off. No-op when entering/open. */
  open(now: number): void;
  /** Begin exiting from entering/open. No-op when already exiting/closed. */
  close(now: number): void;
  /** Advance the machine to `now`; entering → open and exiting → closed happen here. */
  tick(now: number): MenuTransitionSnapshot;
  subscribe(listener: () => void): () => void;
  snapshot(): MenuTransitionSnapshot;
  restore(snapshot: MenuTransitionSnapshot): void;
}

/** The enter and exit durations after reduced-motion is applied. */
export function menuTransitionDurations(config: MenuTransitionConfig = {}): { enter: number; exit: number } {
  if (config.reducedMotion === true) return { enter: 0, exit: 0 };
  return { enter: Math.max(0, config.enterMs ?? 220), exit: Math.max(0, config.exitMs ?? 160) };
}

/** How long the current phase lasts, in ms (0 for open/closed). */
export function menuTransitionPhaseMs(phase: MenuTransitionPhase, config: MenuTransitionConfig = {}): number {
  const { enter, exit } = menuTransitionDurations(config);
  return phase === "enter" ? enter : phase === "exit" ? exit : 0;
}

/**
 * Create a {@link MenuTransition}. `open`/`close` start a phase; `tick` advances it once its duration
 * has elapsed. Nothing schedules timers here — the caller ticks from its animation loop or a timeout.
 *
 * @capability menu-transition enter/exit phase timing for an animated menu screen, with reduced-motion collapse and snapshot/restore
 */
export function createMenuTransition(config: MenuTransitionConfig = {}, initial?: MenuTransitionSnapshot): MenuTransition {
  let state: MenuTransitionSnapshot = initial ?? { phase: "closed", since: 0 };
  const listeners = new Set<() => void>();

  function commit(next: MenuTransitionSnapshot): void {
    if (next.phase === state.phase && next.since === state.since) return;
    state = next;
    for (const listener of listeners) listener();
  }

  function open(now: number): void {
    if (state.phase === "enter" || state.phase === "open") return;
    commit({ phase: menuTransitionDurations(config).enter === 0 ? "open" : "enter", since: now });
  }

  function close(now: number): void {
    if (state.phase === "exit" || state.phase === "closed") return;
    commit({ phase: menuTransitionDurations(config).exit === 0 ? "closed" : "exit", since: now });
  }

  return {
    state: () => state,
    open,
    close,
    tick(now) {
      const duration = menuTransitionPhaseMs(state.phase, config);
      if (duration > 0 && now - state.since < duration) return state;
      if (state.phase === "enter") commit({ phase: "open", since: now });
      else if (state.phase === "exit") commit({ phase: "closed", since: now });
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => state,
    restore(snapshot) {
      commit({ phase: snapshot.phase, since: snapshot.since });
    },
  };
}
