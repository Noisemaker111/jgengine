import type { Aabb, Vec2 } from "./geometry";
import { fractalNoise, FLAT_FIELD, withNormal, type FractalNoiseConfig, type TerrainField, type TerrainNormal } from "./terrain";

/** A sculpt operation kind: heightfield brushes plus the surface-paint brush. */
export type TerraformMode = "raise" | "lower" | "smooth" | "flatten" | "noise" | "ramp" | "paint";
/** How a brush's strength fades from its center to its rim. */
export type TerraformFalloff = "smooth" | "linear" | "none";
/** A brush footprint: a round disc or an axis-aligned square. */
export type TerraformShape = "circle" | "square";

/** Clamp bounds applied to the resulting terrain height after a heightfield edit. */
export interface TerraformHeightLimit {
  min?: number;
  max?: number;
}

/** A single sculpt stamp: which brush, where, and its shaping parameters. */
export interface TerraformEdit {
  mode: TerraformMode;
  center: Vec2;
  radius: number;
  strength?: number;
  /** Flatten target height, or ramp start height when `to` is set (defaults to sampled ground). */
  target?: number;
  /** Ramp end point; required for `mode: "ramp"`, ignored otherwise. */
  to?: Vec2;
  /** Ramp end height (defaults to sampled ground at `to`). */
  targetTo?: number;
  surface?: string;
  falloff?: TerraformFalloff;
  shape?: TerraformShape;
  /** Noise brush frequency (world units), higher = finer detail. */
  frequency?: number;
  /** Noise brush seed — same seed reproduces the same roughening. */
  seed?: number;
  /** Clamp final terrain height into this range after the edit. */
  heightLimit?: TerraformHeightLimit;
}

export interface EditableTerrainConfig {
  bounds: Aabb;
  base?: TerrainField;
  cellSize?: number;
}

/**
 * One material layer in a terrain's reorderable stack: a palette `surface` id (drives the base
 * color) plus its render parameters. Array order is the stack order — lower index paints under
 * higher. `roughness`/`tiling`/`triplanar`/`tint`/`opacity` are carried as data so a runtime game
 * reads them straight off the snapshot.
 */
export interface TerrainMaterialLayer {
  id: string;
  surface: string;
  /** Surface micro-roughness 0..1 (0 = mirror, 1 = matte). */
  roughness?: number;
  /** World units per texture repeat. */
  tiling?: number;
  /** Project the material on all three axes to hide stretching on cliffs. */
  triplanar?: boolean;
  /** Hex color multiplied over the surface color. */
  tint?: string;
  /** Layer master opacity 0..1 — scales this layer's blend weight everywhere. */
  opacity?: number;
}

export interface TerraformSnapshot {
  bounds: Aabb;
  cellSize: number;
  cols: number;
  rows: number;
  offsets: readonly number[];
  /** Dominant surface id per cell — the single-layer fast path and backward-compatible channel. */
  surfaces: readonly (string | null)[];
  /** Reorderable material stack; absent on pre-2.0 documents (derive with {@link migrateTerrainSnapshot}). */
  layers?: readonly TerrainMaterialLayer[];
  /**
   * Per-cell per-layer blend weights, flat `cols*rows*layers.length` (cell-major, then layer),
   * each cell summing to ≈1. Lazy: absent until a blend is painted, so single-layer terrains stay
   * compact. When absent, blending falls back to the hard {@link TerraformSnapshot.surfaces} id.
   */
  weights?: readonly number[];
}

/**
 * A compact record of the vertices a sculpt stroke touched: parallel `indices`/`before`/`after`
 * arrays into the offset grid. Storing one of these per stroke keeps undo history small — the
 * whole terrain document is never copied.
 */
export interface TerraformDelta {
  indices: readonly number[];
  before: readonly number[];
  after: readonly number[];
}

/** Reports each changed vertex during a recorded edit: grid index, prior offset, new offset. */
export type TerraformDeltaRecorder = (index: number, before: number, after: number) => void;

/**
 * A compact record of the surface-material cells a paint stroke touched: parallel
 * `indices`/`before`/`after` arrays into the per-cell surface grid. One per stroke keeps paint
 * undo history small.
 */
export interface SurfaceDelta {
  indices: readonly number[];
  before: readonly (string | null)[];
  after: readonly (string | null)[];
}

/** Reports each changed cell during a recorded paint: grid index, prior surface id, new surface id. */
export type SurfaceDeltaRecorder = (index: number, before: string | null, after: string | null) => void;

/**
 * A compact record of the blend weights a blend-paint stroke touched: parallel `indices`/`before`/
 * `after` arrays into the flat `weights` grid (`cell*layerCount + layer`). `layerCount` guards the
 * delta against being replayed after the layer stack changed shape.
 */
export interface WeightDelta {
  layerCount: number;
  indices: readonly number[];
  before: readonly number[];
  after: readonly number[];
}

/** Reports each changed weight slot during a recorded blend: flat index, prior weight, new weight. */
export type WeightDeltaRecorder = (index: number, before: number, after: number) => void;

/** A height/slope predicate for auto-painting a surface layer (e.g. rock on steep slopes, snow up high). */
export interface TerrainSurfaceRule {
  surface: string | null;
  /** Minimum slope (rise/run) a cell must have to be painted. */
  minSlope?: number;
  maxSlope?: number;
  minHeight?: number;
  maxHeight?: number;
}

