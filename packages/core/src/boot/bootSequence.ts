/**
 * The screens a game opens through, in the only order they may show: the page opens, one engine
 * loading screen if anything is still loading, the game's own intro, its main menu, a short
 * entering screen when Play needs more loading, then play. Every step after `open` is optional;
 * none repeats and none comes back.
 */
export const BOOT_STEPS = ["open", "loading", "intro", "menu", "entering", "playing"] as const;

/** One screen of the boot. */
export type BootStep = (typeof BOOT_STEPS)[number];

/** What a boot recorded: each step it showed, in order, and every request it refused. */
export interface BootSequenceState {
  history: BootStep[];
  refused: string[];
}

/** The page's boot: the one authority on which boot screen shows. */
export interface BootSequence {
  /** The screen showing now. */
  step: () => BootStep;
  /**
   * Ask for a screen. A later step is entered; the current one is kept; an earlier one is refused
   * and recorded, so a second loading screen or a return to the menu during boot never shows.
   * Returns whether `step` is the screen now.
   */
  enter: (step: BootStep, reason?: string) => boolean;
  /** Record a boot fault that is not a screen request (a world that vanished to load). */
  fault: (reason: string) => void;
  /** Whether the boot reached play: later loading belongs to the game, not the boot. */
  done: () => boolean;
  subscribe: (listener: () => void) => () => void;
  snapshot: () => BootSequenceState;
  restore: (state: BootSequenceState) => void;
  reset: () => void;
}

const rank = (step: BootStep): number => BOOT_STEPS.indexOf(step);

/** A boot at `open`, with an optional sink told after every change (a page stamps it for checks). @internal */
export function createBootSequence(onChange?: (state: BootSequenceState) => void): BootSequence {
  let state: BootSequenceState = { history: ["open"], refused: [] };
  const listeners = new Set<() => void>();
  const changed = (): void => {
    onChange?.(state);
    for (const listener of listeners) listener();
  };
  const current = (): BootStep => state.history[state.history.length - 1]!;
  onChange?.(state);
  return {
    step: current,
    enter(step, reason) {
      const now = current();
      if (step === now) return true;
      if (rank(step) < rank(now)) {
        state = { ...state, refused: [...state.refused, `${now} -> ${step}${reason === undefined ? "" : ` (${reason})`}`] };
        changed();
        return false;
      }
      state = { ...state, history: [...state.history, step] };
      changed();
      return true;
    },
    fault(reason) {
      state = { ...state, refused: [...state.refused, `${current()}: ${reason}`] };
      changed();
    },
    done: () => current() === "playing",
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => ({ history: [...state.history], refused: [...state.refused] }),
    restore(next) {
      state = { history: [...next.history], refused: [...next.refused] };
      changed();
    },
    reset() {
      state = { history: ["open"], refused: [] };
      changed();
    },
  };
}

/**
 * What is wrong with a recorded boot: a step shown twice, a step out of order, a step that is not
 * a boot screen, or a refused request. Empty when the boot showed each screen once, in order.
 * @internal
 */
export function bootSequenceErrors(history: readonly string[], refused: readonly string[] = []): string[] {
  const errors: string[] = [];
  if (history[0] !== "open") errors.push(`the boot must start at open, not ${history[0] ?? "nothing"}`);
  const seen = new Set<string>();
  let last = -1;
  for (const step of history) {
    const at = (BOOT_STEPS as readonly string[]).indexOf(step);
    if (at < 0) errors.push(`${step} is not a boot screen`);
    else if (seen.has(step)) errors.push(`${step} showed twice`);
    else if (at < last) errors.push(`${step} showed after ${BOOT_STEPS[last]}`);
    seen.add(step);
    if (at >= 0) last = Math.max(last, at);
  }
  for (const request of refused) errors.push(`refused: ${request}`);
  return errors;
}

/** The page attribute a boot is stamped on, for a check that reads a running game. */
export const BOOT_SEQUENCE_ATTRIBUTE = "data-jg-boot";

/** A boot as one attribute value: `open>loading>menu|refused: menu -> loading`. @internal */
export function formatBootSequence(state: BootSequenceState): string {
  return [state.history.join(">"), ...state.refused].join("|");
}

/** The inverse of {@link formatBootSequence}. @internal */
export function parseBootSequence(value: string): BootSequenceState {
  const [history = "", ...refused] = value.split("|");
  return { history: history === "" ? [] : (history.split(">") as BootStep[]), refused };
}

function stampDocument(state: BootSequenceState): void {
  const page = (globalThis as { document?: { documentElement: { setAttribute: (name: string, value: string) => void } } }).document;
  page?.documentElement.setAttribute(BOOT_SEQUENCE_ATTRIBUTE, formatBootSequence(state));
}

/**
 * The page's one boot. A page boots one game, and the runner, the shell and the game's menus all
 * move it, so it is a page-level instance; `reset()` starts it over for a fresh mount.
 */
export const pageBoot: BootSequence = createBootSequence(stampDocument);
