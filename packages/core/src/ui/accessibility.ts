/** Colorblind simulation/daltonization modes the engine ships matrices for. */
export type ColorblindMode = "none" | "protanopia" | "deuteranopia" | "tritanopia" | "grayscale";

/** Serializable accessibility preferences a game reads to adapt its presentation. */
export interface AccessibilityState {
  /** Suppress non-essential motion/animation. */
  reducedMotion: boolean;
  /** Boost contrast (stronger borders/backgrounds, less transparency). */
  highContrast: boolean;
  /** UI text scale multiplier (`1` = default). See {@link clampTextScale} for bounds. */
  textScale: number;
  /** Colorblind filter applied to the presentation. */
  colorblind: ColorblindMode;
  /** Show subtitles/captions for dialogue and important audio. */
  captions: boolean;
}

/** The out-of-the-box accessibility state (all assistance off, `textScale` 1). */
export const DEFAULT_ACCESSIBILITY: AccessibilityState = {
  reducedMotion: false,
  highContrast: false,
  textScale: 1,
  colorblind: "none",
  captions: false,
};

/** Minimum UI text scale. */
export const TEXT_SCALE_MIN = 0.75;
/** Maximum UI text scale. */
export const TEXT_SCALE_MAX = 2;

/** Clamp a text-scale multiplier into the supported `[TEXT_SCALE_MIN, TEXT_SCALE_MAX]` range. */
export function clampTextScale(scale: number): number {
  if (Number.isNaN(scale)) return 1;
  return Math.max(TEXT_SCALE_MIN, Math.min(TEXT_SCALE_MAX, scale));
}

/** Return `ms` when motion is allowed, or `reduced` (default 0) when `reducedMotion` is set — the animation-duration gate. */
export function reducedMotionDuration(state: AccessibilityState, ms: number, reduced = 0): number {
  return state.reducedMotion ? reduced : ms;
}

/**
 * `feColorMatrix` `values` strings for each colorblind mode — simulate how a
 * viewer with that condition perceives color (and a grayscale mode). `"none"`
 * maps to `null` (no filter). Consumed by the React `ColorblindFilters` defs.
 */
export const COLORBLIND_MATRICES: Record<ColorblindMode, string | null> = {
  none: null,
  protanopia: "0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0",
  deuteranopia: "0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0",
  tritanopia: "0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0",
  grayscale: "0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0",
};

/** Observable, serializable accessibility-preferences store. */
export interface AccessibilityStore {
  get(): AccessibilityState;
  /** Merge a partial update (text scale is clamped); notifies on an actual change. */
  set(patch: Partial<AccessibilityState>): void;
  /** Restore defaults. */
  reset(): void;
  subscribe(listener: () => void): () => void;
  snapshot(): AccessibilityState;
  restore(snapshot: Partial<AccessibilityState>): void;
}

/**
 * Serializable, observable store of accessibility preferences (reduced motion,
 * high contrast, text scale, colorblind mode, captions). Genre-agnostic plumbing
 * like input rebinding — a game binds these to its settings UI and adapts its
 * presentation; `snapshot`/`restore` round-trip through a save or settings blob.
 *
 * @capability accessibility-store serializable, observable accessibility preferences (reduced motion, high contrast, text scale, colorblind mode, captions) a game binds to its settings and presentation
 */
export function createAccessibilityStore(initial: Partial<AccessibilityState> = {}): AccessibilityStore {
  let state = normalize({ ...DEFAULT_ACCESSIBILITY, ...initial });
  const listeners = new Set<() => void>();

  function normalize(next: AccessibilityState): AccessibilityState {
    return { ...next, textScale: clampTextScale(next.textScale) };
  }

  function commit(next: AccessibilityState): void {
    const normalized = normalize(next);
    if (
      normalized.reducedMotion === state.reducedMotion &&
      normalized.highContrast === state.highContrast &&
      normalized.textScale === state.textScale &&
      normalized.colorblind === state.colorblind &&
      normalized.captions === state.captions
    ) {
      return;
    }
    state = normalized;
    for (const listener of listeners) listener();
  }

  return {
    get() {
      return state;
    },
    set(patch) {
      commit({ ...state, ...patch });
    },
    reset() {
      commit({ ...DEFAULT_ACCESSIBILITY });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return state;
    },
    restore(snapshot) {
      commit({ ...DEFAULT_ACCESSIBILITY, ...snapshot });
    },
  };
}