export interface EditableTerrain extends TerrainField {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  apply(edit: TerraformEdit): number;
  /** Apply an edit while reporting every touched vertex to `record` — the seam strokes record deltas through. */
  applyRecording(edit: TerraformEdit, record: TerraformDeltaRecorder): number;
  /** Apply a single edit and return the compact delta it produced. */
  editDelta(edit: TerraformEdit): TerraformDelta;
  /** Re-apply a delta's `after` offsets (redo). */
  applyDelta(delta: TerraformDelta): void;
  /** Restore a delta's `before` offsets (undo). */
  revertDelta(delta: TerraformDelta): void;
  /** Paint a surface brush while reporting every changed cell to `record` — surface strokes record deltas through. */
  paintRecording(edit: TerraformEdit, record: SurfaceDeltaRecorder): number;
  /** Paint a surface brush and return the compact delta it produced. */
  paintDelta(edit: TerraformEdit): SurfaceDelta;
  /** Fill every cell with one surface (or `null` to clear) and return the compact delta. */
  fillSurfaceDelta(surface: string | null): SurfaceDelta;
  /** Paint a surface into every cell matching a height/slope rule and return the compact delta. */
  autoPaintDelta(rule: TerrainSurfaceRule): SurfaceDelta;
  /** Re-apply a surface delta's `after` ids (redo). */
  applySurfaceDelta(delta: SurfaceDelta): void;
  /** Restore a surface delta's `before` ids (undo). */
  revertSurfaceDelta(delta: SurfaceDelta): void;
  /** The current material layer stack (lower index paints under higher). */
  readonly layers: readonly TerrainMaterialLayer[];
  /** Replace the material layer stack; drops blend weights whose layer index no longer exists. */
  setLayers(layers: readonly TerrainMaterialLayer[]): void;
  /**
   * Paint the active `edit.surface` layer's blend weight into the brush footprint, pushing the
   * cell toward that layer while renormalizing the rest. Returns the compact delta it produced;
   * empty if `edit.surface` is not one of the current {@link layers}.
   */
  blendPaintDelta(edit: TerraformEdit): WeightDelta;
  /** Blend-paint while reporting every changed weight slot to `record` — blend strokes record through it. */
  blendRecording(edit: TerraformEdit, record: WeightDeltaRecorder): number;
  /** Re-apply a weight delta's `after` values (redo). */
  applyWeightDelta(delta: WeightDelta): void;
  /** Restore a weight delta's `before` values (undo). */
  revertWeightDelta(delta: WeightDelta): void;
  /** The per-layer blend weights under a world point (parallel to {@link layers}); empty when unblended. */
  weightsAt(x: number, z: number): number[];
  heightOffsetAt(x: number, z: number): number;
  surfaceAt(x: number, z: number): string | null;
  reset(): void;
  snapshot(): TerraformSnapshot;
  restore(snapshot: TerraformSnapshot): void;
}

/** Smooth/linear/hard brush weight for a sample `distance` from the brush center. */
export function brushWeight(distance: number, radius: number, falloff: TerraformFalloff): number {
  if (radius <= 0) return distance <= 0 ? 1 : 0;
  const t = distance / radius;
  if (t >= 1) return 0;
  if (falloff === "none") return 1;
  if (falloff === "linear") return 1 - t;
  const s = 1 - t;
  return s * s * (3 - 2 * s);
}

function clampIndex(value: number, max: number): number {
  return value < 0 ? 0 : value > max ? max : value;
}

