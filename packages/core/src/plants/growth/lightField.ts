import { plantExp } from "./plantMath";

const EXP_TABLE_STEPS = 256;
const EXP_TABLE_SIZE = 40 * EXP_TABLE_STEPS;
const THIRD = 1 / 3;

/** Relative light (0..1 of open sky) and the least-shaded direction at a point. */
export interface LightField {
  /** Clear deposited leaf area and shadow; keeps the grid. */
  clear(): void;
  /** Add leaf area (m²) at a point; returns the point's cell for {@link LightField.lightAtCell}. */
  deposit(x: number, y: number, z: number, leafAreaM2: number): number;
  /** Propagate shadow downwards from every deposit. Call once after all deposits. */
  propagate(lowestY: number): void;
  /** Relative irradiance at a point: openSky · e^(-k · LAI above), the point's own half voxel excluded. */
  lightAt(x: number, y: number, z: number, openSky: number, extinction: number): number;
  /** {@link LightField.lightAt} at a cell {@link LightField.deposit} returned. */
  lightAtCell(cell: number, openSky: number, extinction: number): number;
  /** Write the direction of least shadow at a point into `out` (zero when the field is flat there). */
  optimalDirection(x: number, y: number, z: number, out: Float64Array): void;
  /** Copy of the deposited leaf area and propagated shadow, with the boxes they cover. */
  snapshot(): LightFieldSnapshot;
  /** Put back a {@link snapshot} taken from a field of the same size. */
  restore(next: LightFieldSnapshot): void;
}

/** A light field's grids and the boxes they cover, as plain data. */
export interface LightFieldSnapshot {
  leaf: Float32Array;
  shadow: Float32Array;
  /** minX, maxX, minZ, maxZ, maxY, shadowMinY, shadowMaxY, shadowMinX, shadowMaxX, shadowMinZ, shadowMaxZ. */
  bounds: number[];
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
  return new ShadowVoxels(options);
}

// A class rather than closures: every plant's field shares one set of methods, so the growth loops'
// calls into it stay inlined however many plants are alive.
class ShadowVoxels implements LightField {
  private readonly cell: number;
  private readonly perCell: number;
  private readonly nx: number;
  private readonly nz: number;
  private readonly ny: number;
  private readonly originX: number;
  private readonly originZ: number;
  private readonly layer: number;
  private readonly depth: number;
  private readonly leaf: Float32Array;
  private readonly shadow: Float32Array;
  private readonly rowBlur: Float32Array;
  private readonly lai: number;
  private readonly keep: number;
  /** e^-x in linear steps, so Beer–Lambert needs only + - * / and stays the same on every engine. */
  private readonly expTable: Float64Array;
  private minX: number;
  private maxX = -1;
  private minZ: number;
  private maxZ = -1;
  private maxY = -1;
  private shadowMinY: number;
  private shadowMaxY = -1;
  private shadowMinX = 0;
  private shadowMaxX = -1;
  private shadowMinZ = 0;
  private shadowMaxZ = -1;

  constructor(options: LightFieldOptions) {
    const cell = options.cellM;
    const nx = Math.max(3, Math.ceil((2 * options.halfWidthM) / cell));
    const ny = Math.max(3, Math.ceil(options.heightM / cell));
    this.cell = cell;
    this.perCell = 1 / cell;
    this.nx = nx;
    this.nz = nx;
    this.ny = ny;
    this.originX = -(nx * cell) / 2;
    this.originZ = -(nx * cell) / 2;
    this.layer = nx * nx;
    this.depth = options.depth;
    this.leaf = new Float32Array(this.layer * ny);
    this.shadow = new Float32Array(this.layer * ny);
    this.rowBlur = new Float32Array(this.layer);
    this.lai = options.a / (cell * cell);
    this.keep = 1 / options.b;
    this.expTable = new Float64Array(EXP_TABLE_SIZE + 2);
    for (let i = 0; i <= EXP_TABLE_SIZE + 1; i += 1) this.expTable[i] = plantExp(-i / EXP_TABLE_STEPS);
    this.minX = nx;
    this.minZ = nx;
    this.shadowMinY = ny;
  }

  private ix(x: number): number {
    const i = Math.floor((x - this.originX) * this.perCell);
    return i < 0 ? 0 : i >= this.nx ? this.nx - 1 : i;
  }

  private iz(z: number): number {
    const i = Math.floor((z - this.originZ) * this.perCell);
    return i < 0 ? 0 : i >= this.nz ? this.nz - 1 : i;
  }

