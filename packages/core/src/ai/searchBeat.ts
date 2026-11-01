/** A searcher's place on its beat; one serializable number, `null` until the first step picks one. */
export interface SearchBeatState {
  /** Bearing from the search centre to the current waypoint, radians. */
  angle: number | null;
}

/** The circle being searched. `AlertSearchArea` from `ai/alertLevel` fits. */
export interface SearchBeatArea {
  center: readonly [number, number];
  radius: number;
}

/** How a searcher walks its beat. */
export interface SearchBeatTuning {
  /** Waypoints sit this fraction of the radius out from the centre. */
  reach: number;
  /** Within this many metres of a waypoint it counts as reached. */
  arriveRadius: number;
  /** On arrival the bearing turns by at least this, radians. */
  turnMin: number;
  /** Plus up to this much more, drawn from `rng`. */
  turnSpread: number;
}

/** A fresh beat; the first step picks a random bearing. */
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
