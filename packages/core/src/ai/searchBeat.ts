export interface SearchBeatState {
  /** Bearing from the search centre to the current waypoint, radians. */
  angle: number | null;
}

export interface SearchBeatArea {
  center: readonly [number, number];
  radius: number;
}

export interface SearchBeatTuning {
  reach: number;
  /** Within this many metres of a waypoint it counts as reached. */
  arriveRadius: number;
  /** On arrival the bearing turns by at least this, radians. */
  turnMin: number;
  turnSpread: number;
}

export function createSearchBeat(): SearchBeatState {
  return { angle: null };
}

/**
 * One step of walking a beat inside a search circle instead of standing on its centre: returns the
 * XZ waypoint to move toward, or `null` on the step the searcher reaches it and turns to the next.
 * Mutates `state`; draws only from the injected `rng`.
 *
 * @capability search-beat walk waypoints around a search circle so searchers sweep it instead of standing on its centre
 */
export function searchBeatStep(
  state: SearchBeatState,
  position: readonly [number, number],
  area: SearchBeatArea,
  tuning: SearchBeatTuning,
  rng: () => number,
): readonly [number, number] | null {
  if (state.angle === null) state.angle = rng() * Math.PI * 2;
  const reach = area.radius * tuning.reach;
  const x = area.center[0] + Math.sin(state.angle) * reach;
  const z = area.center[1] + Math.cos(state.angle) * reach;
  if (Math.hypot(position[0] - x, position[1] - z) < tuning.arriveRadius) {
    state.angle += tuning.turnMin + rng() * tuning.turnSpread;
    return null;
  }
  return [x, z];
}
