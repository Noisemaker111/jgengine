import { withNormal, type TerrainField } from "./terrain";
import type { WorldBounds } from "./features";

export const EMPTY_VOXEL = 0;

export interface VoxelMaterial {
  /** Cell value stored in the grid; 0 is reserved for empty. */
  id: number;
  name: string;
  /** A carve tool's strength must reach this to remove the material — hard rock resists a weak drill. Default 0 (anything digs it). */
  strength: number;
  /** Debris/harvest hint carried through to game code; the engine only tallies removed cells by id. */
  drop?: string;
}

export type VoxelMaterialTable = Readonly<Record<number, VoxelMaterial>>;

export interface VoxelVolumeConfig {
  /** Grid resolution in cells: [nx, ny, nz]. */
  dims: readonly [number, number, number];
  /** World position of the min corner of cell [0,0,0]. Default [0,0,0]. */
  origin?: readonly [number, number, number];
  /** World-space edge length of one cubic cell. Default 1. */
  scale?: number;
  /** Material id every cell starts as. Default 1 (a solid volume waiting to be dug). */
  fill?: number;
  /** Strength lookup by material id; carve honours it against a tool strength. */
  materials?: VoxelMaterialTable;
}

export interface CarveOp {
  /** Sphere centre in world coordinates. */
  center: readonly [number, number, number];
  /** Sphere radius in world units. */
  radius: number;
  /** Only cells whose material `strength` is ≤ this are removed. Default Infinity (dig anything). */
  toolStrength?: number;
}

export interface DepositOp {
  center: readonly [number, number, number];
  radius: number;
  /** Material id to fill empty cells with (Engineer platform / Astroneer terrain add). */
  material: number;
}

/**
 * A runtime-editable dense voxel grid — the carve/deposit op behind destructible dig worlds (Deep
 * Rock Galactic tunnels, Astroneer terrain). Cells hold a material id (0 = empty); `carve` clears a
 * sphere of solid cells that a tool is strong enough to break and returns how many it removed (feed
 * that to a loot roll), `deposit` fills a sphere with a material. World↔cell mapping is `origin`+`scale`.
 */
export class VoxelVolume {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly scale: number;
  readonly origin: readonly [number, number, number];
  private readonly cells: Uint16Array;
  private readonly materials: VoxelMaterialTable;
  private solidCount = 0;

  constructor(config: VoxelVolumeConfig) {
    this.nx = Math.max(1, Math.floor(config.dims[0]));
    this.ny = Math.max(1, Math.floor(config.dims[1]));
    this.nz = Math.max(1, Math.floor(config.dims[2]));
    this.scale = config.scale ?? 1;
    this.origin = config.origin ?? [0, 0, 0];
    this.materials = config.materials ?? {};
    this.cells = new Uint16Array(this.nx * this.ny * this.nz);
    const fill = config.fill ?? 1;
    if (fill !== EMPTY_VOXEL) {
      this.cells.fill(fill);
      this.solidCount = this.cells.length;
    }
  }

  get solid(): number {
    return this.solidCount;
  }

  private index(ix: number, iy: number, iz: number): number {
    return (iz * this.ny + iy) * this.nx + ix;
  }

  inBounds(ix: number, iy: number, iz: number): boolean {
    return ix >= 0 && ix < this.nx && iy >= 0 && iy < this.ny && iz >= 0 && iz < this.nz;
  }

  get(ix: number, iy: number, iz: number): number {
    if (!this.inBounds(ix, iy, iz)) return EMPTY_VOXEL;
    return this.cells[this.index(ix, iy, iz)]!;
  }

  set(ix: number, iy: number, iz: number, material: number): void {
    if (!this.inBounds(ix, iy, iz)) return;
    const at = this.index(ix, iy, iz);
    const prev = this.cells[at]!;
    if (prev === material) return;
    if (prev === EMPTY_VOXEL) this.solidCount += 1;
    else if (material === EMPTY_VOXEL) this.solidCount -= 1;
    this.cells[at] = material;
  }

  worldToCell(x: number, y: number, z: number): readonly [number, number, number] {
    return [
      Math.floor((x - this.origin[0]) / this.scale),
      Math.floor((y - this.origin[1]) / this.scale),
      Math.floor((z - this.origin[2]) / this.scale),
    ];
  }

  solidAtWorld(x: number, y: number, z: number): boolean {
    const [ix, iy, iz] = this.worldToCell(x, y, z);
    return this.get(ix, iy, iz) !== EMPTY_VOXEL;
  }

