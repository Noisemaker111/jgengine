import type { Aabb, Vec2 } from "./geometry";
import { FLAT_FIELD, withNormal, type TerrainField } from "./terrain";

export type TerraformMode = "raise" | "lower" | "flatten" | "paint";
export type TerraformFalloff = "smooth" | "linear" | "none";

export interface TerraformEdit {
  mode: TerraformMode;
  center: Vec2;
  radius: number;
  strength?: number;
  target?: number;
  surface?: string;
  falloff?: TerraformFalloff;
}

export interface EditableTerrainConfig {
  bounds: Aabb;
  base?: TerrainField;
  cellSize?: number;
}

export interface TerraformSnapshot {
  bounds: Aabb;
  cellSize: number;
  cols: number;
  rows: number;
  offsets: readonly number[];
  surfaces: readonly (string | null)[];
}

export interface EditableTerrain extends TerrainField {
  apply(edit: TerraformEdit): number;
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

  function gridX(x: number): number {
    return ((x - bounds.minX) / spanX) * cols;
  }
  function gridZ(z: number): number {
    return ((z - bounds.minZ) / spanZ) * rows;
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

  function editHeight(edit: TerraformEdit): number {
    const falloff = edit.falloff ?? "smooth";
    const strength = edit.strength ?? 1;
    const target =
      edit.mode === "flatten" ? edit.target ?? sampleHeight(edit.center[0], edit.center[1]) : 0;
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
        const wx = bounds.minX + (gx / cols) * spanX;
        const wz = bounds.minZ + (gz / rows) * spanZ;
        const dist = Math.hypot(wx - edit.center[0], wz - edit.center[1]);
        const weight = brushWeight(dist, edit.radius, falloff);
        if (weight <= 0) continue;
        const index = gz * vertsX + gx;
        if (edit.mode === "raise") offsets[index]! += strength * weight;
        else if (edit.mode === "lower") offsets[index]! -= strength * weight;
        else {
          const current = base.sampleHeight(wx, wz) + offsets[index]!;
          offsets[index]! += (target - current) * weight * strength;
        }
        changed += 1;
      }
    }
    return changed;
  }

  function paintSurface(edit: TerraformEdit): number {
    const surface = edit.surface ?? null;
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
        const wx = bounds.minX + ((gx + 0.5) / cols) * spanX;
        const wz = bounds.minZ + ((gz + 0.5) / rows) * spanZ;
        if (Math.hypot(wx - edit.center[0], wz - edit.center[1]) > edit.radius) continue;
        surfaces[gz * cols + gx] = surface;
        painted += 1;
      }
    }
    return painted;
  }

  function surfaceAt(x: number, z: number): string | null {
    const gx = Math.floor(gridX(x));
    const gz = Math.floor(gridZ(z));
    if (gx < 0 || gx >= cols || gz < 0 || gz >= rows) return null;
    return surfaces[gz * cols + gx] ?? null;
  }

  const field: EditableTerrain = {
    sampleHeight,
    sampleNormal,
    ...(base.bounds === undefined ? {} : { bounds: base.bounds }),
    ...(base.waterLevel === undefined ? {} : { waterLevel: base.waterLevel }),
    apply(edit) {
      return edit.mode === "paint" ? paintSurface(edit) : editHeight(edit);
    },
    heightOffsetAt,
    surfaceAt,
    reset() {
      offsets.fill(0);
      surfaces.fill(null);
    },
    snapshot() {
      return {
        bounds: { ...bounds },
        cellSize,
        cols,
        rows,
        offsets: Array.from(offsets),
        surfaces: surfaces.slice(),
      };
    },
    restore(snapshot) {
      const count = Math.min(offsets.length, snapshot.offsets.length);
      for (let index = 0; index < count; index += 1) offsets[index] = snapshot.offsets[index]!;
      const surfaceCount = Math.min(surfaces.length, snapshot.surfaces.length);
      for (let index = 0; index < surfaceCount; index += 1) surfaces[index] = snapshot.surfaces[index] ?? null;
    },
  };
  return field;
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
