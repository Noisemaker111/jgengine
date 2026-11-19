export const BOOT_STEPS = ["open", "loading", "intro", "menu", "entering", "playing"] as const;

export type BootStep = (typeof BOOT_STEPS)[number];

export interface BootSequenceState {
  history: BootStep[];
  refused: string[];
}

export interface BootSequence {
  step: () => BootStep;
  /**
   * Ask for a screen. A later step is entered; the current one is kept; an earlier one is refused
   * and recorded, so a second loading screen or a return to the menu during boot never shows.
   * Returns whether `step` is the screen now.
   */
  enter: (step: BootStep, reason?: string) => boolean;
  fault: (reason: string) => void;
  done: () => boolean;
  subscribe: (listener: () => void) => () => void;
  snapshot: () => BootSequenceState;
  restore: (state: BootSequenceState) => void;
  reset: () => void;
}

const rank = (step: BootStep): number => BOOT_STEPS.indexOf(step);

/** @internal */
export function createBootSequence(onChange?: (state: BootSequenceState) => void): BootSequence {
  let state: BootSequenceState = { history: ["open"], refused: [] };
  const listeners = new Set<() => void>();
  const changed = (): void => {
    onChange?.(state);
    for (const listener of listeners) listener();
  };
  // A boot's history starts at `open` and only grows, so its last step is always there.
  const current = (): BootStep => state.history.at(-1) ?? "open";
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

/** @internal */
export function bootSequenceErrors(history: readonly string[], refused: readonly string[] = []): string[] {
  const errors: string[] = [];
  if (history[0] !== "open") errors.push(`the boot must start at open, not ${history[0] ?? "nothing"}`);
  const seen = new Set<string>();
  let last = -1;
  for (const step of history) {
    const at = BOOT_STEPS.findIndex((known) => known === step);
    if (at < 0) errors.push(`${step} is not a boot screen`);
    else if (seen.has(step)) errors.push(`${step} showed twice`);
    else if (at < last) errors.push(`${step} showed after ${BOOT_STEPS[last]}`);
    seen.add(step);
    if (at >= 0) last = Math.max(last, at);
  }
  for (const request of refused) errors.push(`refused: ${request}`);
  return errors;
}

export const BOOT_SEQUENCE_ATTRIBUTE = "data-jg-boot";

/** @internal */
export function formatBootSequence(state: BootSequenceState): string {
  return [state.history.join(">"), ...state.refused].join("|");
}

/** @internal */
export function parseBootSequence(value: string): { history: string[]; refused: string[] } {
  const [history = "", ...refused] = value.split("|");
  return { history: history === "" ? [] : history.split(">"), refused };
}

function stampDocument(state: BootSequenceState): void {
  const page: unknown = Reflect.get(globalThis, "document");
  if (typeof page !== "object" || page === null || !("documentElement" in page)) return;
  const root = page.documentElement;
  if (typeof root !== "object" || root === null || !("setAttribute" in root) || typeof root.setAttribute !== "function") return;
  root.setAttribute(BOOT_SEQUENCE_ATTRIBUTE, formatBootSequence(state));
}

/**
 * The page's one boot. A page boots one game, and the runner, the shell and the game's menus all
 * move it, so it is a page-level instance; `reset()` starts it over for a fresh mount.
 */
export const pageBoot: BootSequence = createBootSequence(stampDocument);
