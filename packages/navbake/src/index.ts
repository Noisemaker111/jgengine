import type { NavMeshData } from "@jgengine/core/nav/navMesh";
import { freeCompactHeightfield, freeContourSet, freeHeightfield, freePolyMesh, freePolyMeshDetail, init } from "recast-navigation";
import { generateSoloNavMesh, type SoloNavMeshGeneratorIntermediates } from "recast-navigation/generators";

/** Walkable geometry and agent dimensions for {@link bakeNavMesh}. */
export interface BakeNavMeshOptions {
  /** Flat xyz triples. */
  positions: readonly number[];
  /** Triangle vertex indices, counter-clockwise seen from above for walkable faces (three.js front faces up). */
  indices: readonly number[];
  agentRadius: number;
  agentHeight: number;
  /** Steepest walkable slope in degrees. */
  maxSlope: number;
  /** Tallest ledge the agent steps up. */
  maxClimb: number;
  /** Voxel size on XZ; defaults to half the agent radius. Smaller is more exact and slower. */
  cellSize?: number;
  /** Voxel size on Y; defaults to half the cell size. */
  cellHeight?: number;
}

let ready = false;
let loading: Promise<void> | null = null;

/** Load the recast WebAssembly module once; await before the first {@link bakeNavMesh}. */
export function initNavBake(): Promise<void> {
  loading ??= init().then(
    () => {
      ready = true;
    },
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** Whether {@link initNavBake} has finished and {@link bakeNavMesh} can run synchronously. */
export function navBakeReady(): boolean {
  return ready;
}

function freeIntermediates(intermediates: SoloNavMeshGeneratorIntermediates): void {
  if (intermediates.heightfield) freeHeightfield(intermediates.heightfield);
  if (intermediates.compactHeightfield) freeCompactHeightfield(intermediates.compactHeightfield);
  if (intermediates.contourSet) freeContourSet(intermediates.contourSet);
  if (intermediates.polyMesh) freePolyMesh(intermediates.polyMesh);
  if (intermediates.polyMeshDetail) freePolyMeshDetail(intermediates.polyMeshDetail);
}

function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/**
 * Voxelize indexed triangles with recast and return the walkable surface as convex polygons in the engine's
 * serializable nav-mesh format: eroded by `agentRadius`, cut where clearance is under `agentHeight`, and split
 * at slopes over `maxSlope` or steps over `maxClimb`. Requires {@link initNavBake}.
 * @capability navmesh-bake voxelize scene triangles into an agent-sized polygon nav mesh
 */
export function bakeNavMesh(options: BakeNavMeshOptions): NavMeshData {
  if (!ready) throw new Error("bakeNavMesh: await initNavBake() before baking");
  if (options.positions.length % 3 !== 0) throw new Error("positions must contain xyz triples");
  if (options.indices.length % 3 !== 0) throw new Error("indices must contain triangle triples");
  if (!(options.agentRadius >= 0) || !(options.agentHeight > 0) || !(options.maxClimb >= 0)) {
    throw new Error("agentRadius and maxClimb must be non-negative and agentHeight positive");
  }
  const vertexCount = options.positions.length / 3;
  for (const index of options.indices) {
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) throw new Error(`index ${index} is out of range`);
  }
  if (options.indices.length === 0) return { verts: [], polys: [], links: [] };
  const cs = options.cellSize ?? Math.max(0.05, options.agentRadius / 2);
  const ch = options.cellHeight ?? cs / 2;
  const result = generateSoloNavMesh(options.positions, options.indices, {
    cs,
    ch,
    walkableRadius: Math.ceil(options.agentRadius / cs),
    walkableHeight: Math.ceil(options.agentHeight / ch),
    walkableClimb: Math.floor(options.maxClimb / ch),
    walkableSlopeAngle: Math.min(90, Math.max(0, options.maxSlope)),
    maxVertsPerPoly: 6,
  }, true);
  // Detour refuses to build from zero polygons, so an all-unwalkable input is told apart from a real failure here.
  const walkable = (result.intermediates.polyMesh?.npolys() ?? 0) > 0;
  freeIntermediates(result.intermediates);
  if (!result.success) {
    if (!walkable) return { verts: [], polys: [], links: [] };
    throw new Error(`bakeNavMesh: ${result.error}`);
  }
  const navMesh = result.navMesh;
  try {
    const verts: number[] = [];
    const polys: number[][] = [];
    for (let t = 0; t < navMesh.getMaxTiles(); t += 1) {
      const tile = navMesh.getTile(t);
      const header = tile.header();
      if (header === null) continue;
      const base = verts.length / 3;
      for (let i = 0; i < header.vertCount() * 3; i += 1) verts.push(round(tile.verts(i)));
      for (let p = 0; p < header.polyCount(); p += 1) {
        const poly = tile.polys(p);
        if (poly.getType() !== 0) continue;
        const ring: number[] = [];
        for (let k = 0; k < poly.vertCount(); k += 1) ring.push(base + poly.verts(k));
        polys.push(ring);
      }
    }
    return { verts, polys, links: [] };
  } finally {
    navMesh.destroy();
  }
}
