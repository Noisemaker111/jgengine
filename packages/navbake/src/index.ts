import type { NavMeshData } from "@jgengine/core/nav/navMesh";

export interface BakeNavMeshOptions {
  positions: readonly number[];
  indices: readonly number[];
  agentRadius: number;
  agentHeight: number;
  maxSlope: number;
  maxClimb: number;
}

function triangleSlope(positions: readonly number[], a: number, b: number, c: number): number {
  const ax = positions[a * 3]!, ay = positions[a * 3 + 1]!, az = positions[a * 3 + 2]!;
  const bx = positions[b * 3]!, by = positions[b * 3 + 1]!, bz = positions[b * 3 + 2]!;
  const cx = positions[c * 3]!, cy = positions[c * 3 + 1]!, cz = positions[c * 3 + 2]!;
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  const ny = ux * vz - uz * vx;
  const nx = uy * vz - uz * vy;
  const nz = ux * vy - uy * vx;
  return Math.atan2(Math.hypot(nx, nz), Math.abs(ny)) * 180 / Math.PI;
}

/** Bake indexed walkable triangles into the engine's serializable nav-mesh format. */
export function bakeNavMesh(options: BakeNavMeshOptions): NavMeshData {
  if (options.positions.length % 3 !== 0) throw new Error("positions must contain xyz triples");
  if (options.indices.length % 3 !== 0) throw new Error("indices must contain triangle triples");
  const polys: number[][] = [];
  for (let i = 0; i < options.indices.length; i += 3) {
    const a = options.indices[i]!, b = options.indices[i + 1]!, c = options.indices[i + 2]!;
    if (a < 0 || b < 0 || c < 0 || a * 3 + 2 >= options.positions.length || b * 3 + 2 >= options.positions.length || c * 3 + 2 >= options.positions.length) continue;
    if (triangleSlope(options.positions, a, b, c) <= Math.max(0, options.maxSlope)) polys.push([a, b, c]);
  }
  return { verts: Array.from(options.positions), polys, links: [] };
}
