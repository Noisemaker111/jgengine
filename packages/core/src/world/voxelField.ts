export type VoxelCoord = readonly [number, number, number];

export type VoxelFace = "px" | "nx" | "py" | "ny" | "pz" | "nz";

export interface VoxelFieldConfig {
  chunkSize?: number;
}

export interface VoxelCell<T extends string = string> {
  x: number;
  y: number;
  z: number;
  type: T;
}

export interface VoxelHit<T extends string = string> {
  x: number;
  y: number;
  z: number;
  type: T;
  face: VoxelFace;
  adjacent: VoxelCoord;
  distance: number;
}

export interface VoxelBounds {
  min: VoxelCoord;
  max: VoxelCoord;
}

export interface VoxelFieldSummary<T extends string = string> {
  blocks: number;
  types: Record<T, number>;
  bounds: VoxelBounds | null;
}

export interface VoxelField<T extends string = string> {
  set(x: number, y: number, z: number, type: T): boolean;
  remove(x: number, y: number, z: number): boolean;
  get(x: number, y: number, z: number): T | null;
  has(x: number, y: number, z: number): boolean;
  fill(min: VoxelCoord, max: VoxelCoord, type: T): number;
  clear(): void;
  count(): number;
  cells(): IterableIterator<VoxelCell<T>>;
  bounds(): VoxelBounds | null;
  neighbors(x: number, y: number, z: number): VoxelCell<T>[];
  exposedFaces(x: number, y: number, z: number): readonly VoxelFace[];
  raycast(origin: VoxelCoord, direction: VoxelCoord, maxDistance: number): VoxelHit<T> | null;
  chunkOf(x: number, y: number, z: number): { cx: number; cy: number; cz: number };
  chunkVersion(cx: number, cy: number, cz: number): number;
  subscribe(listener: () => void): () => void;
  summary(): VoxelFieldSummary<T>;
}

export const VOXEL_FACES: readonly VoxelFace[] = ["px", "nx", "py", "ny", "pz", "nz"];

export const VOXEL_FACE_NORMALS: Record<VoxelFace, VoxelCoord> = {
  px: [1, 0, 0],
  nx: [-1, 0, 0],
  py: [0, 1, 0],
  ny: [0, -1, 0],
  pz: [0, 0, 1],
  nz: [0, 0, -1],
};

function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function entryFace(dx: number, dy: number, dz: number): VoxelFace {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const az = Math.abs(dz);
  if (ax >= ay && ax >= az && ax > 0) return dx > 0 ? "nx" : "px";
  if (az >= ay && az > 0) return dz > 0 ? "nz" : "pz";
  return dy > 0 ? "ny" : "py";
}

