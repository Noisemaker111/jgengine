import type { AudioEmitterHandle, Vec3 } from "./audioEngine";

/** One emitter's live key and position, written in place so a steady frame reads every source without allocating. @internal */
export interface EmitterPose {
  key: string;
  position: readonly [number, number, number];
}

/** Read side of the emitters a game declares sounds for. @internal */
export interface EmitterSources {
  /**
   * Every candidate id. Identity changes only on spawn/despawn (`ids()` in the entity and object
   * stores), so the tracker reconciles membership by comparing the array it last saw.
   */
  ids(): readonly string[];
  /** Fill `pose` for `id`; `false` when the source is gone. Called once per tracked emitter per frame, never per candidate. */
  read(id: string, pose: EmitterPose): boolean;
}

/** Retained loops for one sound map, maintained by membership and pose events instead of rebuilt per frame. @internal */
export interface EmitterTracker {
  /** Advance one frame: pick up spawned/moved/despawned emitters and write nothing when nothing moved. */
  step(): void;
  /** Live emitters, for probes and assertions. */
  count(): number;
  dispose(): void;
}

interface Entry {
  id: string;
  key: string;
  sound: string;
  handle: AudioEmitterHandle | null;
  index: number;
  x: number;
  y: number;
  z: number;
}

/**
 * Track one sound map's positional loops.
 *
 * Membership is reconciled only when `sources.ids()` returns a new array, and each frame then reads
 * just the tracked emitters — so a game with hundreds of props and a handful of sounding ones pays
 * for the handful, and a still frame allocates nothing. An emitter that gains a sounding key through
 * a rename is picked up on the next membership change, not per frame; catalog ids never change, and a
 * spawned entity already carries the name its sound map is keyed by.
 * @internal
 */
export function createEmitterTracker(options: {
  sources: EmitterSources;
  /** Read per frame so a remount or a replaced sound map takes effect without rebuilding the tracker. */
  sounds: () => Record<string, string> | undefined;
  play: (soundId: string, position: Vec3) => AudioEmitterHandle | null;
}): EmitterTracker {
  const entries: Entry[] = [];
  const byId = new Map<string, Entry>();
  const pose: EmitterPose = { key: "", position: [0, 0, 0] };
  const target: Vec3 = { x: 0, y: 0, z: 0 };
  let soundsRef: Record<string, string> | undefined;
  let idsRef: readonly string[] | null = null;
  let reconcileNext = false;

  function stopEntry(entry: Entry): void {
    entry.handle?.stop();
    entry.handle = null;
  }

  function removeAt(index: number): void {
    const entry = entries[index]!;
    stopEntry(entry);
    byId.delete(entry.id);
    const last = entries.pop()!;
    if (index < entries.length) {
      entries[index] = last;
      last.index = index;
    }
  }

  function clear(): void {
    for (let index = 0; index < entries.length; index += 1) stopEntry(entries[index]!);
    entries.length = 0;
    byId.clear();
  }

  function playAt(sound: string, x: number, y: number, z: number): AudioEmitterHandle | null {
    target.x = x;
    target.y = y;
    target.z = z;
    return options.play(sound, target);
  }

  function start(id: string, key: string, sound: string): void {
    const position = pose.position;
    const entry: Entry = {
      id,
      key,
      sound,
      handle: playAt(sound, position[0], position[1], position[2]),
      index: entries.length,
      x: position[0],
      y: position[1],
      z: position[2],
    };
    entries.push(entry);
    byId.set(id, entry);
  }

  function retune(entry: Entry, sound: string | undefined): boolean {
    if (sound === undefined) {
      removeAt(entry.index);
      return false;
    }
    entry.key = pose.key;
    if (sound !== entry.sound) {
      stopEntry(entry);
      entry.sound = sound;
      entry.handle = playAt(sound, pose.position[0], pose.position[1], pose.position[2]);
    }
    applyPose(entry);
    return true;
  }

  function applyPose(entry: Entry): void {
    const position = pose.position;
    if (position[0] === entry.x && position[1] === entry.y && position[2] === entry.z) return;
    entry.x = position[0];
    entry.y = position[1];
    entry.z = position[2];
    if (entry.handle !== null) {
      target.x = entry.x;
      target.y = entry.y;
      target.z = entry.z;
      entry.handle.setPosition(target);
    }
  }

  function reconcile(sounds: Record<string, string>): void {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]!;
      if (!options.sources.read(entry.id, pose)) removeAt(index);
    }
    for (const id of options.sources.ids()) {
      if (byId.has(id) || !options.sources.read(id, pose)) continue;
      const sound = sounds[pose.key];
      if (sound !== undefined) start(id, pose.key, sound);
    }
  }

  return {
    step() {
      const sounds = options.sounds();
      if (sounds === undefined) {
        if (entries.length > 0) clear();
        soundsRef = undefined;
        idsRef = null;
        return;
      }
      if (sounds !== soundsRef) {
        soundsRef = sounds;
        reconcileNext = true;
      }
      const ids = options.sources.ids();
      if (ids !== idsRef) {
        idsRef = ids;
        reconcileNext = true;
      }
      if (reconcileNext) {
        reconcileNext = false;
        reconcile(sounds);
      }
      // Backwards so a retune that drops an entry does not shift the ones still to visit.
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index]!;
        if (!options.sources.read(entry.id, pose)) {
          removeAt(index);
          continue;
        }
        if (pose.key !== entry.key) {
          if (!retune(entry, sounds[pose.key])) continue;
        } else {
          applyPose(entry);
        }
        // A stolen or failed voice is retried while its emitter lives, as the per-frame rebuild did.
        if (entry.handle === null) entry.handle = playAt(entry.sound, entry.x, entry.y, entry.z);
      }
    },
    count() {
      return entries.length;
    },
    dispose() {
      clear();
      soundsRef = undefined;
      idsRef = null;
    },
  };
}