  private iy(y: number): number {
    const i = Math.floor(y * this.perCell);
    return i < 0 ? 0 : i >= this.ny ? this.ny - 1 : i;
  }

  private shadowAt(cx: number, cy: number, cz: number): number {
    if (cx < 0 || cx >= this.nx || cz < 0 || cz >= this.nz || cy < 0 || cy >= this.ny) return 0;
    return this.shadow[cy * this.layer + cz * this.nx + cx] ?? 0;
  }

  private lightIn(at: number, openSky: number, extinction: number): number {
    const above = (this.shadow[at] ?? 0) - 0.5 * (this.leaf[at] ?? 0) * this.lai;
    if (above <= 0) return openSky;
    const depth = extinction * above * EXP_TABLE_STEPS;
    // e^-40 is below 1e-17: full shade.
    if (depth >= EXP_TABLE_SIZE) return 0;
    const at0 = Math.floor(depth);
    const t = depth - at0;
    return openSky * ((this.expTable[at0] ?? 0) * (1 - t) + (this.expTable[at0 + 1] ?? 0) * t);
  }

  clear(): void {
    const { leaf, shadow, nx, layer } = this;
    if (this.maxY >= 0) {
      for (let y = 0; y <= this.maxY; y += 1) {
        const base = y * layer;
        for (let z = this.minZ; z <= this.maxZ; z += 1) leaf.fill(0, base + z * nx + this.minX, base + z * nx + this.maxX + 1);
      }
    }
    if (this.shadowMaxY >= 0) {
      for (let y = this.shadowMinY; y <= this.shadowMaxY; y += 1) {
        const base = y * layer;
        for (let z = this.shadowMinZ; z <= this.shadowMaxZ; z += 1) shadow.fill(0, base + z * nx + this.shadowMinX, base + z * nx + this.shadowMaxX + 1);
      }
    }
    this.minX = nx;
    this.maxX = -1;
    this.minZ = this.nz;
    this.maxZ = -1;
    this.maxY = -1;
    this.shadowMaxY = -1;
    this.shadowMinY = this.ny;
  }

  deposit(x: number, y: number, z: number, leafAreaM2: number): number {
    // The ix/iy/iz clamps written out: this runs once per leafy node every year.
    const { nx, nz, ny, perCell } = this;
    const fx = Math.floor((x - this.originX) * perCell);
    const fy = Math.floor(y * perCell);
    const fz = Math.floor((z - this.originZ) * perCell);
    const cx = fx < 0 ? 0 : fx >= nx ? nx - 1 : fx;
    const cy = fy < 0 ? 0 : fy >= ny ? ny - 1 : fy;
    const cz = fz < 0 ? 0 : fz >= nz ? nz - 1 : fz;
    const at = cy * this.layer + cz * nx + cx;
    this.leaf[at] = (this.leaf[at] ?? 0) + leafAreaM2;
    if (cx < this.minX) this.minX = cx;
    if (cx > this.maxX) this.maxX = cx;
    if (cz < this.minZ) this.minZ = cz;
    if (cz > this.maxZ) this.maxZ = cz;
    if (cy > this.maxY) this.maxY = cy;
    return y >= ny * this.cell ? -1 : at;
  }