function clampRange(value: number, min: number | undefined, max: number | undefined): number {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

export function createEditableTerrain(config: EditableTerrainConfig): EditableTerrain {
  const base = config.base ?? FLAT_FIELD;
  const bounds = config.bounds;
  const cellSize = config.cellSize && config.cellSize > 0 ? config.cellSize : 1;
  const spanX = Math.max(bounds.maxX - bounds.minX, cellSize);
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, cellSize);
  const cols = Math.max(1, Math.round(spanX / cellSize));
  const rows = Math.max(1, Math.round(spanZ / cellSize));
  const vertsX = cols + 1;
  const vertsZ = rows + 1;
  const offsets = new Float32Array(vertsX * vertsZ);
  const surfaces: (string | null)[] = new Array(cols * rows).fill(null);
  const cellCount = cols * rows;
  let layers: TerrainMaterialLayer[] = [];
  // Lazily allocated: null until the first blend, so single-layer terrains carry no weight buffer.
  let weights: Float32Array | null = null;

  function gridX(x: number): number {
    return ((x - bounds.minX) / spanX) * cols;
  }
  function gridZ(z: number): number {
    return ((z - bounds.minZ) / spanZ) * rows;
  }
  function vertexWorldX(gx: number): number {
    return bounds.minX + (gx / cols) * spanX;
  }
  function vertexWorldZ(gz: number): number {
    return bounds.minZ + (gz / rows) * spanZ;
  }

  function heightOffsetAt(x: number, z: number): number {
    const fx = gridX(x);
    const fz = gridZ(z);
    const x0 = clampIndex(Math.floor(fx), cols);
    const z0 = clampIndex(Math.floor(fz), rows);
    const x1 = clampIndex(x0 + 1, cols);
    const z1 = clampIndex(z0 + 1, rows);
    const tx = fx - x0 < 0 ? 0 : fx - x0 > 1 ? 1 : fx - x0;
    const tz = fz - z0 < 0 ? 0 : fz - z0 > 1 ? 1 : fz - z0;
    const v00 = offsets[z0 * vertsX + x0]!;
    const v10 = offsets[z0 * vertsX + x1]!;
    const v01 = offsets[z1 * vertsX + x0]!;
    const v11 = offsets[z1 * vertsX + x1]!;
    const top = v00 + (v10 - v00) * tx;
    const bottom = v01 + (v11 - v01) * tx;
    return top + (bottom - top) * tz;
  }

  const sampleHeight = (x: number, z: number): number => base.sampleHeight(x, z) + heightOffsetAt(x, z);
  const sampleNormal = withNormal(sampleHeight);

  function totalHeightAtVertex(gx: number, gz: number): number {
    const wx = vertexWorldX(gx);
    const wz = vertexWorldZ(gz);
    return base.sampleHeight(wx, wz) + offsets[gz * vertsX + gx]!;
  }

  function neighborAverageHeight(gx: number, gz: number): number {
    let sum = 0;
    let count = 0;
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const nx = gx + dx;
      const nz = gz + dz;
      if (nx < 0 || nx >= vertsX || nz < 0 || nz >= vertsZ) continue;
      sum += totalHeightAtVertex(nx, nz);
      count += 1;
    }
    return count === 0 ? totalHeightAtVertex(gx, gz) : sum / count;
  }

  function writeOffset(
    index: number,
    next: number,
    limit: TerraformHeightLimit | undefined,
    wx: number,
    wz: number,
    record: TerraformDeltaRecorder | null,
  ): boolean {
    let value = next;
    if (limit !== undefined) {
      value = clampRange(base.sampleHeight(wx, wz) + value, limit.min, limit.max) - base.sampleHeight(wx, wz);
    }
    const before = offsets[index]!;
    if (value === before) return false;
    offsets[index] = value;
    record?.(index, before, value);
    return true;
  }

  function editHeight(edit: TerraformEdit, record: TerraformDeltaRecorder | null): number {
    const falloff = edit.falloff ?? "smooth";
    const shape = edit.shape ?? "circle";
    const strength = edit.strength ?? 1;
    const limit = edit.heightLimit;
    const flattenTarget =
      edit.mode === "flatten" ? edit.target ?? sampleHeight(edit.center[0], edit.center[1]) : 0;
    const noiseConfig: FractalNoiseConfig = {
      seed: edit.seed ?? 1337,
      frequency: edit.frequency ?? 0.15,
      octaves: 3,
      lacunarity: 2,
      persistence: 0.5,
      ridged: false,
    };
    const rCells = Math.ceil(edit.radius / cellSize) + 1;
    const cx = gridX(edit.center[0]);
    const cz = gridZ(edit.center[1]);
    let changed = 0;
    for (let iz = -rCells; iz <= rCells; iz += 1) {
      const gz = Math.round(cz) + iz;
      if (gz < 0 || gz >= vertsZ) continue;
      for (let ix = -rCells; ix <= rCells; ix += 1) {
        const gx = Math.round(cx) + ix;
        if (gx < 0 || gx >= vertsX) continue;
        const wx = vertexWorldX(gx);
        const wz = vertexWorldZ(gz);
        const dx = wx - edit.center[0];
        const dz = wz - edit.center[1];
        const dist = shape === "square" ? Math.max(Math.abs(dx), Math.abs(dz)) : Math.hypot(dx, dz);
        const weight = brushWeight(dist, edit.radius, falloff);
        if (weight <= 0) continue;
        const index = gz * vertsX + gx;
        const current = offsets[index]!;
        let next = current;
        if (edit.mode === "raise") next = current + strength * weight;
        else if (edit.mode === "lower") next = current - strength * weight;
        else if (edit.mode === "noise") next = current + fractalNoise(wx, wz, noiseConfig) * strength * weight;
        else if (edit.mode === "smooth") {
          const target = neighborAverageHeight(gx, gz);
          const currentTotal = base.sampleHeight(wx, wz) + current;
          next = current + (target - currentTotal) * weight * strength;
        } else {
          const currentTotal = base.sampleHeight(wx, wz) + current;
          next = current + (flattenTarget - currentTotal) * weight * strength;
        }
        if (writeOffset(index, next, limit, wx, wz, record)) changed += 1;
      }
    }
    return changed;
  }

  function editRamp(edit: TerraformEdit, record: TerraformDeltaRecorder | null): number {
    const to = edit.to;
    if (to === undefined) return 0;
    const falloff = edit.falloff ?? "smooth";
    const strength = edit.strength ?? 1;
    const limit = edit.heightLimit;
    const [ax, az] = edit.center;
    const [bx, bz] = to;
    const hFrom = edit.target ?? sampleHeight(ax, az);
    const hTo = edit.targetTo ?? sampleHeight(bx, bz);
    const segX = bx - ax;
    const segZ = bz - az;
    const segLenSq = segX * segX + segZ * segZ || 1;
    const minGx = clampIndex(Math.floor(gridX(Math.min(ax, bx) - edit.radius)), vertsX - 1);
    const maxGx = clampIndex(Math.ceil(gridX(Math.max(ax, bx) + edit.radius)), vertsX - 1);
    const minGz = clampIndex(Math.floor(gridZ(Math.min(az, bz) - edit.radius)), vertsZ - 1);
    const maxGz = clampIndex(Math.ceil(gridZ(Math.max(az, bz) + edit.radius)), vertsZ - 1);
    let changed = 0;
    for (let gz = minGz; gz <= maxGz; gz += 1) {
      for (let gx = minGx; gx <= maxGx; gx += 1) {
        const wx = vertexWorldX(gx);
        const wz = vertexWorldZ(gz);
        let t = ((wx - ax) * segX + (wz - az) * segZ) / segLenSq;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + segX * t;
        const pz = az + segZ * t;
        const weight = brushWeight(Math.hypot(wx - px, wz - pz), edit.radius, falloff);
        if (weight <= 0) continue;
        const index = gz * vertsX + gx;
        const current = offsets[index]!;
        const target = hFrom + (hTo - hFrom) * t;
        const currentTotal = base.sampleHeight(wx, wz) + current;
        const next = current + (target - currentTotal) * weight * strength;
        if (writeOffset(index, next, limit, wx, wz, record)) changed += 1;
      }
    }
    return changed;
  }

  function cellWorldX(gx: number): number {
    return bounds.minX + ((gx + 0.5) / cols) * spanX;
  }
  function cellWorldZ(gz: number): number {
    return bounds.minZ + ((gz + 0.5) / rows) * spanZ;
  }

  function writeSurface(index: number, surface: string | null, record: SurfaceDeltaRecorder | null): boolean {
    const before = surfaces[index] ?? null;
    if (before === surface) return false;
    surfaces[index] = surface;
    record?.(index, before, surface);
    return true;
  }

  function paintSurface(edit: TerraformEdit, record: SurfaceDeltaRecorder | null): number {
    const surface = edit.surface ?? null;
    const shape = edit.shape ?? "circle";
    const rCells = Math.ceil(edit.radius / cellSize) + 1;
    const cx = gridX(edit.center[0]);
    const cz = gridZ(edit.center[1]);
    let painted = 0;
    for (let iz = -rCells; iz <= rCells; iz += 1) {
      const gz = Math.floor(cz) + iz;
      if (gz < 0 || gz >= rows) continue;
      for (let ix = -rCells; ix <= rCells; ix += 1) {
        const gx = Math.floor(cx) + ix;
        if (gx < 0 || gx >= cols) continue;
        const dx = cellWorldX(gx) - edit.center[0];
        const dz = cellWorldZ(gz) - edit.center[1];
        const dist = shape === "square" ? Math.max(Math.abs(dx), Math.abs(dz)) : Math.hypot(dx, dz);
        if (dist > edit.radius) continue;
        if (writeSurface(gz * cols + gx, surface, record)) painted += 1;
      }
    }
    return painted;
  }

  function localNormal(wx: number, wz: number): TerrainNormal {
    const eps = Math.max(cellSize, 0.5);
    const hx = sampleHeight(wx + eps, wz) - sampleHeight(wx - eps, wz);
    const hz = sampleHeight(wx, wz + eps) - sampleHeight(wx, wz - eps);
    const nx = -hx;
    const nz = -hz;
    const ny = 2 * eps;
    const length = Math.hypot(nx, ny, nz) || 1;
    return [nx / length, ny / length, nz / length] as const;
  }

  function autoPaint(rule: TerrainSurfaceRule, record: SurfaceDeltaRecorder | null): number {
    let painted = 0;
    for (let gz = 0; gz < rows; gz += 1) {
      for (let gx = 0; gx < cols; gx += 1) {
        const wx = cellWorldX(gx);
        const wz = cellWorldZ(gz);
        const height = sampleHeight(wx, wz);
        if (rule.minHeight !== undefined && height < rule.minHeight) continue;
        if (rule.maxHeight !== undefined && height > rule.maxHeight) continue;
        if (rule.minSlope !== undefined || rule.maxSlope !== undefined) {
          const [nx, ny, nz] = localNormal(wx, wz);
          const slope = Math.hypot(nx, nz) / Math.max(ny, 1e-9);
          if (rule.minSlope !== undefined && slope < rule.minSlope) continue;
          if (rule.maxSlope !== undefined && slope > rule.maxSlope) continue;
        }
        if (writeSurface(gz * cols + gx, rule.surface, record)) painted += 1;
      }
    }
    return painted;
  }

  function fillSurface(surface: string | null, record: SurfaceDeltaRecorder | null): number {
    let painted = 0;
    for (let index = 0; index < surfaces.length; index += 1) {
      if (writeSurface(index, surface, record)) painted += 1;
    }
    return painted;
  }

  function cellIndexAt(x: number, z: number): number {
    const gx = Math.floor(gridX(x));
    const gz = Math.floor(gridZ(z));
    if (gx < 0 || gx >= cols || gz < 0 || gz >= rows) return -1;
    return gz * cols + gx;
  }

  function dominantLayerAt(cell: number): number {
    if (weights === null || layers.length === 0) return -1;
    const base = cell * layers.length;
    let best = -1;
    let bestWeight = 0;
    for (let l = 0; l < layers.length; l += 1) {
      const w = weights[base + l]!;
      if (w > bestWeight) {
        bestWeight = w;
        best = l;
      }
    }
    return best;
  }

  function surfaceAt(x: number, z: number): string | null {
    const cell = cellIndexAt(x, z);
    if (cell < 0) return null;
    const dominant = dominantLayerAt(cell);
    if (dominant >= 0) return layers[dominant]!.surface;
    return surfaces[cell] ?? null;
  }

  function weightsAt(x: number, z: number): number[] {
    const cell = cellIndexAt(x, z);
    if (cell < 0 || weights === null || layers.length === 0) return [];
    const base = cell * layers.length;
    return Array.from({ length: layers.length }, (_, l) => weights![base + l]!);
  }

  /** Materializes the weight buffer, seeding each cell to weight 1 on its current dominant surface. */
  function ensureWeights(): Float32Array {
    if (weights !== null) return weights;
    const buffer = new Float32Array(cellCount * Math.max(1, layers.length));
    if (layers.length > 0) {
      for (let cell = 0; cell < cellCount; cell += 1) {
        const surface = surfaces[cell];
        const layer = surface === null ? -1 : layers.findIndex((entry) => entry.surface === surface);
        if (layer >= 0) buffer[cell * layers.length + layer] = 1;
      }
    }
    weights = buffer;
    return buffer;
  }

  function blendCell(cell: number, target: number, amount: number, record: WeightDeltaRecorder | null): boolean {
    const buffer = ensureWeights();
    const L = layers.length;
    const base = cell * L;
    const prevTarget = buffer[base + target]!;
    const nextTarget = prevTarget + (1 - prevTarget) * amount;
    if (nextTarget === prevTarget) return false;
    let othersSum = 0;
    for (let l = 0; l < L; l += 1) if (l !== target) othersSum += buffer[base + l]!;
    const remainder = 1 - nextTarget;
    for (let l = 0; l < L; l += 1) {
      const prev = buffer[base + l]!;
      const next = l === target ? nextTarget : othersSum > 0 ? (prev / othersSum) * remainder : 0;
      if (next !== prev) {
        buffer[base + l] = next;
        record?.(base + l, prev, next);
      }
    }
    return true;
  }

  function blendPaint(edit: TerraformEdit, record: WeightDeltaRecorder | null): number {
    const surface = edit.surface;
    if (surface === undefined || layers.length === 0) return 0;
    const target = layers.findIndex((entry) => entry.surface === surface);
    if (target < 0) return 0;
    const falloff = edit.falloff ?? "smooth";
    const shape = edit.shape ?? "circle";
    const strength = edit.strength ?? 1;
    const rCells = Math.ceil(edit.radius / cellSize) + 1;
    const cx = gridX(edit.center[0]);
    const cz = gridZ(edit.center[1]);
    let painted = 0;
    for (let iz = -rCells; iz <= rCells; iz += 1) {
      const gz = Math.floor(cz) + iz;
      if (gz < 0 || gz >= rows) continue;
      for (let ix = -rCells; ix <= rCells; ix += 1) {
        const gx = Math.floor(cx) + ix;
        if (gx < 0 || gx >= cols) continue;
        const dx = cellWorldX(gx) - edit.center[0];
        const dz = cellWorldZ(gz) - edit.center[1];
        const dist = shape === "square" ? Math.max(Math.abs(dx), Math.abs(dz)) : Math.hypot(dx, dz);
        const weight = brushWeight(dist, edit.radius, falloff);
        if (weight <= 0) continue;
        if (blendCell(gz * cols + gx, target, weight * strength, record)) painted += 1;
      }
    }
    return painted;
  }

  function runHeightEdit(edit: TerraformEdit, record: TerraformDeltaRecorder | null): number {
    if (edit.mode === "ramp") return editRamp(edit, record);
    return editHeight(edit, record);
  }

  function surfaceDeltaFrom(run: (record: SurfaceDeltaRecorder) => void): SurfaceDelta {
    const indices: number[] = [];
    const before: (string | null)[] = [];
    const after: (string | null)[] = [];
    run((index, prev, next) => {
      indices.push(index);
      before.push(prev);
      after.push(next);
    });
    return { indices, before, after };
  }

  const field: EditableTerrain = {
    cols,
    rows,
    cellSize,
    sampleHeight,
    sampleNormal,
    ...(base.bounds === undefined ? {} : { bounds: base.bounds }),
    ...(base.waterLevel === undefined ? {} : { waterLevel: base.waterLevel }),
    apply(edit) {
      return edit.mode === "paint" ? paintSurface(edit, null) : runHeightEdit(edit, null);
    },
    applyRecording(edit, record) {
      return runHeightEdit(edit, record);
    },
    editDelta(edit) {
      const indices: number[] = [];
      const before: number[] = [];
      const after: number[] = [];
      runHeightEdit(edit, (index, prev, next) => {
        indices.push(index);
        before.push(prev);
        after.push(next);
      });
      return { indices, before, after };
    },
    applyDelta(delta) {
      for (let i = 0; i < delta.indices.length; i += 1) offsets[delta.indices[i]!] = delta.after[i]!;
    },
    revertDelta(delta) {
      for (let i = 0; i < delta.indices.length; i += 1) offsets[delta.indices[i]!] = delta.before[i]!;
    },
    paintRecording(edit, record) {
      return paintSurface(edit, record);
    },
    paintDelta(edit) {
      return surfaceDeltaFrom((record) => paintSurface(edit, record));
    },
    fillSurfaceDelta(surface) {
      return surfaceDeltaFrom((record) => fillSurface(surface, record));
    },
    autoPaintDelta(rule) {
      return surfaceDeltaFrom((record) => autoPaint(rule, record));
    },
    applySurfaceDelta(delta) {
      for (let i = 0; i < delta.indices.length; i += 1) surfaces[delta.indices[i]!] = delta.after[i] ?? null;
    },
    revertSurfaceDelta(delta) {
      for (let i = 0; i < delta.indices.length; i += 1) surfaces[delta.indices[i]!] = delta.before[i] ?? null;
    },
    get layers() {
      return layers;
    },
    setLayers(next) {
      layers = next.map((layer) => ({ ...layer }));
      // Layer count changed shape: drop the weight buffer, blends re-seed from surfaces on demand.
      weights = null;
    },
    blendRecording(edit, record) {
      return blendPaint(edit, record);
    },
    blendPaintDelta(edit) {
      const indices: number[] = [];
      const before: number[] = [];
      const after: number[] = [];
      blendPaint(edit, (index, prev, next) => {
        indices.push(index);
        before.push(prev);
        after.push(next);
      });
      return { layerCount: layers.length, indices, before, after };
    },
    applyWeightDelta(delta) {
      if (delta.layerCount !== layers.length) return;
      const buffer = ensureWeights();
      for (let i = 0; i < delta.indices.length; i += 1) buffer[delta.indices[i]!] = delta.after[i]!;
    },
    revertWeightDelta(delta) {
      if (delta.layerCount !== layers.length) return;
      const buffer = ensureWeights();
      for (let i = 0; i < delta.indices.length; i += 1) buffer[delta.indices[i]!] = delta.before[i]!;
    },
    weightsAt,
    heightOffsetAt,
    surfaceAt,
    reset() {
      offsets.fill(0);
      surfaces.fill(null);
      weights = null;
    },
    snapshot() {
      return {
        bounds: { ...bounds },
        cellSize,
        cols,
        rows,
        offsets: Array.from(offsets),
        surfaces: surfaces.slice(),
        ...(layers.length === 0 ? {} : { layers: layers.map((layer) => ({ ...layer })) }),
        ...(weights === null ? {} : { weights: Array.from(weights) }),
      };
    },
    restore(snapshot) {
      const count = Math.min(offsets.length, snapshot.offsets.length);
      for (let index = 0; index < count; index += 1) offsets[index] = snapshot.offsets[index]!;
      const surfaceCount = Math.min(surfaces.length, snapshot.surfaces.length);
      for (let index = 0; index < surfaceCount; index += 1) surfaces[index] = snapshot.surfaces[index] ?? null;
      layers = (snapshot.layers ?? []).map((layer) => ({ ...layer }));
      if (snapshot.weights === undefined || layers.length === 0) {
        weights = null;
      } else {
        const buffer = new Float32Array(cellCount * layers.length);
        const copy = Math.min(buffer.length, snapshot.weights.length);
        for (let index = 0; index < copy; index += 1) buffer[index] = snapshot.weights[index]!;
        weights = buffer;
      }
    },
  };
  return field;
}

