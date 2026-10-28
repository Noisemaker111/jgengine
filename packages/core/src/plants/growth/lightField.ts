import { plantExp } from "./plantMath";

const EXP_TABLE_STEPS = 256;
const EXP_TABLE_SIZE = 40 * EXP_TABLE_STEPS;

/** Relative light (0..1 of open sky) and the least-shaded direction at a point. */
export interface LightField {
  /** Clear deposited leaf area and shadow; keeps the grid. */
  clear(): void;
  /** Add leaf area (m²) at a point. */
  deposit(x: number, y: number, z: number, leafAreaM2: number): void;
  /** Propagate shadow downwards from every deposit. Call once after all deposits. */
  propagate(lowestY: number): void;
  /** Relative irradiance at a point: openSky · e^(-k · LAI above), the point's own half voxel excluded. */
  lightAt(x: number, y: number, z: number, openSky: number, extinction: number): number;
  /** Write the direction of least shadow at a point into `out` (zero when the field is flat there). */
  optimalDirection(x: number, y: number, z: number, out: Float64Array): void;
}

/**
 * Grid size and Palubicki shadow coupling for {@link createLightField}.
 * @internal
 */
export interface LightFieldOptions {
  cellM: number;
  halfWidthM: number;
  heightM: number;
  /** Leaf area per voxel to LAI coupling (1 conserves leaf area). */
  a: number;
  /** Attenuation per voxel layer the shadow travels down (1 keeps full Beer–Lambert). */
  b: number;
  /** Layers over which the shadow cone keeps widening. */
  depth: number;
}

/**
 * Palubicki-style shadow voxels in physical units. Each layer's shadow is the layer above blurred by a
 * normalised 3×3 kernel and divided by b, plus that layer's own leaf area index. A leaf therefore
 * shades a cone below it whose total weight is its full leaf area (b = 1), so the shadow value is the
 * leaf area index above a point and relative light follows Beer–Lambert. One pass over the occupied
 * box replaces a per-bud pyramid stamp.
 * @internal
 */
