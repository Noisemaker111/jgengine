import type { EditorPath } from "@jgengine/core/editor/index";
import {
  pathFollowSeek,
  pathLength,
  type PathFollowConfig,
  type Waypoint,
} from "@jgengine/core/nav/pathFollow";

/** A scrubbable scene path — real document polylines with enough points to sample. */
export interface ScrubbablePath {
  id: string;
  kind: string;
  label: string;
  pointCount: number;
  /** Total arc length in world units (0 when degenerate). */
  length: number;
}

/**
 * Builds the path-follow config used by the flythrough scrubber. Pure; no document mutation.
 * Returns null when the path cannot be sampled (fewer than two points).
 *
 * @internal
 */
export function pathFollowConfigFromEditorPath(path: EditorPath): PathFollowConfig | null {
  if (path.points.length < 2) return null;
  const waypoints: Waypoint[] = path.points.map((point) => [point.x, point.y, point.z]);
  return { waypoints, speed: 1 };
}

/**
 * Lists document paths that can be scrubbed, with length metadata for the dock UI.
 *
 * @internal
 */
export function listScrubbablePaths(paths: readonly EditorPath[]): ScrubbablePath[] {
  return paths
    .map((path) => {
      const config = pathFollowConfigFromEditorPath(path);
      const length = config === null ? 0 : pathLength(config);
      return {
        id: path.id,
        kind: path.kind,
        label: path.label?.trim() || path.id,
        pointCount: path.points.length,
        length,
      };
    })
    .filter((entry) => entry.pointCount >= 2);
}

/**
 * Samples a world position along an authored path at normalized progress `t` in `[0, 1]`.
 * Clamps `t`. Returns null when the path has fewer than two points.
 *
 * @internal
 */
export function samplePathAt(
  path: EditorPath,
  t: number,
): { x: number; y: number; z: number; distance: number; length: number } | null {
  const config = pathFollowConfigFromEditorPath(path);
  if (config === null) return null;
  const length = pathLength(config);
  const clamped = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  const state = pathFollowSeek(config, { kind: "normalized", value: clamped });
  return {
    x: state.position[0],
    y: state.position[1],
    z: state.position[2],
    distance: length * clamped,
    length,
  };
}