/**
 * Accumulates a whole drag — many brush stamps — into one compact {@link TerraformDelta}. Keeps
 * each vertex's first `before` and latest `after`, so undo replays the stroke as a single step
 * even though the pointer fired dozens of moves.
 */
export interface TerraformStroke {
  stamp(edit: TerraformEdit): number;
  delta(): TerraformDelta;
  isEmpty(): boolean;
}

/** Opens a stroke recorder over `terrain`; stamp edits into it, then read one net delta. */
export function beginTerraformStroke(terrain: Pick<EditableTerrain, "applyRecording">): TerraformStroke {
  const first = new Map<number, number>();
  const latest = new Map<number, number>();
  return {
    stamp(edit) {
      return terrain.applyRecording(edit, (index, before, after) => {
        if (!first.has(index)) first.set(index, before);
        latest.set(index, after);
      });
    },
    delta() {
      const indices: number[] = [];
      const before: number[] = [];
      const after: number[] = [];
      for (const [index, next] of latest) {
        const prev = first.get(index)!;
        if (next === prev) continue;
        indices.push(index);
        before.push(prev);
        after.push(next);
      }
      return { indices, before, after };
    },
    isEmpty() {
      return latest.size === 0;
    },
  };
}

/**
 * Accumulates a whole paint drag — many surface stamps — into one compact {@link SurfaceDelta}.
 * Keeps each cell's first `before` and latest `after`, so undo replays the paint as a single step.
 */
