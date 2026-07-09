export interface LodBand {
  maxDistance: number;
  interval: number;
}

export interface LodSchedulerConfig {
  bands: readonly LodBand[];
  beyondInterval?: number | null;
  stagger?: boolean;
}

export interface LodScheduler {
  bandIndex(distance: number): number;
  step(id: string, distance: number, dtSeconds: number): number;
  remove(id: string): void;
  clear(): void;
  size(): number;
}

const MAX_ACCUMULATED_SECONDS = 60;

function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createLodScheduler(config: LodSchedulerConfig): LodScheduler {
  const bands = [...config.bands].sort((a, b) => a.maxDistance - b.maxDistance);
  const beyondInterval = config.beyondInterval ?? null;
  const stagger = config.stagger ?? true;
  const buckets = new Map<string, number>();

  function bandIndex(distance: number): number {
    for (let i = 0; i < bands.length; i++) {
      if (distance <= bands[i]!.maxDistance) return i;
    }
    return -1;
  }

  function effectiveInterval(band: number): number | null {
    return band === -1 ? beyondInterval : bands[band]!.interval;
  }

  function phaseOffset(id: string, interval: number | null): number {
    if (interval === null || interval <= 0) return 0;
    return (hashSeed(id) / 4294967296) * interval;
  }

  return {
    bandIndex,
    step(id, distance, dtSeconds) {
      const interval = effectiveInterval(bandIndex(distance));
      let bucket = buckets.get(id);
      if (bucket === undefined) {
        bucket = stagger ? phaseOffset(id, interval) : 0;
      }
      if (dtSeconds > 0) {
        bucket = Math.min(MAX_ACCUMULATED_SECONDS, bucket + dtSeconds);
      }
      if (interval === null) {
        buckets.set(id, bucket);
        return 0;
      }
      if (interval <= 0) {
        buckets.set(id, 0);
        return bucket;
      }
      if (bucket >= interval) {
        buckets.set(id, 0);
        return bucket;
      }
      buckets.set(id, bucket);
      return 0;
    },
    remove(id) {
      buckets.delete(id);
    },
    clear() {
      buckets.clear();
    },
    size() {
      return buckets.size;
    },
  };
}