  propagate(lowestY: number): void {
    const { maxY, minX, maxX, minZ, maxZ, nx, nz, layer, depth, shadow, leaf, rowBlur, lai, keep } = this;
    if (maxY < 0) return;
    const bottom = Math.min(maxY, this.iy(lowestY));
    this.shadowMaxY = maxY;
    this.shadowMinY = bottom;
    this.shadowMinX = Math.max(0, minX - depth);
    this.shadowMaxX = Math.min(nx - 1, maxX + depth);
    this.shadowMinZ = Math.max(0, minZ - depth);
    this.shadowMaxZ = Math.min(nz - 1, maxZ + depth);
    for (let y = maxY; y >= bottom; y -= 1) {
      const spread = Math.min(depth, maxY - y);
      const x0 = Math.max(0, minX - spread);
      const x1 = Math.min(nx - 1, maxX + spread);
      const z0 = Math.max(0, minZ - spread);
      const z1 = Math.min(nz - 1, maxZ + spread);
      const base = y * layer;
      if (y === maxY) {
        for (let z = z0; z <= z1; z += 1) {
          const row = z * nx;
          for (let x = x0; x <= x1; x += 1) shadow[base + row + x] = (leaf[base + row + x] ?? 0) * lai;
        }
        continue;
      }
      // Every rowBlur cell the second pass reads is written by the first pass of the same layer. Edge
      // cells are handled apart so the inner loops carry no bounds tests.
      const above = base + layer;
      const inner0 = x0 > 0 ? x0 : 1;
      const inner1 = x1 < nx - 1 ? x1 : nx - 2;
      for (let z = z0 - 1; z <= z1 + 1; z += 1) {
        if (z < 0 || z >= nz) continue;
        const row = z * nx;
        const from = above + row;
        if (x0 === 0) rowBlur[row] = (0 + (shadow[from] ?? 0) + (shadow[from + 1] ?? 0)) * THIRD;
        for (let x = inner0; x <= inner1; x += 1) {
          rowBlur[row + x] = ((shadow[from + x - 1] ?? 0) + (shadow[from + x] ?? 0) + (shadow[from + x + 1] ?? 0)) * THIRD;
        }
        if (x1 === nx - 1) rowBlur[row + x1] = ((shadow[from + x1 - 1] ?? 0) + (shadow[from + x1] ?? 0) + 0) * THIRD;
      }
      for (let z = z0; z <= z1; z += 1) {
        const row = z * nx;
        const at = base + row;
        if (z > 0 && z < nz - 1) {
          for (let x = x0; x <= x1; x += 1) {
            shadow[at + x] = ((rowBlur[row - nx + x] ?? 0) + (rowBlur[row + x] ?? 0) + (rowBlur[row + nx + x] ?? 0)) * THIRD * keep + (leaf[at + x] ?? 0) * lai;
          }
        } else {
          for (let x = x0; x <= x1; x += 1) {
            const down = z > 0 ? (rowBlur[row - nx + x] ?? 0) : 0;
            const up = z < nz - 1 ? (rowBlur[row + nx + x] ?? 0) : 0;
            shadow[at + x] = (down + (rowBlur[row + x] ?? 0) + up) * THIRD * keep + (leaf[at + x] ?? 0) * lai;
          }
        }
      }
    }
  }

  lightAt(x: number, y: number, z: number, openSky: number, extinction: number): number {
    const { nx, nz, ny, perCell } = this;
    if (y >= ny * this.cell) return openSky;
    const fx = Math.floor((x - this.originX) * perCell);
    const fy = Math.floor(y * perCell);
    const fz = Math.floor((z - this.originZ) * perCell);
    const cx = fx < 0 ? 0 : fx >= nx ? nx - 1 : fx;
    const cy = fy < 0 ? 0 : fy >= ny ? ny - 1 : fy;
    const cz = fz < 0 ? 0 : fz >= nz ? nz - 1 : fz;
    return this.lightIn(cy * this.layer + cz * nx + cx, openSky, extinction);
  }

  lightAtCell(at: number, openSky: number, extinction: number): number {
    return at < 0 ? openSky : this.lightIn(at, openSky, extinction);
  }

  snapshot(): LightFieldSnapshot {
    return {
      leaf: this.leaf.slice(),
      shadow: this.shadow.slice(),
      bounds: [this.minX, this.maxX, this.minZ, this.maxZ, this.maxY, this.shadowMinY, this.shadowMaxY, this.shadowMinX, this.shadowMaxX, this.shadowMinZ, this.shadowMaxZ],
    };
  }

  restore(next: LightFieldSnapshot): void {
    if (next.leaf.length !== this.leaf.length || next.shadow.length !== this.shadow.length) throw new Error("light field snapshot has a different grid size");
    this.leaf.set(next.leaf);
    this.shadow.set(next.shadow);
    const b = next.bounds;
    this.minX = b[0] ?? this.nx;
    this.maxX = b[1] ?? -1;
    this.minZ = b[2] ?? this.nz;
    this.maxZ = b[3] ?? -1;
    this.maxY = b[4] ?? -1;
    this.shadowMinY = b[5] ?? this.ny;
    this.shadowMaxY = b[6] ?? -1;
    this.shadowMinX = b[7] ?? 0;
    this.shadowMaxX = b[8] ?? -1;
    this.shadowMinZ = b[9] ?? 0;
    this.shadowMaxZ = b[10] ?? -1;
  }

  optimalDirection(x: number, y: number, z: number, out: Float64Array): void {
    const cx = this.ix(x);
    const cy = this.iy(y);
    const cz = this.iz(z);
    const gx = this.shadowAt(cx - 1, cy, cz) - this.shadowAt(cx + 1, cy, cz);
    const gy = this.shadowAt(cx, cy - 1, cz) - this.shadowAt(cx, cy + 1, cz);
    const gz = this.shadowAt(cx, cy, cz - 1) - this.shadowAt(cx, cy, cz + 1);
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
  }
}
