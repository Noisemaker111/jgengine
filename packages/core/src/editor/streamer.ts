/**
 * The proximity streamer for a sharded world (#985 stage 3): a stateful scheduler that decides,
 * as the camera moves, which shards enter and leave residency. It is pure scheduling — actually
 * reading/merging the shard documents stays the caller's job (compose with
 * `@jgengine/core/editor/world`'s `loadWorldDocument` on each returned delta) — so the streamer has
 * no I/O and stays deterministic and testable. Hysteresis (`loadRadius` < `keepRadius`) stops a
 * shard on a boundary from thrashing load/unload every frame.
 */

/** The minimal shard shape the streamer schedules on — any world-manifest shard satisfies it. */
export interface StreamerShard {
  /** Stable shard id (the load/unload unit). */
  id: string;
  /** XZ footprint `[minX, minZ]`..`[maxX, maxZ]`; absent = always resident. */
  bounds?: { min: [number, number]; max: [number, number] };
  /** `"always"` keeps the shard resident regardless of distance; default `"streamed"` when bounded. */
  residency?: "always" | "streamed";
}

/** Configuration for {@link createWorldStreamer}. */
export interface WorldStreamerConfig {
  shards: readonly StreamerShard[];
  /** Load a shard when the camera comes within this distance (m) of its footprint. */
  loadRadius: number;
  /** Keep a loaded shard resident until the camera is farther than this (m) — hysteresis band. */
  keepRadius: number;
}

/** The residency change produced by one {@link WorldStreamer.update}. */
export interface StreamUpdate {
  /** Shard ids that became resident on this update. */
  load: string[];
  /** Shard ids that left residency on this update. */
  unload: string[];
  /** The full resident shard-id set after this update (sorted, stable order). */
  resident: string[];
}

/** A stateful proximity streamer over a fixed shard set. */
export interface WorldStreamer {
  /** Advances the streamer to a new camera position, returning the residency delta. */
  update(center: { x: number; z: number }): StreamUpdate;
  /** The current resident shard-id set (sorted). */
  resident(): string[];
  /** Clears all residency (next update reloads from scratch). */
  reset(): void;
}

function isAlwaysResident(shard: StreamerShard): boolean {
  return shard.residency === "always" || shard.bounds === undefined;
}

/**
 * Distance from a point to a shard's XZ footprint (0 when inside), or 0 for an always-resident shard.
 * @capability world-streaming distance from a camera to a shard footprint
 */
export function shardDistance(shard: StreamerShard, center: { x: number; z: number }): number {
  if (shard.bounds === undefined) return 0;
  const { min, max } = shard.bounds;
  const qx = Math.max(min[0], Math.min(center.x, max[0]));
  const qz = Math.max(min[1], Math.min(center.z, max[1]));
  return Math.hypot(center.x - qx, center.z - qz);
}

/**
 * Creates a proximity streamer over a world's shards. Always-resident shards are resident from the
 * first update onward; each bounded shard loads when the camera comes within `loadRadius` of its
 * footprint and unloads only once the camera passes `keepRadius` (≥ `loadRadius`, clamped up),
 * giving a hysteresis band that prevents boundary thrash. Purely spatial and deterministic; the
 * caller wires each delta to `loadWorldDocument`.
 * @capability world-streaming schedule shard load/unload by camera proximity
 */
export function createWorldStreamer(config: WorldStreamerConfig): WorldStreamer {
  const loadRadius = Math.max(0, config.loadRadius);
  const keepRadius = Math.max(loadRadius, config.keepRadius);
  const shards = [...config.shards];
  const resident = new Set<string>();

  const residentSorted = (): string[] => [...resident].sort();

  return {
    update(center) {
      const load: string[] = [];
      const unload: string[] = [];
      for (const shard of shards) {
        if (isAlwaysResident(shard)) {
          if (!resident.has(shard.id)) {
            resident.add(shard.id);
            load.push(shard.id);
          }
          continue;
        }
        const distance = shardDistance(shard, center);
        const isResident = resident.has(shard.id);
        if (!isResident && distance <= loadRadius) {
          resident.add(shard.id);
          load.push(shard.id);
        } else if (isResident && distance > keepRadius) {
          resident.delete(shard.id);
          unload.push(shard.id);
        }
      }
      return { load: load.sort(), unload: unload.sort(), resident: residentSorted() };
    },
    resident: residentSorted,
    reset() {
      resident.clear();
    },
  };
}
