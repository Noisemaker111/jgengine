import { forkBranches, mainCumulative } from "../world/canyon";

export interface MapSlowState {
  readonly charges: number;
  readonly forksPassed: ReadonlySet<string>;
  readonly active: boolean;
  readonly activeSeconds: number;
}

export const INITIAL_MAP_SLOW_CHARGES = 1;
export const MAP_SLOW_MAX_HOLD_SECONDS = 4;
export const MAP_SLOW_TIME_SCALE = 0.5;

export function createInitialMapSlowState(): MapSlowState {
  return { charges: INITIAL_MAP_SLOW_CHARGES, forksPassed: new Set(), active: false, activeSeconds: 0 };
}

export interface MapSlowAdvanceInput {
  readonly carMainDistance: number;
  readonly held: boolean;
  readonly dt: number;
}

export function advanceMapSlow(state: MapSlowState, input: MapSlowAdvanceInput): MapSlowState {
  let charges = state.charges;
  let forksPassed: ReadonlySet<string> = state.forksPassed;
  for (const fork of forkBranches) {
    if (forksPassed.has(fork.id)) continue;
    if (input.carMainDistance >= mainCumulative[fork.fromIndex]) {
      const grown = new Set(forksPassed);
      grown.add(fork.id);
      forksPassed = grown;
      charges += 1;
    }
  }

  if (!input.held) {
    return { charges, forksPassed, active: false, activeSeconds: 0 };
  }

  if (!state.active) {
    if (charges <= 0) return { charges, forksPassed, active: false, activeSeconds: 0 };
    return { charges: charges - 1, forksPassed, active: true, activeSeconds: input.dt };
  }

  const activeSeconds = state.activeSeconds + input.dt;
  if (activeSeconds >= MAP_SLOW_MAX_HOLD_SECONDS) {
    return { charges, forksPassed, active: false, activeSeconds: 0 };
  }
  return { charges, forksPassed, active: true, activeSeconds };
}
