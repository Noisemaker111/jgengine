import type { ElevationReadout, ElevationSummary } from "@jgengine/core/terrain/terrainGuides";

export interface TerrainReadoutState {
  cursor: ElevationReadout | null;
  /** Elevation stats for the readout region (whole terrain), or `null` before the first build. */
  summary: ElevationSummary | null;
  interval: number;
}

export interface TerrainReadoutStore {
  getState(): TerrainReadoutState;
  setCursor(cursor: ElevationReadout | null): void;
  setSummary(summary: ElevationSummary | null, interval: number): void;
  subscribe(listener: () => void): () => void;
}

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