export function createLightField(options: LightFieldOptions): LightField {
  const cell = options.cellM;
  const nx = Math.max(3, Math.ceil((2 * options.halfWidthM) / cell));
  const nz = nx;
  const ny = Math.max(3, Math.ceil(options.heightM / cell));
  const originX = -(nx * cell) / 2;
  const originZ = -(nz * cell) / 2;
  const layer = nx * nz;
  const leaf = new Float32Array(layer * ny);
  const shadow = new Float32Array(layer * ny);
  const rowBlur = new Float32Array(layer);
  const lai = options.a / (cell * cell);
  // Beer–Lambert through a table of e^-x with linear steps: only + - * /, so still the same on every engine.
  const expTable = new Float64Array(EXP_TABLE_SIZE + 2);
  for (let i = 0; i <= EXP_TABLE_SIZE + 1; i += 1) expTable[i] = plantExp(-i / EXP_TABLE_STEPS);
  const keep = 1 / options.b;
  const third = 1 / 3;
  let minX = nx;
  let maxX = -1;
  let minZ = nz;
  let maxZ = -1;
  let maxY = -1;
  let shadowMinY = ny;
  let shadowMaxY = -1;
  let shadowMinX = 0;
  let shadowMaxX = -1;
  let shadowMinZ = 0;
  let shadowMaxZ = -1;

  const ix = (x: number): number => {
    const i = Math.floor((x - originX) / cell);
    return i < 0 ? 0 : i >= nx ? nx - 1 : i;
  };
  const iz = (z: number): number => {
    const i = Math.floor((z - originZ) / cell);
    return i < 0 ? 0 : i >= nz ? nz - 1 : i;
  };
  const iy = (y: number): number => {
    const i = Math.floor(y / cell);
    return i < 0 ? 0 : i >= ny ? ny - 1 : i;
  };

  const shadowAt = (cx: number, cy: number, cz: number): number => {
    if (cx < 0 || cx >= nx || cz < 0 || cz >= nz || cy < 0 || cy >= ny) return 0;
    return shadow[cy * layer + cz * nx + cx] ?? 0;
  };

  return {
    clear() {
      if (maxY >= 0) {
        for (let y = 0; y <= maxY; y += 1) {
          const base = y * layer;
          for (let z = minZ; z <= maxZ; z += 1) leaf.fill(0, base + z * nx + minX, base + z * nx + maxX + 1);
        }
      }
      if (shadowMaxY >= 0) {
        for (let y = shadowMinY; y <= shadowMaxY; y += 1) {
          const base = y * layer;
          for (let z = shadowMinZ; z <= shadowMaxZ; z += 1) shadow.fill(0, base + z * nx + shadowMinX, base + z * nx + shadowMaxX + 1);
        }
      }
      minX = nx;
      maxX = -1;
      minZ = nz;
      maxZ = -1;
      maxY = -1;
      shadowMaxY = -1;
      shadowMinY = ny;
    },
    deposit(x, y, z, leafAreaM2) {
      const cx = ix(x);
      const cy = iy(y);
      const cz = iz(z);
      const at = cy * layer + cz * nx + cx;
      leaf[at] = (leaf[at] ?? 0) + leafAreaM2;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cz < minZ) minZ = cz;
      if (cz > maxZ) maxZ = cz;
      if (cy > maxY) maxY = cy;
    },
    propagate(lowestY) {
      if (maxY < 0) return;
      const bottom = Math.min(maxY, iy(lowestY));
      shadowMaxY = maxY;
      shadowMinY = bottom;
      shadowMinX = Math.max(0, minX - options.depth);
      shadowMaxX = Math.min(nx - 1, maxX + options.depth);
      shadowMinZ = Math.max(0, minZ - options.depth);
      shadowMaxZ = Math.min(nz - 1, maxZ + options.depth);
      for (let y = maxY; y >= bottom; y -= 1) {
        const spread = Math.min(options.depth, maxY - y);
        const x0 = Math.max(0, minX - spread);
        const x1 = Math.min(nx - 1, maxX + spread);
        const z0 = Math.max(0, minZ - spread);
        const z1 = Math.min(nz - 1, maxZ + spread);
        const base = y * layer;
        if (y < maxY) {
          const above = base + layer;
          for (let z = z0 - 1; z <= z1 + 1; z += 1) {
            if (z < 0 || z >= nz) continue;
            const row = z * nx;
            for (let x = x0; x <= x1; x += 1) {
              const left = x > 0 ? (shadow[above + row + x - 1] ?? 0) : 0;
              const right = x < nx - 1 ? (shadow[above + row + x + 1] ?? 0) : 0;
              rowBlur[row + x] = (left + (shadow[above + row + x] ?? 0) + right) * third;
            }
          }
          for (let z = z0; z <= z1; z += 1) {
            const row = z * nx;
            for (let x = x0; x <= x1; x += 1) {
              const down = z > 0 ? (rowBlur[row - nx + x] ?? 0) : 0;
              const up = z < nz - 1 ? (rowBlur[row + nx + x] ?? 0) : 0;
              shadow[base + row + x] = (down + (rowBlur[row + x] ?? 0) + up) * third * keep + (leaf[base + row + x] ?? 0) * lai;
            }
          }
          for (let z = z0 - 1; z <= z1 + 1; z += 1) {
            if (z < 0 || z >= nz) continue;
            rowBlur.fill(0, z * nx + x0, z * nx + x1 + 1);
          }
        } else {
          for (let z = z0; z <= z1; z += 1) {
            const row = z * nx;
            for (let x = x0; x <= x1; x += 1) shadow[base + row + x] = (leaf[base + row + x] ?? 0) * lai;
          }
        }
      }
    },
    lightAt(x, y, z, openSky, extinction) {
      const cx = ix(x);
      const cy = iy(y);
      const cz = iz(z);
      if (y >= ny * cell) return openSky;
      const at = cy * layer + cz * nx + cx;
      const above = (shadow[at] ?? 0) - 0.5 * (leaf[at] ?? 0) * lai;
      if (above <= 0) return openSky;
      const depth = extinction * above * EXP_TABLE_STEPS;
      // e^-40 is below 1e-17: full shade.
      if (depth >= EXP_TABLE_SIZE) return 0;
      const at0 = Math.floor(depth);
      const t = depth - at0;
      return openSky * ((expTable[at0] ?? 0) * (1 - t) + (expTable[at0 + 1] ?? 0) * t);
    },
    optimalDirection(x, y, z, out) {
      const cx = ix(x);
      const cy = iy(y);
      const cz = iz(z);
      const gx = shadowAt(cx - 1, cy, cz) - shadowAt(cx + 1, cy, cz);
      const gy = shadowAt(cx, cy - 1, cz) - shadowAt(cx, cy + 1, cz);
      const gz = shadowAt(cx, cy, cz - 1) - shadowAt(cx, cy, cz + 1);
      const length = Math.sqrt(gx * gx + gy * gy + gz * gz);
      if (length < 1e-9) {
        out[0] = 0;
        out[1] = 0;
        out[2] = 0;
        return;
      }
      out[0] = gx / length;
      out[1] = gy / length;
      out[2] = gz / length;
    },
  };
}
