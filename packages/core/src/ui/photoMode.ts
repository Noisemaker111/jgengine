/** Serializable photo-mode preferences a game reads to compose its capture UI. */
export interface PhotoModeState {
  /** Photo mode is engaged (game frees the camera / pauses as it sees fit). */
  active: boolean;
  /** Hide the gameplay HUD for a clean shot. */
  hideHud: boolean;
}

/** The out-of-the-box photo-mode state: not active, HUD hidden when it engages. */
export const DEFAULT_PHOTO_MODE: PhotoModeState = { active: false, hideHud: true };

/** Observable photo-mode store — genre-agnostic state a game binds its capture flow to. */
export interface PhotoModeStore {
  get(): PhotoModeState;
  /** Engage photo mode. */
  enter(): void;
  /** Leave photo mode. */
  exit(): void;
  toggle(): void;
  setHideHud(hide: boolean): void;
  set(patch: Partial<PhotoModeState>): void;
  subscribe(listener: () => void): () => void;
  snapshot(): PhotoModeState;
  restore(snapshot: Partial<PhotoModeState>): void;
}

/**
 * Serializable, observable photo-mode state (active + hide-HUD). Genre-agnostic
 * plumbing — a game engages it to free its camera and hide gameplay chrome for a
 * clean capture, and reads `hideHud` to conditionally render its HUD. Pair with
 * React `PhotoModeControls` and shell `captureCanvas`.
 *
 * @capability photo-mode observable photo-mode state (active + hide-HUD) a game binds its screenshot/camera flow to
 */
export function createPhotoModeStore(initial: Partial<PhotoModeState> = {}): PhotoModeStore {
  let state: PhotoModeState = { ...DEFAULT_PHOTO_MODE, ...initial };
  const listeners = new Set<() => void>();

  function commit(next: PhotoModeState): void {
    if (next.active === state.active && next.hideHud === state.hideHud) return;
    state = next;
    for (const listener of listeners) listener();
  }

  return {
    get() {
      return state;
    },
    enter() {
      commit({ ...state, active: true });
    },
    exit() {
      commit({ ...state, active: false });
    },
    toggle() {
      commit({ ...state, active: !state.active });
    },
    setHideHud(hide) {
      commit({ ...state, hideHud: hide });
    },
    set(patch) {
      commit({ ...state, ...patch });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return state;
    },
    restore(snapshot) {
      commit({ ...DEFAULT_PHOTO_MODE, ...snapshot });
    },
  };
}
