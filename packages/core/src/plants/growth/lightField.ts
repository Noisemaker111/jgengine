import { plantExp } from "./plantMath";

const EXP_TABLE_STEPS = 256;
const EXP_TABLE_SIZE = 40 * EXP_TABLE_STEPS;
const THIRD = 1 / 3;
/** Path through one cell of a side ray that climbs one cell for every two across, in cells. */
const SIDE_RAY_PATH = Math.sqrt(1.25);

/** Relative light (0..1 of open sky) and the least-shaded direction at a point. */
export interface LightField {
  /** Clear deposited leaf area and shadow; keeps the grid. */
  clear(): void;
  /** Add leaf area (m²) at a point; returns the point's cell for {@link LightField.lightAtCell}. */
  deposit(x: number, y: number, z: number, leafAreaM2: number): number;
  /**
   * Propagate shadow downwards from every deposit, and with `side` the light reaching each cell from
   * the side through the leaves in its own row. Call once after all deposits and {@link LightField.setPeriod}.
   */
  propagate(lowestY: number, side?: SideLight): void;
  /**
   * Relative irradiance at a point: openSky · e^(-k · LAI above), the point's own half voxel excluded,
   * with {@link SideLight.share} of it arriving from the side instead.
   */
  lightAt(x: number, y: number, z: number, openSky: number, extinction: number): number;
  /** {@link LightField.lightAt} at a cell {@link LightField.deposit} returned. */
  lightAtCell(cell: number, openSky: number, extinction: number): number;
  /**
   * Repeat the plant on a square grid `periodM` apart, as a stand of identical neighbours: light and
   * the least-shaded direction then sum the shadow of every copy within two spacings, and space nearer
   * a neighbour's stem than the plant's own gets no light. 0 is one plant.
   */
  setPeriod(periodM: number): void;
  /** Write the direction of least shadow at a point into `out` (zero when the field is flat there). */
  optimalDirection(x: number, y: number, z: number, out: Float64Array): void;
  /** Copy of the deposited leaf area and propagated shadow, with the boxes they cover. */
  snapshot(): LightFieldSnapshot;
  /** Put back a {@link snapshot} taken from a field of the same size. */
  restore(next: LightFieldSnapshot): void;
}

/**
 * Sky light arriving from the side. A shoot is lit through a cone of the crown above it and, for
 * `share` of its light, along the horizontal through the leaves of its own row, from four sides; in a
 * stand that row runs on into the neighbours' crowns.
 */
export interface SideLight {
  /** Share of the light that comes from the side, 0..1; 0 lights every shoot from above only. */
  share: number;
  /** Beer–Lambert extinction coefficient along the side rays. */
  extinction: number;
}

/** A light field's grids and the boxes they cover, as plain data. */
export interface LightFieldSnapshot {
  leaf: Float32Array;
  shadow: Float32Array;
  /** Leaf area along the side ray from every cell, per direction. */
  ray: Float32Array;
  /** Leaf area along the side rays started just outside the crown's box. */
  rayEntry: Float32Array;
  /**
   * minX, maxX, minZ, maxZ, maxY, shadowMinY, shadowMaxY, shadowMinX, shadowMaxX, shadowMinZ, shadowMaxZ,
   * then the side share, the side ray scale and the side box: minX, maxX, minZ, maxZ, minY, maxY.
   */
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
  /** Cells in the grid. */
  private readonly grid: number;
  private sideShare = 0;
  /** Extinction times leaf area index per unit of leaf area crossed by a side ray. */
  private sideScale = 0;
  private sideMinX = 0;
  private sideMaxX = -1;
  private sideMinZ = 0;
  private sideMaxZ = -1;
  private sideMinY = 0;
  private sideMaxY = -1;
  /** Leaf area along the side ray from every cell, per direction (+x, -x, +z, -z). */
  private readonly ray: Float32Array;
  /** Leaf area along each side ray started just outside the crown's box, per direction, layer and row. */
  private readonly rayEntry: Float32Array;
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
  /** Neighbour spacing in cells, 0 for a lone plant. */
  private period = 0;
  /** Copies of the plant on each side that fall inside the grid, at most two. */
  private images = 0;

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
    this.grid = this.layer * ny;
    this.ray = new Float32Array(4 * this.grid);
    this.rayEntry = new Float32Array(4 * ny * nx);
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

  /** Shadow at a cell from the plant and, in a stand, every neighbour copy in reach. */
  private shadowSum(cx: number, cy: number, cz: number): number {
    if (this.images === 0) return this.shadowAt(cx, cy, cz);
    const { period, images } = this;
    let sum = 0;
    for (let m = -images; m <= images; m += 1) {
      for (let k = -images; k <= images; k += 1) sum += this.shadowAt(cx + m * period, cy, cz + k * period);
    }
    return sum;
  }

