import type { GameRuntimeSnapshot, RuntimeChunkRow } from "./snapshot";

/** Default edge length, in world units, of one persisted world chunk. */
export const DEFAULT_CHUNK_SIZE = 64;

/** Integer cell coordinates of a chunk on the ground plane. */
export type ChunkCoord = { cx: number; cz: number };

/**
 * Chunk key for a cell — the canonical `"cx,cz"` string a `jgWorldChunks` row is stored under.
 * Games used to invent this mapping each time, which made two systems in one game disagree about
 * which row a position belongs to.
 * @capability world-chunk-key map world positions to persisted chunk keys at a declared cell size
 */
export function chunkKeyOf(coord: ChunkCoord): string {
  return `${coord.cx},${coord.cz}`;
}

/** Chunk coordinates containing a world position at `size` units per cell. */
export function chunkCoordAt(
  position: readonly [number, number, number],
  size: number = DEFAULT_CHUNK_SIZE,
): ChunkCoord {
  return { cx: Math.floor(position[0] / size), cz: Math.floor(position[2] / size) };
}

/** Chunk key containing a world position at `size` units per cell. */
export function chunkKeyAt(
  position: readonly [number, number, number],
  size: number = DEFAULT_CHUNK_SIZE,
): string {
  return chunkKeyOf(chunkCoordAt(position, size));
}

/** Parse a `chunkKeyOf` string back to coordinates; `null` for anything not in that form. */
export function parseChunkKey(key: string): ChunkCoord | null {
  const [rawX, rawZ, ...rest] = key.split(",");
  if (rest.length > 0 || rawX === undefined || rawZ === undefined) return null;
  const cx = Number(rawX);
  const cz = Number(rawZ);
  if (!Number.isInteger(cx) || !Number.isInteger(cz)) return null;
  return { cx, cz };
}

/**
 * Every chunk key whose cell intersects a radius around a world position — the key list a viewer's
 * bounded hydration or client chunk query asks for, instead of loading a whole world.
 */
export function chunkKeysInRadius(
  center: readonly [number, number, number],
  radius: number,
  size: number = DEFAULT_CHUNK_SIZE,
): string[] {
  const min = chunkCoordAt([center[0] - radius, center[1], center[2] - radius], size);
  const max = chunkCoordAt([center[0] + radius, center[1], center[2] + radius], size);
  const keys: string[] = [];
  for (let cx = min.cx; cx <= max.cx; cx += 1) {
    for (let cz = min.cz; cz <= max.cz; cz += 1) keys.push(chunkKeyOf({ cx, cz }));
  }
  return keys;
}

/** An empty chunk row for `chunkKey` — the starting value for a cell nothing has been placed in yet. */
export function createEmptyChunkRow(chunkKey: string): RuntimeChunkRow {
  return { chunkKey, objects: [], entities: [] };
}

function withChunkDirty(snapshot: GameRuntimeSnapshot, chunkKey: string): string[] {
  return snapshot.dirty.chunks.includes(chunkKey)
    ? snapshot.dirty.chunks
    : [...snapshot.dirty.chunks, chunkKey];
}

/**
 * Write a chunk into a snapshot and mark it dirty, so the next persist actually stores it.
 * The engine never writes `dirty.chunks` for a raw `snapshot.chunks[key] = …` assignment, so a command
 * that mutated the map by hand silently never saved that chunk.
 * @capability world-chunk-write mutate a snapshot's chunk and have the host persist it
 */
export function setChunk(
  snapshot: GameRuntimeSnapshot,
  chunkKey: string,
  chunk: RuntimeChunkRow,
): GameRuntimeSnapshot {
  return {
    ...snapshot,
    chunks: { ...snapshot.chunks, [chunkKey]: { ...chunk, chunkKey } },
    revision: snapshot.revision + 1,
    dirty: { ...snapshot.dirty, server: true, chunks: withChunkDirty(snapshot, chunkKey) },
  };
}

/** Read-modify-write a chunk (creating it empty when absent), marking it dirty. */
export function updateChunk(
  snapshot: GameRuntimeSnapshot,
  chunkKey: string,
  update: (chunk: RuntimeChunkRow) => RuntimeChunkRow,
): GameRuntimeSnapshot {
  const current = snapshot.chunks[chunkKey] ?? createEmptyChunkRow(chunkKey);
  return setChunk(snapshot, chunkKey, update(current));
}

/** Drop a chunk from a snapshot and mark the key dirty so the host deletes its stored row. */
export function deleteChunk(snapshot: GameRuntimeSnapshot, chunkKey: string): GameRuntimeSnapshot {
  const chunks = { ...snapshot.chunks };
  delete chunks[chunkKey];
  return {
    ...snapshot,
    chunks,
    revision: snapshot.revision + 1,
    dirty: { ...snapshot.dirty, server: true, chunks: withChunkDirty(snapshot, chunkKey) },
  };
}

/** Square chunk neighborhood around a world position, including its own chunk. */
export function chunkKeysAround(
  position: readonly [number, number, number],
  rings = 1,
  size = DEFAULT_CHUNK_SIZE,
): string[] {
  if (!Number.isSafeInteger(rings) || rings < 0 || rings > 128) throw new RangeError("rings must be an integer from 0 to 128");
  if (!Number.isFinite(size) || size <= 0 || !position.every(Number.isFinite)) throw new RangeError("Invalid chunk position or size");
  const center = chunkCoordAt(position, size);
  const keys: string[] = [];
  for (let cx = center.cx - rings; cx <= center.cx + rings; cx++) {
    for (let cz = center.cz - rings; cz <= center.cz + rings; cz++) keys.push(chunkKeyOf({ cx, cz }));
  }
  return keys;
}
