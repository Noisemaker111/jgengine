import type { SlicedJob } from "@jgengine/core/run/slicedWork";
import * as THREE from "three";

import { groundPatchJob, type GroundGrid } from "./terrainMath.draw";

/** Above this many vertices a ground is meshed as LOD tiles instead of one mesh. */
export const CHUNKED_GROUND_MIN_VERTICES = 129 * 129 * 4;

/** Grid cells along one side of a ground tile. */
const TILE_CELLS = 128;

/** Vertex strides a tile is meshed at, finest first. */
const TILE_STEPS = [1, 2, 4, 8, 16] as const;

interface GroundTile {
  col0: number;
  row0: number;
  cols: number;
  rows: number;
  lod: THREE.LOD;
  built: Map<number, THREE.Mesh>;
}

/**
 * A big ground split into tiles of {@link TILE_CELLS} cells, each a `THREE.LOD` whose levels mesh
 * the same field at strides 1, 2, 4, 8, 16. Only the coarsest level of every tile plus the level the
 * camera needs near it are built up front; {@link nextRefinement} builds the rest as the camera
 * reaches them, so a 4 km course costs a few thousand vertices to show instead of half a million.
 * Each level drops a skirt below its edges, so a tile next to a coarser one shows no crack.
 * @internal
 */
export class GroundChunks {
  readonly root = new THREE.Group();
  private readonly tiles: GroundTile[] = [];
  private readonly cellX: number;
  private readonly cellZ: number;
  private readonly tileSpan: number;

  constructor(
    private readonly grid: GroundGrid,
    private readonly material: THREE.Material,
    private readonly receiveShadow: boolean,
  ) {
    this.cellX = grid.size.width / grid.segments.x;
    this.cellZ = grid.size.depth / grid.segments.z;
    this.tileSpan = TILE_CELLS * Math.max(this.cellX, this.cellZ);
    for (let row0 = 0; row0 < grid.segments.z; row0 += TILE_CELLS) {
      for (let col0 = 0; col0 < grid.segments.x; col0 += TILE_CELLS) {
        const cols = Math.min(TILE_CELLS, grid.segments.x - col0);
        const rows = Math.min(TILE_CELLS, grid.segments.z - row0);
        const lod = new THREE.LOD();
        lod.position.set(this.worldX(col0 + cols / 2), 0, this.worldZ(row0 + rows / 2));
        this.root.add(lod);
        this.tiles.push({ col0, row0, cols, rows, lod, built: new Map() });
      }
    }
  }

  /** Tiles the ground is split into. */
  get tileCount(): number {
    return this.tiles.length;
  }

  /** Vertices built so far across every tile and level. */
  builtVertices(): number {
    let total = 0;
    for (const tile of this.tiles) for (const mesh of tile.built.values()) total += mesh.geometry.attributes["position"]!.count;
    return total;
  }

  /** The stride a tile at `distance` from the camera draws with. */
  stepAt(distance: number): number {
    let step: number = TILE_STEPS[0];
    for (let level = 1; level < TILE_STEPS.length; level += 1) {
      if (distance >= this.levelDistance(level)) step = TILE_STEPS[level]!;
    }
    return step;
  }

  /** Build the coarsest level of every tile, then the level each tile near `camera` draws with. */
  *initialJob(camera: () => THREE.Vector3): SlicedJob<void> {
    const coarsest = TILE_STEPS[TILE_STEPS.length - 1]!;
    for (const tile of this.tiles) yield* this.buildLevel(tile, coarsest);
    const eye = camera();
    for (const tile of this.byDistance(eye)) {
      const step = this.stepAt(tile.lod.position.distanceTo(flat(eye)));
      if (!tile.built.has(step)) yield* this.buildLevel(tile, step);
    }
  }

  /** The next missing level the camera at `eye` would draw, nearest tile first; null when none is. */
  nextRefinement(eye: THREE.Vector3): SlicedJob<void> | null {
    for (const tile of this.byDistance(eye)) {
      const step = this.stepAt(tile.lod.position.distanceTo(flat(eye)));
      if (!tile.built.has(step)) return this.buildLevel(tile, step);
    }
    return null;
  }

  dispose(): void {
    for (const tile of this.tiles) for (const mesh of tile.built.values()) mesh.geometry.dispose();
    this.root.clear();
  }

  private *buildLevel(tile: GroundTile, step: number): SlicedJob<void> {
    if (tile.built.has(step)) return;
    const effective = Math.min(step, tile.cols, tile.rows);
    const geometry = yield* groundPatchJob(this.grid, {
      col0: tile.col0,
      row0: tile.row0,
      cols: tile.cols,
      rows: tile.rows,
      step: effective,
      // Deep enough to cover the height a coarser neighbour's edge can sit above this one.
      skirt: 0.5 + effective * Math.max(this.cellX, this.cellZ),
      origin: [tile.lod.position.x, tile.lod.position.z],
    });
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.receiveShadow = this.receiveShadow;
    tile.built.set(step, mesh);
    tile.lod.addLevel(mesh, this.levelDistance(TILE_STEPS.indexOf(step as (typeof TILE_STEPS)[number])));
  }

  /** Camera distance (to the tile's centre) from which a level draws: 0 for full density. */
  private levelDistance(level: number): number {
    return level <= 0 ? 0 : this.tileSpan * 0.75 * 2 ** (level - 1);
  }

  private byDistance(eye: THREE.Vector3): GroundTile[] {
    const at = flat(eye);
    return [...this.tiles].sort((a, b) => a.lod.position.distanceToSquared(at) - b.lod.position.distanceToSquared(at));
  }

  private worldX(index: number): number {
    return this.grid.center[0] + (index / this.grid.segments.x - 0.5) * this.grid.size.width;
  }

  private worldZ(index: number): number {
    return this.grid.center[1] + (index / this.grid.segments.z - 0.5) * this.grid.size.depth;
  }
}

const flatScratch = new THREE.Vector3();

/** The eye dropped to the ground plane: tile LOD distance is horizontal, whatever the camera height. */
function flat(eye: THREE.Vector3): THREE.Vector3 {
  return flatScratch.set(eye.x, 0, eye.z);
}
