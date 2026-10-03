import { Camera, Vector3 } from "three";

/** Writes a live presentation muzzle in world space; false means this rig has no muzzle available. */
export type FirstPersonMuzzleReader = (target: Vector3) => boolean;

interface MuzzleEntry {
  reader: FirstPersonMuzzleReader;
  scratch: Vector3;
  reading: boolean;
}

const MAX_READERS = 64;
const custom = new WeakMap<Camera, MuzzleEntry[]>();
const tracked = new WeakMap<Camera, MuzzleEntry[]>();
const legacyCustom: MuzzleEntry[] = [];
const legacyTracked: MuzzleEntry[] = [];

function register(
  camera: Camera,
  reader: FirstPersonMuzzleReader,
  scoped: WeakMap<Camera, MuzzleEntry[]>,
  legacy: MuzzleEntry[],
): () => void {
  const readers = scoped.get(camera) ?? [];
  if (readers.length >= MAX_READERS) throw new RangeError("Too many muzzle readers for one camera");
  const entry: MuzzleEntry = { reader, scratch: new Vector3(), reading: false };
  readers.push(entry);
  scoped.set(camera, readers);
  legacy.push(entry);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    readers.splice(readers.indexOf(entry), 1);
    legacy.splice(legacy.indexOf(entry), 1);
    if (readers.length === 0) scoped.delete(camera);
  };
}

/**
 * Register a custom rig's presentation muzzle for its Three.js camera. Newest available custom
 * reader wins over that camera's stock muzzle; call the returned cleanup on unmount.
 *
 * @capability custom-viewmodel-muzzle align tracer origins with a custom viewmodel's live muzzle without changing authoritative shots
 */
export function registerFirstPersonMuzzle(camera: Camera, reader: FirstPersonMuzzleReader): () => void {
  return register(camera, reader, custom, legacyCustom);
}

/** @internal Stock rig registration shares camera isolation and owner-scoped cleanup. */
export function registerTrackedFirstPersonMuzzle(camera: Camera, reader: FirstPersonMuzzleReader): () => void {
  return register(camera, reader, tracked, legacyTracked);
}

function read(readers: readonly MuzzleEntry[] | undefined, target: Vector3): boolean {
  if (readers === undefined) return false;
  let remaining = MAX_READERS;
  for (let i = readers.length - 1; i >= 0 && remaining-- > 0; i--) {
    const entry = readers[i]!;
    if (entry.reading) continue;
    entry.reading = true;
    try {
      if (!entry.reader(entry.scratch)) continue;
      const { x, y, z } = entry.scratch;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      target.copy(entry.scratch);
      return true;
    } finally {
      entry.reading = false;
    }
  }
  return false;
}

/** @internal Unscoped legacy reads consider the newest 64 registrations per priority. */
export function readRegisteredFirstPersonMuzzle(target: Vector3, camera?: Camera): boolean {
  return read(camera === undefined ? legacyCustom : custom.get(camera), target) ||
    read(camera === undefined ? legacyTracked : tracked.get(camera), target);
}