  private lightIn(at: number, openSky: number, extinction: number): number {
    let shade = this.shadow[at] ?? 0;
    if (this.images > 0) {
      const cy = Math.floor(at / this.layer);
      const rest = at - cy * this.layer;
      const cz = Math.floor(rest / this.nx);
      const cx = rest - cz * this.nx;
      // Crown shyness (Putz et al. 1984): space nearer a neighbour's stem is its crown, abraded bare.
      const half = 0.5 * this.period;
      if (Math.abs(cx + 0.5 - 0.5 * this.nx) > half || Math.abs(cz + 0.5 - 0.5 * this.nz) > half) return 0;
      shade = this.shadowSum(cx, cy, cz);
    }
    const above = shade - 0.5 * (this.leaf[at] ?? 0) * this.lai;
    const fromAbove = above <= 0 ? 1 : this.expOf(extinction * above);
    const share = this.sideShare;
    if (share <= 0) return openSky * fromAbove;
    return openSky * ((1 - share) * fromAbove + share * this.sideAt(at));
  }

  /** e^-x from the table; e^-40 is below 1e-17, full shade. */
  private expOf(x: number): number {
    const depth = x * EXP_TABLE_STEPS;
    if (depth >= EXP_TABLE_SIZE) return 0;
    const at0 = Math.floor(depth);
    const t = depth - at0;
    return (this.expTable[at0] ?? 0) * (1 - t) + (this.expTable[at0 + 1] ?? 0) * t;
  }

  /**
   * Side light at a cell, 0..1 of open sky, from four sides, through the leaf area its rays cross; in
   * a stand each ray runs on through the neighbour copies until it climbs above the crowns. A cell
   * below or beside the crown is lit through whatever crowns its rays cross.
   */
  private sideAt(at: number): number {
    const { layer, nx, images, period, sideMinX: x0, sideMaxX: x1, sideMinZ: z0, sideMaxZ: z1, sideMaxY: top } = this;
    const y = Math.floor(at / layer);
    if (y > top) return 1;
    const rest = at - y * layer;
    const z = Math.floor(rest / nx);
    const x = rest - z * nx;
    const own = 0.5 * (this.leaf[at] ?? 0);
    let light = 0;
    for (let d = 0; d < 4; d += 1) {
      const along = d < 2;
      const sign = d % 2 === 0 ? 1 : -1;
      const row = along ? z : x;
      // A ray in a row the crown's box never spans crosses no leaves, here or in any neighbour.
      if (along ? row < z0 || row > z1 : row < x0 || row > x1) {
        light += 1;
        continue;
      }
      const c = along ? x : z;
      let crossed = Math.max(0, this.sidePath(d, y, c, row)) - own;
      // The m-th neighbour along this ray is this crown, met by the ray started m periods back; the
      // ray crosses neighbours until it climbs above the crowns.
      for (let m = 1; images > 0; m += 1) {
        const path = this.sidePath(d, y, c - sign * m * period, row);
        if (path < 0) break;
        crossed += path;
      }
      light += this.expOf(this.sideScale * crossed);
    }
    return 0.25 * light;
  }

  /**
   * Leaf area along side ray `d` started at cell `c` of `row` in layer `y`, start cell included, from
   * the crown box's tables; -1 once the ray first meets the box above the crown's top.
   */
  private sidePath(d: number, y: number, c: number, row: number): number {
    const { layer, nx, grid, sideMinY: bottom, sideMaxY: top } = this;
    const along = d < 2;
    const sign = d % 2 === 0 ? 1 : -1;
    const first = along ? (sign > 0 ? this.sideMinX : this.sideMaxX) : sign > 0 ? this.sideMinZ : this.sideMaxZ;
    const last = along ? (sign > 0 ? this.sideMaxX : this.sideMinX) : sign > 0 ? this.sideMaxZ : this.sideMinZ;
    let at = c;
    let layerY = y;
    // The ray climbs one layer every two cells (offset t is at layer floor(t / 2)): bring a start
    // below the box up to its bottom layer.
    if (layerY < bottom) {
      at += sign * 2 * (bottom - layerY);
      layerY = bottom;
    }
    const before = (first - at) * sign;
    if (before > 0) {
      // Starting short of the box: it meets the box's first cell `before` cells on.
      const climb = layerY + Math.floor(before / 2);
      if (climb > top) return -1;
      if (before % 2 === 1) return this.rayEntry[d * this.ny * nx + climb * nx + row] ?? 0;
      at = first;
      layerY = climb;
    }
    if ((at - last) * sign > 0) return 0;
    const cell = layerY * layer + (along ? row * nx + at : at * nx + row);
    return (this.leaf[cell] ?? 0) + (this.ray[d * grid + cell] ?? 0);
  }