export interface SurfaceStroke {
  stamp(edit: TerraformEdit): number;
  delta(): SurfaceDelta;
  isEmpty(): boolean;
}

/** Opens a paint-stroke recorder over `terrain`; stamp paint edits into it, then read one net delta. */
export function beginSurfaceStroke(terrain: Pick<EditableTerrain, "paintRecording">): SurfaceStroke {
  const first = new Map<number, string | null>();
  const latest = new Map<number, string | null>();
  return {
    stamp(edit) {
      return terrain.paintRecording(edit, (index, before, after) => {
        if (!first.has(index)) first.set(index, before);
        latest.set(index, after);
      });
    },
    delta() {
      const indices: number[] = [];
      const before: (string | null)[] = [];
      const after: (string | null)[] = [];
      for (const [index, next] of latest) {
        const prev = first.get(index) ?? null;
        if (next === prev) continue;
        indices.push(index);
        before.push(prev);
        after.push(next);
      }
      return { indices, before, after };
    },
    isEmpty() {
      return latest.size === 0;
    },
  };
}

/** Returns a new snapshot with a surface delta's `after` ids applied (copy-on-write). */
export function applySurfaceDeltaToSnapshot(snapshot: TerraformSnapshot, delta: SurfaceDelta): TerraformSnapshot {
  const surfaces = snapshot.surfaces.slice();
  for (let i = 0; i < delta.indices.length; i += 1) surfaces[delta.indices[i]!] = delta.after[i] ?? null;
  return { ...snapshot, surfaces };
}

