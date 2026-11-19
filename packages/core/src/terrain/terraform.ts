import type { Aabb, Vec2 } from "../world/geometry";
import type { TerrainMaterialMaps } from "../world/features";
import { fractalNoise, FLAT_FIELD, withNormal, type FractalNoiseConfig, type TerrainField, type TerrainNormal } from "./terrain";

export type TerraformMode = "raise" | "lower" | "smooth" | "flatten" | "noise" | "ramp" | "paint";
export type TerraformFalloff = "smooth" | "linear" | "none";
export type TerraformShape = "circle" | "square";

export interface TerraformHeightLimit {
  min?: number;
  max?: number;
}

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
  frequency?: number;
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
  tiling?: number;
  triplanar?: boolean;
  tint?: string;
  /** Layer master opacity 0..1 — scales this layer's blend weight everywhere. */
  opacity?: number;
  /**
   * Material library name (e.g. `"foliage/grass"`) whose scanned PBR maps paint this layer,
   * as authored. The editor resolves it into {@link TerrainMaterialLayer.materialMaps} so the runtime
   * needs no asset-library lookup.
   */
  material?: string;
  materialMaps?: TerrainMaterialMaps | undefined;
}

export interface TerraformSnapshot {
  bounds: Aabb;
  cellSize: number;
  cols: number;
  rows: number;
  offsets: readonly number[];
  surfaces: readonly (string | null)[];
  layers?: readonly TerrainMaterialLayer[];
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

export type TerraformDeltaRecorder = (index: number, before: number, after: number) => void;

/**
 * A compact record of the surface-material cells a paint stroke touched: parallel
 * `indices`/`before`/`after` arrays into the per-cell surface grid. One per stroke keeps paint
 * undo history small. A cell is listed when its surface id or its blend weights changed, so
 * `before` may equal `after` for a cell whose stale blend a hard paint overwrote.
 */
export interface SurfaceDelta {
  indices: readonly number[];
  before: readonly (string | null)[];
  after: readonly (string | null)[];
  weights?: WeightDelta;
}

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

export type WeightDeltaRecorder = (index: number, before: number, after: number) => void;

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
  /** World-space extent of the cell grid; cell `(gx, gz)` spans `cols`/`rows` equal slices of it. */
  readonly gridBounds: Aabb;
  apply(edit: TerraformEdit): number;
  applyRecording(edit: TerraformEdit, record: TerraformDeltaRecorder): number;
  editDelta(edit: TerraformEdit): TerraformDelta;
  applyDelta(delta: TerraformDelta): void;
  revertDelta(delta: TerraformDelta): void;
  paintRecording(edit: TerraformEdit, record: SurfaceDeltaRecorder, recordWeight?: WeightDeltaRecorder): number;
  /**
   * Hard-paint a surface brush and return the compact delta it produced. Every hard write (paint,
   * fill, clear, auto-paint) sets the cell's surface id and, once the terrain is blended, makes the
   * painted layer weight 1 and every other layer 0 so the painted surface dominates; clearing, or
   * painting a surface outside {@link layers}, zeroes the cell's weights so the id shows through.
   */
  paintDelta(edit: TerraformEdit): SurfaceDelta;
  fillSurfaceDelta(surface: string | null): SurfaceDelta;
  autoPaintDelta(rule: TerrainSurfaceRule): SurfaceDelta;
  applySurfaceDelta(delta: SurfaceDelta): void;
  revertSurfaceDelta(delta: SurfaceDelta): void;
  readonly layers: readonly TerrainMaterialLayer[];
  setLayers(layers: readonly TerrainMaterialLayer[]): void;
  blendPaintDelta(edit: TerraformEdit): WeightDelta;
  blendRecording(edit: TerraformEdit, record: WeightDeltaRecorder): number;
  applyWeightDelta(delta: WeightDelta): void;
  revertWeightDelta(delta: WeightDelta): void;
  weightsAt(x: number, z: number): number[];
  heightOffsetAt(x: number, z: number): number;
  surfaceAt(x: number, z: number): string | null;
  reset(): void;
  snapshot(): TerraformSnapshot;
  restore(snapshot: TerraformSnapshot): void;
}

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
  let revision = 0;
  let baseRevision = base.heightRevision?.();
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
    revision += 1;
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
    const minZ = Math.max(0, Math.round(cz) - rCells);
    const maxZ = Math.min(vertsZ - 1, Math.round(cz) + rCells);
    const minX = Math.max(0, Math.round(cx) - rCells);
    const maxX = Math.min(vertsX - 1, Math.round(cx) + rCells);
    for (let gz = minZ; gz <= maxZ; gz += 1) {
      for (let gx = minX; gx <= maxX; gx += 1) {
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

  /**
   * The hard-paint weight policy: on a blended terrain, a cell written to `surface` becomes weight 1
   * on that layer and 0 on every other (all 0 when `surface` is null or not a layer, so the id shows
   * through {@link surfaceAt}). An unblended terrain keeps its lazy buffer absent.
   */
  function writeCellWeights(cell: number, surface: string | null, record: WeightDeltaRecorder | null): boolean {
    if (weights === null || layers.length === 0) return false;
    const L = layers.length;
    const base = cell * L;
    const target = surface === null ? -1 : layers.findIndex((entry) => entry.surface === surface);
    let changed = false;
    for (let l = 0; l < L; l += 1) {
      const prev = weights[base + l]!;
      const next = l === target ? 1 : 0;
      if (prev === next) continue;
      weights[base + l] = next;
      record?.(base + l, prev, next);
      changed = true;
    }
    return changed;
  }

  function writeSurface(
    index: number,
    surface: string | null,
    record: SurfaceDeltaRecorder | null,
    recordWeight: WeightDeltaRecorder | null,
  ): boolean {
    const before = surfaces[index] ?? null;
    const weightsChanged = writeCellWeights(index, surface, recordWeight);
    if (before === surface && !weightsChanged) return false;
    surfaces[index] = surface;
    record?.(index, before, surface);
    return true;
  }

  function applyWeightSlots(delta: WeightDelta, values: readonly number[]): void {
    if (delta.layerCount !== layers.length || delta.indices.length === 0) return;
    const buffer = ensureWeights();
    for (let i = 0; i < delta.indices.length; i += 1) buffer[delta.indices[i]!] = values[i]!;
  }

  function forEachBrushCell(
    edit: TerraformEdit,
    visit: (index: number, weight: number, wx: number, wz: number, dist: number) => void,
  ): void {
    const falloff = edit.falloff ?? "smooth";
    const shape = edit.shape ?? "circle";
    const rCells = Math.ceil(edit.radius / cellSize) + 1;
    const cx = gridX(edit.center[0]);
    const cz = gridZ(edit.center[1]);
    const minZ = Math.max(0, Math.floor(cz) - rCells);
    const maxZ = Math.min(rows - 1, Math.floor(cz) + rCells);
    const minX = Math.max(0, Math.floor(cx) - rCells);
    const maxX = Math.min(cols - 1, Math.floor(cx) + rCells);
    for (let gz = minZ; gz <= maxZ; gz += 1) {
      for (let gx = minX; gx <= maxX; gx += 1) {
        const wx = cellWorldX(gx);
        const wz = cellWorldZ(gz);
        const dx = wx - edit.center[0];
        const dz = wz - edit.center[1];
        const dist = shape === "square" ? Math.max(Math.abs(dx), Math.abs(dz)) : Math.hypot(dx, dz);
        visit(gz * cols + gx, brushWeight(dist, edit.radius, falloff), wx, wz, dist);
      }
    }
  }

  function paintSurface(
    edit: TerraformEdit,
    record: SurfaceDeltaRecorder | null,
    recordWeight: WeightDeltaRecorder | null,
  ): number {
    const surface = edit.surface ?? null;
    let painted = 0;
    // Binary inclusion by raw distance (includes dist == radius), independent of falloff shaping.
    forEachBrushCell(edit, (index, _weight, _wx, _wz, dist) => {
      if (dist > edit.radius) return;
      if (writeSurface(index, surface, record, recordWeight)) painted += 1;
    });
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

  function autoPaint(
    rule: TerrainSurfaceRule,
    record: SurfaceDeltaRecorder | null,
    recordWeight: WeightDeltaRecorder | null,
  ): number {
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
        if (writeSurface(gz * cols + gx, rule.surface, record, recordWeight)) painted += 1;
      }
    }
    return painted;
  }

  function fillSurface(
    surface: string | null,
    record: SurfaceDeltaRecorder | null,
    recordWeight: WeightDeltaRecorder | null,
  ): number {
    let painted = 0;
    for (let index = 0; index < surfaces.length; index += 1) {
      if (writeSurface(index, surface, record, recordWeight)) painted += 1;
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
    const strength = edit.strength ?? 1;
    let painted = 0;
    forEachBrushCell(edit, (index, weight) => {
      if (weight <= 0) return;
      if (blendCell(index, target, weight * strength, record)) painted += 1;
    });
    return painted;
  }

  function runHeightEdit(edit: TerraformEdit, record: TerraformDeltaRecorder | null): number {
    if (edit.mode === "ramp") return editRamp(edit, record);
    return editHeight(edit, record);
  }

  function surfaceDeltaFrom(run: (record: SurfaceDeltaRecorder, recordWeight: WeightDeltaRecorder) => void): SurfaceDelta {
    const indices: number[] = [];
    const before: (string | null)[] = [];
    const after: (string | null)[] = [];
    const weightIndices: number[] = [];
    const weightBefore: number[] = [];
    const weightAfter: number[] = [];
    run(
      (index, prev, next) => {
        indices.push(index);
        before.push(prev);
        after.push(next);
      },
      (index, prev, next) => {
        weightIndices.push(index);
        weightBefore.push(prev);
        weightAfter.push(next);
      },
    );
    if (weightIndices.length === 0) return { indices, before, after };
    return {
      indices,
      before,
      after,
      weights: { layerCount: layers.length, indices: weightIndices, before: weightBefore, after: weightAfter },
    };
  }

  const field: EditableTerrain = {
    cols,
    rows,
    cellSize,
    gridBounds: { minX: bounds.minX, minZ: bounds.minZ, maxX: bounds.minX + spanX, maxZ: bounds.minZ + spanZ },
    sampleHeight,
    sampleNormal,
    heightRevision() {
      const next = base.heightRevision?.();
      if (next === undefined) return undefined;
      if (next !== baseRevision) { baseRevision = next; revision += 1; }
      return revision;
    },
    ...(base.bounds === undefined ? {} : { bounds: base.bounds }),
    ...(base.waterLevel === undefined ? {} : { waterLevel: base.waterLevel }),
    apply(edit) {
      return edit.mode === "paint" ? paintSurface(edit, null, null) : runHeightEdit(edit, null);
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
      if (delta.indices.length > 0) revision += 1;
    },
    revertDelta(delta) {
      for (let i = 0; i < delta.indices.length; i += 1) offsets[delta.indices[i]!] = delta.before[i]!;
      if (delta.indices.length > 0) revision += 1;
    },
    paintRecording(edit, record, recordWeight) {
      return paintSurface(edit, record, recordWeight ?? null);
    },
    paintDelta(edit) {
      return surfaceDeltaFrom((record, recordWeight) => paintSurface(edit, record, recordWeight));
    },
    fillSurfaceDelta(surface) {
      return surfaceDeltaFrom((record, recordWeight) => fillSurface(surface, record, recordWeight));
    },
    autoPaintDelta(rule) {
      return surfaceDeltaFrom((record, recordWeight) => autoPaint(rule, record, recordWeight));
    },
    applySurfaceDelta(delta) {
      for (let i = 0; i < delta.indices.length; i += 1) surfaces[delta.indices[i]!] = delta.after[i] ?? null;
      if (delta.weights !== undefined) applyWeightSlots(delta.weights, delta.weights.after);
    },
    revertSurfaceDelta(delta) {
      for (let i = 0; i < delta.indices.length; i += 1) surfaces[delta.indices[i]!] = delta.before[i] ?? null;
      if (delta.weights !== undefined) applyWeightSlots(delta.weights, delta.weights.before);
    },
    get layers() {
      return layers;
    },
    setLayers(next) {
      const previous = layers;
      const previousWeights = weights;
      layers = next.map((layer) => ({ ...layer }));
      if (previousWeights === null || layers.length === 0) {
        weights = null;
        return;
      }
      const previousIndices = layers.map((layer) => previous.findIndex((entry) => entry.id === layer.id));
      const buffer = new Float32Array(cellCount * layers.length);
      let retained = false;
      for (let cell = 0; cell < cellCount; cell += 1) {
        let total = 0;
        for (let layer = 0; layer < layers.length; layer += 1) {
          const before = previousIndices[layer]!;
          const weight = before < 0 ? 0 : previousWeights[cell * previous.length + before]!;
          buffer[cell * layers.length + layer] = weight;
          total += weight;
        }
        if (total > 0) {
          retained = true;
          let previousTotal = 0;
          for (let layer = 0; layer < previous.length; layer += 1) previousTotal += previousWeights[cell * previous.length + layer]!;
          if (total < previousTotal) {
            for (let layer = 0; layer < layers.length; layer += 1) {
              const at = cell * layers.length + layer;
              buffer[at] = (buffer[at] ?? 0) / total;
            }
          }
        } else {
          const fallback = layers.findIndex((layer) => layer.surface === surfaces[cell]);
          if (fallback >= 0) buffer[cell * layers.length + fallback] = 1;
        }
      }
      weights = retained ? buffer : null;
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
      applyWeightSlots(delta, delta.after);
    },
    revertWeightDelta(delta) {
      applyWeightSlots(delta, delta.before);
    },
    weightsAt,
    heightOffsetAt,
    surfaceAt,
    reset() {
      offsets.fill(0);
      revision += 1;
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
      revision += 1;
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

export interface TerraformStroke {
  stamp(edit: TerraformEdit): number;
  delta(): TerraformDelta;
  isEmpty(): boolean;
}

interface StrokeChanges<T> {
  indices: number[];
  before: T[];
  after: T[];
}

function createStroke<T>(
  recordStamp: (edit: TerraformEdit, record: (index: number, before: T, after: T) => void) => number,
) {
  const tracker = createChangeTracker<T>();
  return {
    stamp: (edit: TerraformEdit): number => recordStamp(edit, tracker.record),
    changes: (): StrokeChanges<T> => tracker.changes(),
    isEmpty: tracker.isEmpty,
  };
}

function createChangeTracker<T>() {
  const first = new Map<number, T>();
  const latest = new Map<number, T>();
  return {
    record(index: number, before: T, after: T): void {
      if (!first.has(index)) first.set(index, before);
      latest.set(index, after);
    },
    changes(keep?: (index: number) => boolean): StrokeChanges<T> {
      const indices: number[] = [];
      const before: T[] = [];
      const after: T[] = [];
      for (const [index, next] of latest) {
        // Every latest key was set in `first` on the same callback, so this is always present.
        const prev = first.get(index) as T;
        if (next === prev && keep?.(index) !== true) continue;
        indices.push(index);
        before.push(prev);
        after.push(next);
      }
      return { indices, before, after };
    },
    isEmpty(): boolean {
      return latest.size === 0;
    },
  };
}

export function beginTerraformStroke(terrain: Pick<EditableTerrain, "applyRecording">): TerraformStroke {
  const stroke = createStroke<number>((edit, record) => terrain.applyRecording(edit, record));
  return {
    stamp: stroke.stamp,
    delta: () => stroke.changes(),
    isEmpty: stroke.isEmpty,
  };
}

export interface SurfaceStroke {
  stamp(edit: TerraformEdit): number;
  delta(): SurfaceDelta;
  isEmpty(): boolean;
}

export function beginSurfaceStroke(terrain: Pick<EditableTerrain, "paintRecording" | "layers">): SurfaceStroke {
  const cells = createChangeTracker<string | null>();
  const slots = createChangeTracker<number>();
  return {
    stamp: (edit) => terrain.paintRecording(edit, cells.record, slots.record),
    delta() {
      const weights = slots.changes();
      if (weights.indices.length === 0) return cells.changes();
      // layerCount is read at delta() time, guarding replay after the layer stack changed shape.
      const layerCount = terrain.layers.length;
      const weighted = new Set(weights.indices.map((slot) => Math.floor(slot / layerCount)));
      return { ...cells.changes((cell) => weighted.has(cell)), weights: { layerCount, ...weights } };
    },
    isEmpty: cells.isEmpty,
  };
}

export function applySurfaceDeltaToSnapshot(snapshot: TerraformSnapshot, delta: SurfaceDelta): TerraformSnapshot {
  const surfaces = snapshot.surfaces.slice();
  for (let i = 0; i < delta.indices.length; i += 1) surfaces[delta.indices[i]!] = delta.after[i] ?? null;
  const painted = { ...snapshot, surfaces };
  return delta.weights === undefined ? painted : applyWeightDeltaToSnapshot(painted, delta.weights);
}

export function revertSurfaceDeltaFromSnapshot(snapshot: TerraformSnapshot, delta: SurfaceDelta): TerraformSnapshot {
  const surfaces = snapshot.surfaces.slice();
  for (let i = 0; i < delta.indices.length; i += 1) surfaces[delta.indices[i]!] = delta.before[i] ?? null;
  const reverted = { ...snapshot, surfaces };
  return delta.weights === undefined ? reverted : revertWeightDeltaFromSnapshot(reverted, delta.weights);
}

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

/** @internal — undo/redo plumbing behind the `blendTerrain` command. */
export function applyWeightDeltaToSnapshot(snapshot: TerraformSnapshot, delta: WeightDelta): TerraformSnapshot {
  if (delta.layerCount !== (snapshot.layers?.length ?? 0)) return snapshot;
  const weights = materializeSnapshotWeights(snapshot);
  for (let i = 0; i < delta.indices.length; i += 1) weights[delta.indices[i]!] = delta.after[i]!;
  return { ...snapshot, weights };
}

/** @internal — undo/redo plumbing behind the `blendTerrain` command. */
export function revertWeightDeltaFromSnapshot(snapshot: TerraformSnapshot, delta: WeightDelta): TerraformSnapshot {
  if (delta.layerCount !== (snapshot.layers?.length ?? 0)) return snapshot;
  const weights = materializeSnapshotWeights(snapshot);
  for (let i = 0; i < delta.indices.length; i += 1) weights[delta.indices[i]!] = delta.before[i]!;
  return { ...snapshot, weights };
}

export interface BlendStroke {
  stamp(edit: TerraformEdit): number;
  delta(): WeightDelta;
  isEmpty(): boolean;
}

/** @internal — the stroke recorder behind the blend brush and the `blendTerrain` command. */
export function beginBlendStroke(terrain: Pick<EditableTerrain, "blendRecording" | "layers">): BlendStroke {
  const stroke = createStroke<number>((edit, record) => terrain.blendRecording(edit, record));
  return {
    stamp: stroke.stamp,
    // layerCount is read at delta() time, guarding replay after the layer stack changed shape.
    delta: () => ({ layerCount: terrain.layers.length, ...stroke.changes() }),
    isEmpty: stroke.isEmpty,
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

export function createTerrainSnapshot(config: EditableTerrainConfig): TerraformSnapshot {
  return createEditableTerrain(config).snapshot();
}

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

export function applyDeltaToSnapshot(snapshot: TerraformSnapshot, delta: TerraformDelta): TerraformSnapshot {
  const offsets = snapshot.offsets.slice();
  for (let i = 0; i < delta.indices.length; i += 1) offsets[delta.indices[i]!] = delta.after[i]!;
  return { ...snapshot, offsets };
}

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
  snapshot(): TerraformBrushState;
  restore(next: TerraformBrushState): void;
}

export interface TerraformBrushState {
  radius: number;
  strength: number;
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
    snapshot() {
      return { radius, strength };
    },
    restore(next) {
      radius = next.radius;
      strength = next.strength;
    },
  };
}