  private strengthOf(material: number): number {
    return this.materials[material]?.strength ?? 0;
  }

  private forEachCellInSphere(
    center: readonly [number, number, number],
    radius: number,
    visit: (ix: number, iy: number, iz: number) => void,
  ): void {
    const s = this.scale;
    const [cx, cy, cz] = this.worldToCell(center[0], center[1], center[2]);
    const reach = Math.ceil(radius / s) + 1;
    const r2 = radius * radius;
    for (let iz = cz - reach; iz <= cz + reach; iz += 1) {
      for (let iy = cy - reach; iy <= cy + reach; iy += 1) {
        for (let ix = cx - reach; ix <= cx + reach; ix += 1) {
          if (!this.inBounds(ix, iy, iz)) continue;
          const wx = this.origin[0] + (ix + 0.5) * s;
          const wy = this.origin[1] + (iy + 0.5) * s;
          const wz = this.origin[2] + (iz + 0.5) * s;
          const dx = wx - center[0];
          const dy = wy - center[1];
          const dz = wz - center[2];
          if (dx * dx + dy * dy + dz * dz <= r2) visit(ix, iy, iz);
        }
      }
    }
  }

  /** Clear every solid cell in the sphere the tool can break; returns the number removed. */
  carve(op: CarveOp): number {
    const tool = op.toolStrength ?? Number.POSITIVE_INFINITY;
    let removed = 0;
    this.forEachCellInSphere(op.center, op.radius, (ix, iy, iz) => {
      const m = this.get(ix, iy, iz);
      if (m === EMPTY_VOXEL) return;
      if (this.strengthOf(m) > tool) return;
      this.set(ix, iy, iz, EMPTY_VOXEL);
      removed += 1;
    });
    return removed;
  }

  /** Fill every empty cell in the sphere with `material`; returns the number filled. */
  deposit(op: DepositOp): number {
    let filled = 0;
    this.forEachCellInSphere(op.center, op.radius, (ix, iy, iz) => {
      if (this.get(ix, iy, iz) !== EMPTY_VOXEL) return;
      this.set(ix, iy, iz, op.material);
      filled += 1;
    });
    return filled;
  }
}

interface HeightEdit {
  x: number;
  z: number;
  radius: number;
  delta: number;
}

export interface CraterOp {
  /** Crater centre (x, z in world units). */
  x: number;
  z: number;
  radius: number;
  /** How deep the bowl cuts at its centre. */
  depth: number;
}

export interface MoundOp {
  x: number;
  z: number;
  radius: number;
  /** How high the mound rises at its centre. */
  height: number;
}

function bowl(t: number): number {
  const s = t * t * (3 - 2 * t);
  return s;
}

/**
 * A `TerrainField` you can write craters and mounds into at runtime — the height-field side of
 * destructible terrain (Helldivers 2 explosion craters, engineer-deposited berms). Wraps a base field
 * and layers smooth radial deformations on top, so `sampleHeight` (and therefore ground-snap,
 * collision, and the shell's terrain mesh) all read the deformed surface. `carve` digs a bowl,
 * `deposit` raises a mound.
 */
export class CarvableField implements TerrainField {
  readonly bounds?: WorldBounds;
  readonly waterLevel?: number;
  readonly sampleNormal: TerrainField["sampleNormal"];
  private readonly base: TerrainField;
  private readonly edits: HeightEdit[] = [];

  constructor(base: TerrainField) {
    this.base = base;
    if (base.bounds !== undefined) this.bounds = base.bounds;
    if (base.waterLevel !== undefined) this.waterLevel = base.waterLevel;
    this.sampleNormal = withNormal((x, z) => this.sampleHeight(x, z));
  }

  get editCount(): number {
    return this.edits.length;
  }

  sampleHeight(x: number, z: number): number {
    let h = this.base.sampleHeight(x, z);
    for (let i = 0; i < this.edits.length; i += 1) {
      const e = this.edits[i]!;
      const dx = x - e.x;
      const dz = z - e.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= e.radius) continue;
      h += e.delta * bowl(1 - d / e.radius);
    }
    return h;
  }

  carve(op: CraterOp): void {
    this.edits.push({ x: op.x, z: op.z, radius: op.radius, delta: -op.depth });
  }

  deposit(op: MoundOp): void {
    this.edits.push({ x: op.x, z: op.z, radius: op.radius, delta: op.height });
  }

  clear(): void {
    this.edits.length = 0;
  }
}

export function carvableTerrain(base: TerrainField): CarvableField {
  return new CarvableField(base);
}