/** Returns a new snapshot with a surface delta's `before` ids restored (copy-on-write undo). */
export function revertSurfaceDeltaFromSnapshot(snapshot: TerraformSnapshot, delta: SurfaceDelta): TerraformSnapshot {
  const surfaces = snapshot.surfaces.slice();
  for (let i = 0; i < delta.indices.length; i += 1) surfaces[delta.indices[i]!] = delta.before[i] ?? null;
  return { ...snapshot, surfaces };
}

/** The distinct non-null surface ids painted in a snapshot, in first-seen order. */
function distinctSurfaces(snapshot: TerraformSnapshot): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const surface of snapshot.surfaces) {
    if (surface !== null && !seen.has(surface)) {
      seen.add(surface);
      out.push(surface);
    }
  }
  return out;
}

/**
 * Upgrades a pre-2.0 snapshot in place-safe (copy-on-write) form: derives a {@link TerrainMaterialLayer}
 * stack from the distinct painted surfaces (first-seen order, default params) when none exists.
 * Leaves the lazy `weights` buffer absent — a single-layer terrain stays compact until blended.
 * Idempotent: a snapshot that already carries `layers` is returned unchanged.
 */
export function migrateTerrainSnapshot(snapshot: TerraformSnapshot): TerraformSnapshot {
  if (snapshot.layers !== undefined) return snapshot;
  const layers: TerrainMaterialLayer[] = distinctSurfaces(snapshot).map((surface) => ({
    id: surface,
    surface,
    roughness: 0.9,
    tiling: 8,
  }));
  return { ...snapshot, layers };
}