  /**
   * Leaf area along the side rays from each cell of the crown's box: rays that climb one cell for
   * every two across (63° from the zenith, mid-way through the band beyond 45°), toward ±x and ±z,
   * and the same rays started just outside the box, where a neighbour's ray enters it.
   */
  private computeSide(bottom: number, side: SideLight): void {
    const { nx, nz, ny, layer, leaf, grid, ray, rayEntry } = this;
    this.sideScale = side.extinction * this.lai * SIDE_RAY_PATH;
    const x0 = Math.max(0, this.minX - 1);
    const x1 = Math.min(nx - 1, this.maxX + 1);
    const z0 = Math.max(0, this.minZ - 1);
    const z1 = Math.min(nz - 1, this.maxZ + 1);
    const top = this.maxY;
    this.sideMinX = x0;
    this.sideMaxX = x1;
    this.sideMinZ = z0;
    this.sideMaxZ = z1;
    this.sideMinY = bottom;
    this.sideMaxY = top;
    for (let y = top; y >= bottom; y -= 1) {
      const base = y * layer;
      const up = y < top;
      for (let d = 0; d < 4; d += 1) {
        const along = d < 2;
        const sign = d % 2 === 0 ? 1 : -1;
        const step = along ? sign : sign * nx;
        const first = along ? (sign > 0 ? x0 : x1) : sign > 0 ? z0 : z1;
        const last = along ? (sign > 0 ? x1 : x0) : sign > 0 ? z1 : z0;
        const plane = d * grid;
        for (let z = z0; z <= z1; z += 1) {
          for (let x = x0; x <= x1; x += 1) {
            const c = along ? x : z;
            const at = base + z * nx + x;
            // One cell on in this layer, then two on and one up, and on from there.
            const one = (c + sign - last) * sign <= 0 ? (leaf[at + step] ?? 0) : 0;
            const two = up && (c + 2 * sign - last) * sign <= 0 ? (leaf[at + layer + 2 * step] ?? 0) + (ray[plane + at + layer + 2 * step] ?? 0) : 0;
            ray[plane + at] = one + two;
          }
        }
        for (let k = along ? z0 : x0; k <= (along ? z1 : x1); k += 1) {
          const at = base + (along ? k * nx + first : first * nx + k);
          const two = up ? (leaf[at + layer + step] ?? 0) + (ray[plane + at + layer + step] ?? 0) : 0;
          rayEntry[d * ny * nx + y * nx + k] = (leaf[at] ?? 0) + two;
        }
      }
    }
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
    this.sideMaxY = -1;
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

  propagate(lowestY: number, side?: SideLight): void {
    const { maxY, minX, maxX, minZ, maxZ, nx, nz, layer, depth, shadow, leaf, rowBlur, lai, keep } = this;
    this.sideShare = side === undefined ? 0 : Math.min(1, Math.max(0, side.share));
    if (maxY < 0) return;
    const bottom = Math.min(maxY, this.iy(lowestY));
    if (side !== undefined && this.sideShare > 0) this.computeSide(bottom, side);
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
      ray: this.ray.slice(),
      rayEntry: this.rayEntry.slice(),
      bounds: [
        this.minX, this.maxX, this.minZ, this.maxZ, this.maxY, this.shadowMinY, this.shadowMaxY, this.shadowMinX, this.shadowMaxX, this.shadowMinZ, this.shadowMaxZ,
        this.sideShare, this.sideScale, this.sideMinX, this.sideMaxX, this.sideMinZ, this.sideMaxZ, this.sideMinY, this.sideMaxY,
      ],
    };
  }

  restore(next: LightFieldSnapshot): void {
    if (next.leaf.length !== this.leaf.length || next.shadow.length !== this.shadow.length || next.ray.length !== this.ray.length || next.rayEntry.length !== this.rayEntry.length) {
      throw new Error("light field snapshot has a different grid size");
    }
    this.leaf.set(next.leaf);
    this.shadow.set(next.shadow);
    this.ray.set(next.ray);
    this.rayEntry.set(next.rayEntry);
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
    this.sideShare = b[11] ?? 0;
    this.sideScale = b[12] ?? 0;
    this.sideMinX = b[13] ?? 0;
    this.sideMaxX = b[14] ?? -1;
    this.sideMinZ = b[15] ?? 0;
    this.sideMaxZ = b[16] ?? -1;
    this.sideMinY = b[17] ?? 0;
    this.sideMaxY = b[18] ?? -1;
  }

  setPeriod(periodM: number): void {
    const period = periodM > 0 ? Math.max(1, Math.round(periodM * this.perCell)) : 0;
    this.period = period;
    this.images = period === 0 ? 0 : Math.min(2, Math.floor((this.nx - 1) / period));
  }

  optimalDirection(x: number, y: number, z: number, out: Float64Array): void {
    const cx = this.ix(x);
    const cy = this.iy(y);
    const cz = this.iz(z);
    const gx = this.shadowSum(cx - 1, cy, cz) - this.shadowSum(cx + 1, cy, cz);
    const gy = this.shadowSum(cx, cy - 1, cz) - this.shadowSum(cx, cy + 1, cz);
    const gz = this.shadowSum(cx, cy, cz - 1) - this.shadowSum(cx, cy, cz + 1);
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
