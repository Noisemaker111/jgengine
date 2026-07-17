import type { ElevationReadout, ElevationSummary } from "@jgengine/core/world/terrainGuides";

/** Live, transient terrain-readability feedback shared by the viewport overlay and the HUD legend. */
export interface TerrainReadoutState {
  /** Elevation under the pointer, or `null` when the pointer is off the terrain. */
  cursor: ElevationReadout | null;
  /** Elevation stats for the readout region (whole terrain), or `null` before the first build. */
  summary: ElevationSummary | null;
  /** The contour interval the overlay chose for the current relief; `0` when flat. */
  interval: number;
}

/** Subscribable store for transient terrain-readout feedback (not persisted — it is live measurement). */
export interface TerrainReadoutStore {
  getState(): TerrainReadoutState;
  setCursor(cursor: ElevationReadout | null): void;
  setSummary(summary: ElevationSummary | null, interval: number): void;
  subscribe(listener: () => void): () => void;
}

/** Creates the readout store the terrain overlay writes and the HUD reads. */
export function createTerrainReadoutStore(): TerrainReadoutStore {
  let state: TerrainReadoutState = { cursor: null, summary: null, interval: 0 };
  const listeners = new Set<() => void>();
  const emit = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    setCursor(cursor) {
      const prev = state.cursor;
      if (prev === cursor) return;
      if (
        prev !== null &&
        cursor !== null &&
        prev.height === cursor.height &&
        prev.x === cursor.x &&
        prev.z === cursor.z
      ) {
        return;
      }
      state = { ...state, cursor };
      emit();
    },
    setSummary(summary, interval) {
      state = { ...state, summary, interval };
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
