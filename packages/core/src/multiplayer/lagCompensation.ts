export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PositionSample extends Vec3 {
  t: number;
}

export interface PositionHistoryConfig {
  historyMs: number;
  maxSamples?: number;
}

const DEFAULT_MAX_SAMPLES = 256;

export class PositionHistory {
  private readonly historyMs: number;
  private readonly maxSamples: number;
  private readonly tracks = new Map<string, PositionSample[]>();

  constructor(config: PositionHistoryConfig) {
    if (!(config.historyMs > 0)) {
      throw new RangeError(`historyMs must be positive, got ${config.historyMs}`);
    }
    this.historyMs = config.historyMs;
    this.maxSamples = config.maxSamples ?? DEFAULT_MAX_SAMPLES;
  }

  record(entityId: string, t: number, position: Vec3): void {
    let track = this.tracks.get(entityId);
    if (track === undefined) {
      track = [];
      this.tracks.set(entityId, track);
    }
    const sample: PositionSample = { t, x: position.x, y: position.y, z: position.z };
    const last = track[track.length - 1];
    if (last !== undefined && t <= last.t) {
      if (t === last.t) {
        track[track.length - 1] = sample;
        return;
      }
      let index = track.length;
      while (index > 0 && track[index - 1]!.t > t) index -= 1;
      track.splice(index, 0, sample);
    } else {
      track.push(sample);
    }
    this.trim(track, t);
  }

  private trim(track: PositionSample[], newest: number): void {
    const cutoff = newest - this.historyMs;
    let drop = 0;
    while (drop < track.length - 1 && track[drop]!.t < cutoff) drop += 1;
    if (drop > 0) track.splice(0, drop);
    if (track.length > this.maxSamples) {
      track.splice(0, track.length - this.maxSamples);
    }
  }

  entities(): string[] {
    return [...this.tracks.keys()];
  }

  samples(entityId: string): readonly PositionSample[] {
    return this.tracks.get(entityId) ?? [];
  }

  sampleAt(entityId: string, t: number): Vec3 | null {
    const track = this.tracks.get(entityId);
    if (track === undefined || track.length === 0) return null;
    const first = track[0]!;
    const last = track[track.length - 1]!;
    if (t <= first.t) return { x: first.x, y: first.y, z: first.z };
    if (t >= last.t) return { x: last.x, y: last.y, z: last.z };
    let lo = 0;
    let hi = track.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (track[mid]!.t <= t) lo = mid;
      else hi = mid;
    }
    const a = track[lo]!;
    const b = track[hi]!;
    const span = b.t - a.t;
    const alpha = span === 0 ? 0 : (t - a.t) / span;
    return {
      x: a.x + (b.x - a.x) * alpha,
      y: a.y + (b.y - a.y) * alpha,
      z: a.z + (b.z - a.z) * alpha,
    };
  }

  prune(now: number): void {
    for (const [entityId, track] of this.tracks) {
      this.trim(track, now);
      if (track.length === 0) this.tracks.delete(entityId);
    }
  }

  forget(entityId: string): void {
    this.tracks.delete(entityId);
  }
}

export function createPositionHistory(config: PositionHistoryConfig): PositionHistory {
  return new PositionHistory(config);
}

export function rewindTimestamp(nowMs: number, rttMs: number, interpDelayMs: number): number {
  return nowMs - rttMs / 2 - interpDelayMs;
}

export interface HitscanRay {
  origin: Vec3;
  direction: Vec3;
  maxDistance?: number;
}

export interface HitscanTarget {
  entityId: string;
  radius: number;
}

export interface HitscanHit {
  entityId: string;
  distance: number;
  point: Vec3;
}

function normalize(v: Vec3): Vec3 | null {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len === 0) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function raySphereDistance(ray: HitscanRay, center: Vec3, radius: number): number | null {
  const dir = normalize(ray.direction);
  if (dir === null) return null;
  const ox = ray.origin.x - center.x;
  const oy = ray.origin.y - center.y;
  const oz = ray.origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c > 0 && b > 0) return null;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sqrtDisc = Math.sqrt(disc);
  const tNear = -b - sqrtDisc;
  const t = tNear >= 0 ? tNear : -b + sqrtDisc;
  if (t < 0) return null;
  const maxDistance = ray.maxDistance ?? Number.POSITIVE_INFINITY;
  if (t > maxDistance) return null;
  return t;
}

export function resolveHitscan(
  history: PositionHistory,
  targets: readonly HitscanTarget[],
  ray: HitscanRay,
  atMs: number,
): HitscanHit | null {
  const dir = normalize(ray.direction);
  if (dir === null) return null;
  let best: HitscanHit | null = null;
  for (const target of targets) {
    const center = history.sampleAt(target.entityId, atMs);
    if (center === null) continue;
    const distance = raySphereDistance(ray, center, target.radius);
    if (distance === null) continue;
    if (best === null || distance < best.distance) {
      best = {
        entityId: target.entityId,
        distance,
        point: {
          x: ray.origin.x + dir.x * distance,
          y: ray.origin.y + dir.y * distance,
          z: ray.origin.z + dir.z * distance,
        },
      };
    }
  }
  return best;
}
