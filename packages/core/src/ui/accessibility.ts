// @skill jgengine-ui
export type ColorblindMode = "none" | "protanopia" | "deuteranopia" | "tritanopia" | "grayscale";

export interface AccessibilityState {
  reducedMotion: boolean;
  highContrast: boolean;
  textScale: number;
  colorblind: ColorblindMode;
  captions: boolean;
}

export const DEFAULT_ACCESSIBILITY: AccessibilityState = {
  reducedMotion: false,
  highContrast: false,
  textScale: 1,
  colorblind: "none",
  captions: false,
};

export const TEXT_SCALE_MIN = 0.75;
export const TEXT_SCALE_MAX = 2;

export function clampTextScale(scale: number): number {
  if (Number.isNaN(scale)) return 1;
  return Math.max(TEXT_SCALE_MIN, Math.min(TEXT_SCALE_MAX, scale));
}

/** Return `ms` when motion is allowed, or `reduced` (default 0) when `reducedMotion` is set — the animation-duration gate. */
export function reducedMotionDuration(state: AccessibilityState, ms: number, reduced = 0): number {
  return state.reducedMotion ? reduced : ms;
}

export const COLORBLIND_MATRICES: Record<ColorblindMode, string | null> = {
  none: null,
  protanopia: "0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0",
  deuteranopia: "0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0",
  tritanopia: "0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0",
  grayscale: "0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0",
};

/**
 * The CSS filter that applies `mode` to one rendered frame — a `url(#jg-cb-<mode>)` reference to the
 * `feColorMatrix` defs {@link COLORBLIND_MATRICES} drives. `"none"` maps to `null` (no filter), so a
 * caller can spread it onto the canvas alone and leave HUD and menu text at its own contrast.
 *
 * @capability colorblind-frame-filter resolve a colorblind mode to the CSS filter for the 3D frame alone
 */
export function colorblindFrameFilter(mode: ColorblindMode): string | null {
  const matrix = COLORBLIND_MATRICES[mode];
  // An unknown id at runtime would reference a filter that does not exist, and a broken `url()` filter hides the element.
  if (matrix === null || matrix === undefined) return null;
  return `url(#jg-cb-${mode})`;
}

export interface AccessibilityStore {
  get(): AccessibilityState;
  /** Merge a partial update (text scale is clamped); notifies on an actual change. */
  set(patch: Partial<AccessibilityState>): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
  snapshot(): AccessibilityState;
  restore(snapshot: Partial<AccessibilityState>): void;
}

/** @capability accessibility-store serializable, observable accessibility preferences (reduced motion, high contrast, text scale, colorblind mode, captions) a game binds to its settings and presentation */
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