/** Materializes a snapshot's blend weights, seeding weight 1 on each cell's dominant surface. */
function materializeSnapshotWeights(snapshot: TerraformSnapshot): number[] {
  const layers = snapshot.layers ?? [];
  const cells = snapshot.cols * snapshot.rows;
  const buffer = new Array<number>(cells * Math.max(1, layers.length)).fill(0);
  if (snapshot.weights !== undefined) {
    const copy = Math.min(buffer.length, snapshot.weights.length);
    for (let i = 0; i < copy; i += 1) buffer[i] = snapshot.weights[i]!;
    return buffer;
  }
  if (layers.length > 0) {
    for (let cell = 0; cell < cells; cell += 1) {
      const surface = snapshot.surfaces[cell] ?? null;
      const layer = surface === null ? -1 : layers.findIndex((entry) => entry.surface === surface);
      if (layer >= 0) buffer[cell * layers.length + layer] = 1;
    }
  }
  return buffer;
}

/**
 * Returns a new snapshot with a weight delta's `after` values applied (materializing weights first).
 * @internal — undo/redo plumbing behind the `blendTerrain` command.
 */
export function applyWeightDeltaToSnapshot(snapshot: TerraformSnapshot, delta: WeightDelta): TerraformSnapshot {
  if (delta.layerCount !== (snapshot.layers?.length ?? 0)) return snapshot;
  const weights = materializeSnapshotWeights(snapshot);
  for (let i = 0; i < delta.indices.length; i += 1) weights[delta.indices[i]!] = delta.after[i]!;
  return { ...snapshot, weights };
}

/**
 * Returns a new snapshot with a weight delta's `before` values restored (copy-on-write undo).
 * @internal — undo/redo plumbing behind the `blendTerrain` command.
 */
export function revertWeightDeltaFromSnapshot(snapshot: TerraformSnapshot, delta: WeightDelta): TerraformSnapshot {
  if (delta.layerCount !== (snapshot.layers?.length ?? 0)) return snapshot;
  const weights = materializeSnapshotWeights(snapshot);
  for (let i = 0; i < delta.indices.length; i += 1) weights[delta.indices[i]!] = delta.before[i]!;
  return { ...snapshot, weights };
}

/**
 * Accumulates a whole blend-paint drag into one compact {@link WeightDelta}. Keeps each weight
 * slot's first `before` and latest `after`, so undo replays the blend as a single step.
 */
export interface BlendStroke {
  stamp(edit: TerraformEdit): number;
  delta(): WeightDelta;
  isEmpty(): boolean;
}

/**
 * Opens a blend-stroke recorder over `terrain`; stamp blend edits into it, then read one net delta.
 * @internal — the stroke recorder behind the blend brush and the `blendTerrain` command.
 */
