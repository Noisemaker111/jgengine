import type { OcclusionInput, OcclusionTester } from "../visibility/occlusion";

/** An authored solid the grid may trust as a blocker, in world units. */
export interface OccluderBox {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

/** The world rectangle an {@link OccluderGrid} covers. */
export interface OccluderGridBounds {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

/** Construction options for {@link createOccluderGrid}. */
export interface OccluderGridConfig {
  readonly bounds: OccluderGridBounds;
  /** Grid cell edge in metres. One cell is rejected at a time, so a cell is the culling granularity. */
  readonly cellSize: number;
  /** Boxes shorter than this are never trusted as blockers, so fences and kerbs cannot hide a street. */
  readonly minHeight?: number;
  /** Hard cap on cells one ray may cross. Default 4096. */
  readonly maxRaySteps?: number;
  readonly restore?: OccluderGridState;
}

/** Serializable grid contents — the built occluder field, not the boxes it came from. */
export interface OccluderGridState {
  readonly cols: number;
  readonly rows: number;
  readonly minX: number;
  readonly minZ: number;
  readonly cellSize: number;
  /** Per-cell blocker top height, row-major; `0` where no box covers the cell. */
  readonly tops: readonly number[];
  /** Per-cell blocker base height, row-major; `Infinity` where no box covers the cell. */
  readonly bases: readonly number[];
}

/** Counters a grid keeps so its own cost can be compared with what it saves. */
export interface OccluderGridStats {
  /** Cells in the grid. */
  readonly cells: number;
  /** Cells at least one trusted box fully covers. */
  readonly blockerCells: number;
  /** Boxes accepted into the grid. */
  readonly occluders: number;
  /** Milliseconds spent building the grid; the whole build happens once, outside the frame loop. */
  readonly buildMs: number;
  /** Box tests run since the last {@link OccluderGrid.measure} reset. */
  readonly tests: number;
  /** Box tests the grid rejected. */
  readonly rejected: number;
  /** Milliseconds spent in those tests since the last reset. */
  readonly testMs: number;
}

export interface OccluderGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly minX: number;
  readonly minZ: number;
  /** Replace the grid contents from authored solids. Call once per scene, not per frame. */
  build(boxes: Iterable<OccluderBox>): void;
  colOf(x: number): number;
  rowOf(z: number): number;
  cellIndex(x: number, z: number): number;
  /** Whether one cell is filled, floor to roof, by a trusted box seen from this camera height. */
  isCellBlocked(cell: number, cameraY: number): boolean;
  /**
   * Whether a world point is behind blockers from `camera`. All five sample rays (four cell corners
   * plus the centre) must be blocked, so a point near a blocker's edge stays visible.
   */
  isPointHidden(cameraX: number, cameraY: number, cameraZ: number, x: number, y: number, z: number): boolean;
  /**
   * Whether a box can be rejected. Only a box whose whole footprint sits inside one grid cell is
   * tested, so the answer is always conservative: a partially covered box is never rejected.
   */
  isBoxHidden(camera: { readonly x: number; readonly y: number; readonly z: number }, box: OccluderBox): boolean;
  /** Adapter for `createVisibilitySystem`'s occlusion stage. */
  tester(enabled?: boolean): OcclusionTester;
  stats(): OccluderGridStats;
  /** Zero the per-frame test counters, keeping the build counters. */
  measure(): { tests: number; rejected: number; testMs: number };
  /** Clear built blockers and counters. */
  clear(): void;
  toState(): OccluderGridState;
}

const now = (): number => (typeof performance === "object" ? performance.now() : Date.now());

function floorDiv(value: number, size: number): number {
  return Math.floor(value / size);
}

/**
 * Build a coarse occluder grid from authored solids. The grid is built once from geometry — never by
 * per-frame raycasts — and answers "is this cell behind something taller than the camera" with a
 * straight-line walk over the cell grid. A cell counts as filled only when one box covers its whole
 * footprint, and a point counts as hidden only when all five sample rays are filled, so the grid can
 * miss a hidden object but cannot hide a visible one.
 *
 * @capability occluder-grid coarse built-once occluder field that rejects cells blocked from the camera
 */
export function createOccluderGrid(config: OccluderGridConfig): OccluderGrid {
  const cellSize = config.cellSize;
  if (cellSize <= 0) throw new Error("createOccluderGrid: cellSize must be positive");
  const minHeight = config.minHeight ?? 6;
  const maxRaySteps = config.maxRaySteps ?? 4096;
  const restore = config.restore;

  const minX = restore?.minX ?? config.bounds.minX;
  const minZ = restore?.minZ ?? config.bounds.minZ;
  const cols = restore?.cols ?? Math.max(1, Math.ceil((config.bounds.maxX - config.bounds.minX) / cellSize));
  const rows = restore?.rows ?? Math.max(1, Math.ceil((config.bounds.maxZ - config.bounds.minZ) / cellSize));
  const total = cols * rows;

  const tops = new Float64Array(total);
  const bases = new Float64Array(total).fill(Number.POSITIVE_INFINITY);
  let occluders = 0;
  let buildMs = 0;
  let tests = 0;
  let rejected = 0;
  let testMs = 0;

  if (restore !== undefined) {
    for (let cell = 0; cell < total && cell < restore.tops.length; cell += 1) {
      tops[cell] = restore.tops[cell]!;
      bases[cell] = restore.bases[cell]!;
    }
  }

  function colOf(x: number): number {
    const col = floorDiv(x - minX, cellSize);
    return col < 0 ? 0 : col >= cols ? cols - 1 : col;
  }
  function rowOf(z: number): number {
    const row = floorDiv(z - minZ, cellSize);
    return row < 0 ? 0 : row >= rows ? rows - 1 : row;
  }
  function cellIndex(x: number, z: number): number {
    return rowOf(z) * cols + colOf(x);
  }

  function build(boxes: Iterable<OccluderBox>): void {
    const started = now();
    tops.fill(0);
    bases.fill(Number.POSITIVE_INFINITY);
    occluders = 0;
    for (const box of boxes) {
      if (box.maxY - box.minY < minHeight) continue;
      // A box fills a cell only when its footprint contains that whole cell.
      const firstCol = Math.ceil((box.minX - minX) / cellSize - 1e-9);
      const lastCol = Math.floor((box.maxX - minX) / cellSize + 1e-9) - 1;
      const firstRow = Math.ceil((box.minZ - minZ) / cellSize - 1e-9);
      const lastRow = Math.floor((box.maxZ - minZ) / cellSize + 1e-9) - 1;
      if (lastCol < firstCol || lastRow < firstRow) continue;
      occluders += 1;
      for (let row = Math.max(0, firstRow); row <= Math.min(rows - 1, lastRow); row += 1) {
        for (let col = Math.max(0, firstCol); col <= Math.min(cols - 1, lastCol); col += 1) {
          const cell = row * cols + col;
          if (box.maxY > tops[cell]!) tops[cell] = box.maxY;
          if (box.minY < bases[cell]!) bases[cell] = box.minY;
        }
      }
    }
    buildMs = now() - started;
  }

  /** Whether the cell blocks a line of sight from `cameraY`: filled, below the camera, above the ground. */
  function blocks(cell: number, cameraY: number): boolean {
    const top = tops[cell]!;
    return top > 0 && top >= cameraY && bases[cell]! <= cameraY;
  }

  /**
   * Whether the segment camera→point passes through a blocker. Samples exact points along the
   * segment, so a reported hit means a sample lies inside a cell a single box fully covers; missing a
   * hit only leaves an object visible.
   */
  function rayBlocked(
    cameraX: number, cameraZ: number,
    x: number, z: number,
    cameraY: number,
  ): boolean {
    const dx = x - cameraX;
    const dz = z - cameraZ;
    const length = Math.hypot(dx, dz);
    if (length <= 0) return false;
    const samples = Math.min(maxRaySteps, Math.ceil(length / (cellSize * 0.5)));
    if (samples <= 0) return false;
    const margin = cellSize * 0.01;
    for (let sample = 1; sample < samples; sample += 1) {
      const t = sample / samples;
      const px = cameraX + dx * t;
      const pz = cameraZ + dz * t;
      const col = colOf(px);
      const row = rowOf(pz);
      const cellLeft = minX + col * cellSize;
      const cellNear = minZ + row * cellSize;
      if (px < cellLeft + margin || px > cellLeft + cellSize - margin) continue;
      if (pz < cellNear + margin || pz > cellNear + cellSize - margin) continue;
      if (blocks(row * cols + col, cameraY)) return true;
    }
    return false;
  }

  function isPointHidden(cameraX: number, cameraY: number, cameraZ: number, x: number, y: number, z: number): boolean {
    void y;
    const fromCol = colOf(cameraX);
    const fromRow = rowOf(cameraZ);
    if (fromCol === colOf(x) && fromRow === rowOf(z)) return false;
    // One ray decides most answers; the four corners only run when the centre is already blocked.
    if (!rayBlocked(cameraX, cameraZ, x, z, cameraY)) return false;
    const col = colOf(x);
    const row = rowOf(z);
    const left = minX + col * cellSize;
    const near = minZ + row * cellSize;
    const cornersX = [left + 0.25 * cellSize, left + 0.75 * cellSize, left + 0.25 * cellSize, left + 0.75 * cellSize];
    const cornersZ = [near + 0.25 * cellSize, near + 0.25 * cellSize, near + 0.75 * cellSize, near + 0.75 * cellSize];
    for (let corner = 0; corner < 4; corner += 1) {
      if (!rayBlocked(cameraX, cameraZ, cornersX[corner]!, cornersZ[corner]!, cameraY)) return false;
    }
    return true;
  }

  function isBoxHidden(camera: { readonly x: number; readonly y: number; readonly z: number }, box: OccluderBox): boolean {
    const started = now();
    tests += 1;
    let hidden = false;
    const minCol = colOf(box.minX);
    const maxCol = colOf(box.maxX);
    const minRow = rowOf(box.minZ);
    const maxRow = rowOf(box.maxZ);
    // A box spanning a cell edge could be partly visible along that edge.
    if (minCol === maxCol && minRow === maxRow) {
      hidden = isPointHidden(camera.x, camera.y, camera.z, (box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2);
      if (hidden) {
        const cellLeft = minX + minCol * cellSize;
        const cellNear = minZ + minRow * cellSize;
        hidden = box.minX >= cellLeft && box.maxX <= cellLeft + cellSize &&
          box.minZ >= cellNear && box.maxZ <= cellNear + cellSize;
      }
    }
    testMs += now() - started;
    if (hidden) rejected += 1;
    return hidden;
  }

  return {
    cols,
    rows,
    cellSize,
    minX,
    minZ,
    build,
    colOf,
    rowOf,
    cellIndex,
    isCellBlocked(cell, cameraY) {
      return cell >= 0 && cell < total && blocks(cell, cameraY);
    },
    isPointHidden,
    isBoxHidden,
    tester(enabled = true) {
      return {
        enabled,
        isOccluded(input: OcclusionInput) {
          const b = input.bounds;
          return isBoxHidden(
            { x: input.camera.position[0], y: input.camera.position[1], z: input.camera.position[2] },
            { minX: b.minX, minY: b.minY, minZ: b.minZ, maxX: b.maxX, maxY: b.maxY, maxZ: b.maxZ },
          );
        },
      };
    },
    stats() {
      let blockerCells = 0;
      for (let cell = 0; cell < total; cell += 1) if (tops[cell]! > 0) blockerCells += 1;
      return { cells: total, blockerCells, occluders, buildMs, tests, rejected, testMs };
    },
    measure() {
      const delta = { tests, rejected, testMs };
      tests = 0;
      rejected = 0;
      testMs = 0;
      return delta;
    },
    clear() {
      tops.fill(0);
      bases.fill(Number.POSITIVE_INFINITY);
      occluders = 0;
      buildMs = 0;
      tests = 0;
      rejected = 0;
      testMs = 0;
    },
    toState() {
      return {
        cols,
        rows,
        minX,
        minZ,
        cellSize,
        tops: Array.from(tops),
        bases: Array.from(bases),
      };
    },
  };
}
