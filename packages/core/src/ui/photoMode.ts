export interface PhotoModeState {
  active: boolean;
  hideHud: boolean;
}

export const DEFAULT_PHOTO_MODE: PhotoModeState = { active: false, hideHud: true };

export interface PhotoModeStore {
  get(): PhotoModeState;
  enter(): void;
  exit(): void;
  toggle(): void;
  setHideHud(hide: boolean): void;
  set(patch: Partial<PhotoModeState>): void;
  subscribe(listener: () => void): () => void;
  snapshot(): PhotoModeState;
  restore(snapshot: Partial<PhotoModeState>): void;
}

/** @capability photo-mode observable photo-mode state (active + hide-HUD) a game binds its screenshot/camera flow to */
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