export function beginBlendStroke(terrain: Pick<EditableTerrain, "blendRecording" | "layers">): BlendStroke {
  const first = new Map<number, number>();
  const latest = new Map<number, number>();
  return {
    stamp(edit) {
      return terrain.blendRecording(edit, (index, before, after) => {
        if (!first.has(index)) first.set(index, before);
        latest.set(index, after);
      });
    },
    delta() {
      const indices: number[] = [];
      const before: number[] = [];
      const after: number[] = [];
      for (const [index, next] of latest) {
        const prev = first.get(index)!;
        if (next === prev) continue;
        indices.push(index);
        before.push(prev);
        after.push(next);
      }
      return { layerCount: terrain.layers.length, indices, before, after };
    },
    isEmpty() {
      return latest.size === 0;
    },
  };
}

/**
 * The world-space {@link Aabb} spanning the vertices a stroke's `indices` touched (indices into the
 * `(cols+1)×(rows+1)` offset grid), expanded by `margin` meters. Drives partial preview-mesh
 * rebuilds — only the dirty submesh re-samples instead of the whole heightfield. Null if empty.
 * @internal — the editor's preview-mesh rebuild uses this; not a game-facing primitive.
 */
export function dirtyBoundsFromIndices(
  snapshot: TerraformSnapshot,
  indices: readonly number[],
  margin = 0,
): Aabb | null {
  if (indices.length === 0) return null;
  const vertsX = snapshot.cols + 1;
  const spanX = Math.max(snapshot.bounds.maxX - snapshot.bounds.minX, snapshot.cellSize);
  const spanZ = Math.max(snapshot.bounds.maxZ - snapshot.bounds.minZ, snapshot.cellSize);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const index of indices) {
    const gx = index % vertsX;
    const gz = Math.floor(index / vertsX);
    const wx = snapshot.bounds.minX + (gx / snapshot.cols) * spanX;
    const wz = snapshot.bounds.minZ + (gz / snapshot.rows) * spanZ;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wz < minZ) minZ = wz;
    if (wz > maxZ) maxZ = wz;
  }
  return { minX: minX - margin, minZ: minZ - margin, maxX: maxX + margin, maxZ: maxZ + margin };
}

/** A fresh, unedited terrain snapshot sized to `bounds`/`cellSize` — the seed for a new sculpt document. */
export function createTerrainSnapshot(config: EditableTerrainConfig): TerraformSnapshot {
  return createEditableTerrain(config).snapshot();
}

/** Rebuilds a live {@link EditableTerrain} from a snapshot, layered over `base` ground. */
export function editableTerrainFromSnapshot(
  snapshot: TerraformSnapshot,
  base?: TerrainField,
): EditableTerrain {
  const terrain = createEditableTerrain({
    bounds: snapshot.bounds,
    cellSize: snapshot.cellSize,
    ...(base === undefined ? {} : { base }),
  });
  terrain.restore(snapshot);
  return terrain;
}

/** Returns a new snapshot with a delta's `after` offsets applied (copy-on-write — inputs untouched). */
export function applyDeltaToSnapshot(snapshot: TerraformSnapshot, delta: TerraformDelta): TerraformSnapshot {
  const offsets = snapshot.offsets.slice();
  for (let i = 0; i < delta.indices.length; i += 1) offsets[delta.indices[i]!] = delta.after[i]!;
  return { ...snapshot, offsets };
}

/** Returns a new snapshot with a delta's `before` offsets restored (copy-on-write undo). */
export function revertDeltaFromSnapshot(snapshot: TerraformSnapshot, delta: TerraformDelta): TerraformSnapshot {
  const offsets = snapshot.offsets.slice();
  for (let i = 0; i < delta.indices.length; i += 1) offsets[delta.indices[i]!] = delta.before[i]!;
  return { ...snapshot, offsets };
}

export interface TerraformBrushConfig {
  radius?: number;
  strength?: number;
  falloff?: TerraformFalloff;
  surface?: string;
}

export interface TerraformBrush {
  raise(center: Vec2): number;
  lower(center: Vec2): number;
  flatten(center: Vec2, target?: number): number;
  paint(center: Vec2, surface?: string): number;
  setRadius(radius: number): void;
  setStrength(strength: number): void;
  config(): Required<Omit<TerraformBrushConfig, "surface">> & { surface: string | undefined };
}

export function createTerraformBrush(
  terrain: Pick<EditableTerrain, "apply">,
  config: TerraformBrushConfig = {},
): TerraformBrush {
  let radius = config.radius ?? 3;
  let strength = config.strength ?? 0.5;
  const falloff = config.falloff ?? "smooth";
  const surface = config.surface;

  return {
    raise(center) {
      return terrain.apply({ mode: "raise", center, radius, strength, falloff });
    },
    lower(center) {
      return terrain.apply({ mode: "lower", center, radius, strength, falloff });
    },
    flatten(center, target) {
      return terrain.apply({ mode: "flatten", center, radius, strength, falloff, ...(target === undefined ? {} : { target }) });
    },
    paint(center, paintSurface) {
      const chosen = paintSurface ?? surface;
      return terrain.apply({ mode: "paint", center, radius, ...(chosen === undefined ? {} : { surface: chosen }) });
    },
    setRadius(next) {
      radius = next;
    },
    setStrength(next) {
      strength = next;
    },
    config() {
      return { radius, strength, falloff, surface };
    },
  };
}
