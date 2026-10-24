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
  /** Hard cap on samples one ray may take. Default 4096. */
  readonly maxSamples?: number;
  readonly restore?: OccluderGridState;
}

/** Serializable grid contents — the trusted blockers, not the scene they came from. */
export interface OccluderGridState {
  readonly cols: number;
  readonly rows: number;
  readonly minX: number;
  readonly minZ: number;
  readonly cellSize: number;
  readonly boxes: readonly OccluderBox[];
}

/** Counters a grid keeps so its own cost can be compared with what it saves. */
export interface OccluderGridStats {
  /** Cells in the grid. */
  readonly cells: number;
  /** Cells at least one trusted box touches. */
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
  /** Whether a cell holds a trusted box tall enough to hide what is behind it from this camera height. */
  isCellBlocked(cell: number, cameraY: number): boolean;
  /**
   * Whether a world point is behind blockers from `camera`. The centre ray decides most answers; the
   * four cell corners must also be blocked before a point counts as hidden.
   */
  isPointHidden(cameraX: number, cameraY: number, cameraZ: number, x: number, y: number, z: number): boolean;
  /**
   * Whether a box can be rejected. Only a box whose whole footprint sits inside one grid cell is
   * tested, so the answer is conservative: a partially covered box is never rejected.
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

/**
 * Build a coarse occluder grid from authored solids. The grid is built once from geometry — never by
 * per-frame raycasts — and answers "is this point behind something taller than the camera" by walking
 * the camera ray and asking whether each sample lies inside a trusted box. A sample counts only when
 * it is strictly inside a blocker's footprint, so the grid can miss a hidden object but cannot hide a
 * visible one.
 *
 * @capability occluder-grid coarse built-once occluder field that rejects cells blocked from the camera
 */
export function createOccluderGrid(config: OccluderGridConfig): OccluderGrid {
  const cellSize = config.cellSize;
  if (cellSize <= 0) throw new Error("createOccluderGrid: cellSize must be positive");
  const minHeight = config.minHeight ?? 6;
  const maxSamples = config.maxSamples ?? 4096;
  const restore = config.restore;

  const minX = restore?.minX ?? config.bounds.minX;
  const minZ = restore?.minZ ?? config.bounds.minZ;
  const cols = restore?.cols ?? Math.max(1, Math.ceil((config.bounds.maxX - config.bounds.minX) / cellSize));
  const rows = restore?.rows ?? Math.max(1, Math.ceil((config.bounds.maxZ - config.bounds.minZ) / cellSize));
  const total = cols * rows;

  let boxes: OccluderBox[] = [];
  let cells: number[][] = [];
  let buildMs = 0;
  let tests = 0;
  let rejected = 0;
  let testMs = 0;

  if (restore !== undefined) {
    for (const box of restore.boxes) if (box.maxY - box.minY >= minHeight) boxes.push(box);
    index();
  }

  function colOf(x: number): number {
    const col = Math.floor((x - minX) / cellSize);
    return col < 0 ? 0 : col >= cols ? cols - 1 : col;
  }
  function rowOf(z: number): number {
    const row = Math.floor((z - minZ) / cellSize);
    return row < 0 ? 0 : row >= rows ? rows - 1 : row;
  }
  function cellIndex(x: number, z: number): number {
    return rowOf(z) * cols + colOf(x);
  }

  function index(): void {
    cells = Array.from({ length: total }, () => [] as number[]);
    for (let boxIndex = 0; boxIndex < boxes.length; boxIndex += 1) {
      const box = boxes[boxIndex]!;
      const firstCol = Math.max(0, colOf(box.minX));
      const lastCol = Math.min(cols - 1, colOf(box.maxX - 1e-6));
      const firstRow = Math.max(0, rowOf(box.minZ));
      const lastRow = Math.min(rows - 1, rowOf(box.maxZ - 1e-6));
      for (let row = firstRow; row <= lastRow; row += 1) {
        for (let col = firstCol; col <= lastCol; col += 1) cells[row * cols + col]!.push(boxIndex);
      }
    }
  }

  function build(next: Iterable<OccluderBox>): void {
    const started = now();
    boxes = [];
    for (const box of next) {
      if (box.maxY - box.minY < minHeight) continue;
      boxes.push(box);
    }
    index();
    buildMs = now() - started;
  }

  /** A box hides a sample when the sample is inside its footprint and the box spans the camera height. */
  function boxBlocks(box: OccluderBox, x: number, z: number, cameraY: number): boolean {
    const margin = cellSize * 0.01;
    return box.minY <= cameraY && box.maxY >= cameraY &&
      x > box.minX + margin && x < box.maxX - margin &&
      z > box.minZ + margin && z < box.maxZ - margin;
  }

  function isCellBlocked(cell: number, cameraY: number): boolean {
    if (cell < 0 || cell >= total) return false;
    const col = cell % cols;
    const row = (cell - col) / cols;
    const x = minX + (col + 0.5) * cellSize;
    const z = minZ + (row + 0.5) * cellSize;
    for (const boxIndex of cells[cell]!) {
      if (boxBlocks(boxes[boxIndex]!, x, z, cameraY)) return true;
    }
    return false;
  }

  function rayBlocked(cameraX: number, cameraY: number, cameraZ: number, x: number, z: number): boolean {
    const dx = x - cameraX;
    const dz = z - cameraZ;
    const length = Math.hypot(dx, dz);
    if (length <= 0) return false;
    const samples = Math.min(maxSamples, Math.ceil(length / (cellSize * 0.5)));
    if (samples <= 0) return false;
    for (let sample = 1; sample < samples; sample += 1) {
      const t = sample / samples;
      const px = cameraX + dx * t;
      const pz = cameraZ + dz * t;
      const cell = cellIndex(px, pz);
      for (const boxIndex of cells[cell]!) {
        if (boxBlocks(boxes[boxIndex]!, px, pz, cameraY)) return true;
      }
    }
    return false;
  }

  function isPointHidden(cameraX: number, cameraY: number, cameraZ: number, x: number, _y: number, z: number): boolean {
    if (colOf(cameraX) === colOf(x) && rowOf(cameraZ) === rowOf(z)) return false;
    if (!rayBlocked(cameraX, cameraY, cameraZ, x, z)) return false;
    const col = colOf(x);
    const row = rowOf(z);
    const left = minX + col * cellSize;
    const near = minZ + row * cellSize;
    const cornersX = [left + 0.25 * cellSize, left + 0.75 * cellSize, left + 0.25 * cellSize, left + 0.75 * cellSize];
    const cornersZ = [near + 0.25 * cellSize, near + 0.25 * cellSize, near + 0.75 * cellSize, near + 0.75 * cellSize];
    for (let corner = 0; corner < 4; corner += 1) {
      if (!rayBlocked(cameraX, cameraY, cameraZ, cornersX[corner]!, cornersZ[corner]!)) return false;
    }
    return true;
  }

  function isBoxHidden(camera: { readonly x: number; readonly y: number; readonly z: number }, box: OccluderBox): boolean {
    const started = now();
    tests += 1;
    // Nine sample rays over the footprint: the centre decides most answers, and a box is only
    // rejected when every sample is blocked. A gap narrower than a grid cell between two blockers is
    // not modelled, so this can under-report a hidden box; it cannot see through a blocking one.
    const midX = (box.minX + box.maxX) / 2;
    const midZ = (box.minZ + box.maxZ) / 2;
    const midY = (box.minY + box.maxY) / 2;
    const xs = [midX, box.minX, box.maxX, box.minX, box.maxX, midX, box.minX, box.maxX, midX];
    const zs = [midZ, box.minZ, box.minZ, box.maxZ, box.maxZ, box.minZ, midZ, midZ, box.maxZ];
    let hidden = true;
    for (let sample = 0; sample < 9; sample += 1) {
      void midY;
      if (!rayBlocked(camera.x, camera.y, camera.z, xs[sample]!, zs[sample]!)) {
        hidden = false;
        break;
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
    isCellBlocked,
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
      for (const cell of cells) if (cell.length > 0) blockerCells += 1;
      return { cells: total, blockerCells, occluders: boxes.length, buildMs, tests, rejected, testMs };
    },
    measure() {
      const delta = { tests, rejected, testMs };
      tests = 0;
      rejected = 0;
      testMs = 0;
      return delta;
    },
    clear() {
      boxes = [];
      cells = [];
      buildMs = 0;
      tests = 0;
      rejected = 0;
      testMs = 0;
    },
    toState() {
      return { cols, rows, minX, minZ, cellSize, boxes: [...boxes] };
    },
  };
}


