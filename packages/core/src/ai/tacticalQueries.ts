import type { NavMeshData } from "../nav/navMesh";
import type { Vec3 } from "../world/geometry";

/**
 * Returns boundary locations that are hidden from a threat.
 * @capability tactical-cover-points derive cover candidates from navigation-mesh boundaries
 */
export function coverPoints(
  mesh: NavMeshData,
  threatPos: Vec3,
  losBlocked: (a: Vec3, b: Vec3) => boolean,
): Vec3[] {
  const edges = new Map<string, { a: number; b: number }>();
  const shared = new Set<string>();
  for (const poly of mesh.polys) {
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (edges.has(key)) shared.add(key);
      else edges.set(key, { a, b });
    }
  }
  const result: Vec3[] = [];
  for (const [key, edge] of edges) {
    if (shared.has(key)) continue;
    const a: Vec3 = [mesh.verts[edge.a * 3] ?? 0, mesh.verts[edge.a * 3 + 1] ?? 0, mesh.verts[edge.a * 3 + 2] ?? 0];
    const b: Vec3 = [mesh.verts[edge.b * 3] ?? 0, mesh.verts[edge.b * 3 + 1] ?? 0, mesh.verts[edge.b * 3 + 2] ?? 0];
    const midpoint: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    if (losBlocked(midpoint, threatPos)) result.push(midpoint);
  }
  return result;
}

/** Functions that score one candidate position; higher values are preferred. */
export interface TacticalPositionEvaluators {
  distanceTo?: (point: Vec3) => number;
  flankOf?: (point: Vec3) => number;
  retreatFrom?: (point: Vec3) => number;
}

/** Weights and a hard bound for tactical candidate scoring. */
export interface TacticalPositionWeights {
  distanceTo?: number;
  flankOf?: number;
  retreatFrom?: number;
  maxCandidates?: number;
}

/** A candidate position with its deterministic weighted tactical score. */
export interface ScoredPosition {
  point: Vec3;
  score: number;
}

/**
 * Score positions and retain at most `maxCandidates`, ordered highest score first.
 * @capability tactical-position-score rank bounded tactical positions with caller-defined weights
 */
export function scorePositions(
  points: readonly Vec3[],
  evaluators: TacticalPositionEvaluators,
  weights: TacticalPositionWeights = {},
): ScoredPosition[] {
  const scored = points.map((point) => ({
    point,
    score: (evaluators.distanceTo?.(point) ?? 0) * (weights.distanceTo ?? 0)
      + (evaluators.flankOf?.(point) ?? 0) * (weights.flankOf ?? 0)
      + (evaluators.retreatFrom?.(point) ?? 0) * (weights.retreatFrom ?? 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  const max = Math.max(0, Math.floor(weights.maxCandidates ?? scored.length));
  return scored.slice(0, max);
}
