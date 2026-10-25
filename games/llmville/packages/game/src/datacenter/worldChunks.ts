import {
  DEFAULT_CHUNK_SIZE,
  chunkCoordAt,
  chunkKeyAt,
  chunkKeyOf,
  chunkKeysInRadius,
  parseChunkKey,
  type ChunkCoord,
} from "@jgengine/core/runtime/worldChunks";

export type { ChunkCoord };

export const WORLD_CHUNK_SIZE = DEFAULT_CHUNK_SIZE;

export const MAX_WORLD_CHUNKS_PER_QUERY = 400;

const MAX_CHUNK_AXIS_SPAN = Math.floor(Math.sqrt(MAX_WORLD_CHUNKS_PER_QUERY));

export const MAX_WORLD_CHUNK_QUERY_RADIUS = ((MAX_CHUNK_AXIS_SPAN - 2) * WORLD_CHUNK_SIZE) / 2;

export type WorldPoint = { x: number; y?: number; z: number };

function toTuple(point: WorldPoint): [number, number, number] {
  return [point.x, point.y ?? 0, point.z];
}

export function worldChunkKeyOf(coord: ChunkCoord): string {
  return chunkKeyOf(coord);
}

export function worldChunkCoordAt(point: WorldPoint): ChunkCoord {
  return chunkCoordAt(toTuple(point), WORLD_CHUNK_SIZE);
}

export function worldChunkKeyAt(point: WorldPoint): string {
  return chunkKeyAt(toTuple(point), WORLD_CHUNK_SIZE);
}

export function parseWorldChunkKey(key: string): ChunkCoord | null {
  return parseChunkKey(key);
}

export function worldChunkCenterOf(coord: ChunkCoord): { x: number; z: number } {
  return {
    x: (coord.cx + 0.5) * WORLD_CHUNK_SIZE,
    z: (coord.cz + 0.5) * WORLD_CHUNK_SIZE,
  };
}

export function worldChunkCenterOfKey(key: string): { x: number; z: number } {
  return worldChunkCenterOf(parseWorldChunkKey(key) ?? { cx: 0, cz: 0 });
}

export function clampWorldChunkQueryRadius(radius: number): number {
  if (!Number.isFinite(radius) || radius <= 0) return 0;
  return Math.min(radius, MAX_WORLD_CHUNK_QUERY_RADIUS);
}

export function worldChunkKeysInRadius(center: WorldPoint, radius: number): string[] {
  return chunkKeysInRadius(toTuple(center), clampWorldChunkQueryRadius(radius), WORLD_CHUNK_SIZE);
}

export function worldChunkNeighborhoodKeys(point: WorldPoint): string[] {
  return worldChunkNeighborhoodKeysOf(worldChunkCoordAt(point));
}

export function worldChunkNeighborhoodKeysOfKey(key: string | undefined): string[] {
  return worldChunkNeighborhoodKeysOf((key ? parseWorldChunkKey(key) : null) ?? { cx: 0, cz: 0 });
}

function worldChunkNeighborhoodKeysOf(center: ChunkCoord): string[] {
  const keys: string[] = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      keys.push(worldChunkKeyOf({ cx: center.cx + dx, cz: center.cz + dz }));
    }
  }
  return keys;
}