export function createVoxelField<T extends string = string>(config?: VoxelFieldConfig): VoxelField<T> {
  const chunkSize = config?.chunkSize ?? 16;
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("createVoxelField: chunkSize must be a positive integer");
  }

  const cells = new Map<string, VoxelCell<T>>();
  const chunkVersions = new Map<string, number>();
  const listeners = new Set<() => void>();

  function chunkOf(x: number, y: number, z: number): { cx: number; cy: number; cz: number } {
    return {
      cx: Math.floor(x / chunkSize),
      cy: Math.floor(y / chunkSize),
      cz: Math.floor(z / chunkSize),
    };
  }

  function bumpChunk(x: number, y: number, z: number): void {
    const { cx, cy, cz } = chunkOf(x, y, z);
    const key = cellKey(cx, cy, cz);
    chunkVersions.set(key, (chunkVersions.get(key) ?? 0) + 1);
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function setCell(x: number, y: number, z: number, type: T): boolean {
    const key = cellKey(x, y, z);
    const existing = cells.get(key);
    if (existing !== undefined && existing.type === type) return false;
    cells.set(key, { x, y, z, type });
    bumpChunk(x, y, z);
    return true;
  }

  function getCell(x: number, y: number, z: number): VoxelCell<T> | undefined {
    return cells.get(cellKey(x, y, z));
  }

  function computeBounds(): VoxelBounds | null {
    if (cells.size === 0) return null;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const cell of cells.values()) {
      if (cell.x < minX) minX = cell.x;
      if (cell.y < minY) minY = cell.y;
      if (cell.z < minZ) minZ = cell.z;
      if (cell.x > maxX) maxX = cell.x;
      if (cell.y > maxY) maxY = cell.y;
      if (cell.z > maxZ) maxZ = cell.z;
    }
    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
  }

  return {
    set(x, y, z, type) {
      const changed = setCell(x, y, z, type);
      if (changed) notify();
      return changed;
    },
    remove(x, y, z) {
      const removed = cells.delete(cellKey(x, y, z));
      if (removed) {
        bumpChunk(x, y, z);
        notify();
      }
      return removed;
    },
    get(x, y, z) {
      return getCell(x, y, z)?.type ?? null;
    },
    has(x, y, z) {
      return cells.has(cellKey(x, y, z));
    },
    fill(min, max, type) {
      let changed = 0;
      for (let x = min[0]; x <= max[0]; x += 1) {
        for (let y = min[1]; y <= max[1]; y += 1) {
          for (let z = min[2]; z <= max[2]; z += 1) {
            if (setCell(x, y, z, type)) changed += 1;
          }
        }
      }
      if (changed > 0) notify();
      return changed;
    },
    clear() {
      if (cells.size === 0) return;
      for (const cell of cells.values()) bumpChunk(cell.x, cell.y, cell.z);
      cells.clear();
      notify();
    },
    count() {
      return cells.size;
    },
    cells() {
      return cells.values();
    },
    bounds() {
      return computeBounds();
    },
    neighbors(x, y, z) {
      const out: VoxelCell<T>[] = [];
      for (const face of VOXEL_FACES) {
        const [nx, ny, nz] = VOXEL_FACE_NORMALS[face];
        const cell = getCell(x + nx, y + ny, z + nz);
        if (cell !== undefined) out.push(cell);
      }
      return out;
    },
    exposedFaces(x, y, z) {
      if (!cells.has(cellKey(x, y, z))) return [];
      return VOXEL_FACES.filter((face) => {
        const [nx, ny, nz] = VOXEL_FACE_NORMALS[face];
        return !cells.has(cellKey(x + nx, y + ny, z + nz));
      });
    },
    raycast(origin, direction, maxDistance) {
      const [ox, oy, oz] = origin;
      const [dx, dy, dz] = direction;

      let ix = Math.floor(ox);
      let iy = Math.floor(oy);
      let iz = Math.floor(oz);

      const startCell = getCell(ix, iy, iz);
      if (startCell !== undefined) {
        return {
          x: ix,
          y: iy,
          z: iz,
          type: startCell.type,
          face: entryFace(dx, dy, dz),
          adjacent: [ix, iy, iz],
          distance: 0,
        };
      }

      const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
      const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
      const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

      const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Number.POSITIVE_INFINITY;
      const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Number.POSITIVE_INFINITY;
      const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Number.POSITIVE_INFINITY;

      const boundary = (i: number, o: number, step: number): number => (step > 0 ? i + 1 - o : o - i);

      let tMaxX = dx !== 0 ? boundary(ix, ox, stepX) * tDeltaX : Number.POSITIVE_INFINITY;
      let tMaxY = dy !== 0 ? boundary(iy, oy, stepY) * tDeltaY : Number.POSITIVE_INFINITY;
      let tMaxZ = dz !== 0 ? boundary(iz, oz, stepZ) * tDeltaZ : Number.POSITIVE_INFINITY;

      let face: VoxelFace = "py";
      let travelled = 0;

      while (travelled <= maxDistance) {
        let px = ix;
        let py = iy;
        let pz = iz;
        if (tMaxX < tMaxY && tMaxX < tMaxZ) {
          ix += stepX;
          travelled = tMaxX;
          tMaxX += tDeltaX;
          face = stepX > 0 ? "nx" : "px";
        } else if (tMaxY < tMaxZ) {
          iy += stepY;
          travelled = tMaxY;
          tMaxY += tDeltaY;
          face = stepY > 0 ? "ny" : "py";
        } else {
          iz += stepZ;
          travelled = tMaxZ;
          tMaxZ += tDeltaZ;
          face = stepZ > 0 ? "nz" : "pz";
        }
        if (travelled > maxDistance) break;
        const cell = getCell(ix, iy, iz);
        if (cell !== undefined) {
          return {
            x: ix,
            y: iy,
            z: iz,
            type: cell.type,
            face,
            adjacent: [px, py, pz],
            distance: travelled,
          };
        }
      }

      return null;
    },
    chunkOf,
    chunkVersion(cx, cy, cz) {
      return chunkVersions.get(cellKey(cx, cy, cz)) ?? 0;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    summary() {
      const types = {} as Record<T, number>;
      for (const cell of cells.values()) {
        types[cell.type] = (types[cell.type] ?? 0) + 1;
      }
      return { blocks: cells.size, types, bounds: computeBounds() };
    },
  };
}
