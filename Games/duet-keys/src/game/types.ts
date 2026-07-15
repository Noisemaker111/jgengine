export interface V2 {
  readonly x: number;
  readonly z: number;
}

export type Dir = "north" | "south" | "east" | "west";
export type HeroId = "lumen" | "anchor";

export const HERO_IDS: readonly HeroId[] = ["lumen", "anchor"];

export const DIR_VECTORS: Record<Dir, V2> = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
};

export const DIR_ORDER: readonly Dir[] = ["north", "east", "south", "west"];

export function cellKey(cell: V2): string {
  return `${cell.x},${cell.z}`;
}

export function sameCell(a: V2, b: V2): boolean {
  return a.x === b.x && a.z === b.z;
}

export function addCell(cell: V2, dir: V2): V2 {
  return { x: cell.x + dir.x, z: cell.z + dir.z };
}

/** Quantize a body yaw (atan2(sinX, cosZ), 0 = +z/south) to the nearest cardinal facing. */
export function yawToDir(yaw: number): Dir {
  const x = Math.sin(yaw);
  const z = Math.cos(yaw);
  if (Math.abs(x) >= Math.abs(z)) return x >= 0 ? "east" : "west";
  return z >= 0 ? "south" : "north";
}
