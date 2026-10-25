/**
 * The scene document a generator writes, and the seeded placement every kind lays its places with.
 * The same idea id always lays out the same world.
 */

export interface Spot {
  x: number;
  z: number;
}

export type Doc = {
  markers: Record<string, unknown>[];
  volumes: Record<string, unknown>[];
  paths: Record<string, unknown>[];
  environment?: Record<string, unknown>;
};

const round = (value: number, places = 10) => Math.round(value * places) / places;

/** A seeded scene builder: random numbers, taken ground, and the document it fills. */
export class Layout {
  readonly doc: Doc = { markers: [], volumes: [], paths: [] };
  private seed: number;
  /** Ground already used: nothing else is placed inside these discs. */
  readonly taken: { x: number; z: number; r: number }[] = [];
  /** Centre lines of paths and roads, so nothing is placed on them. */
  readonly lanes: { points: Spot[]; half: number }[] = [];

  constructor(id: string) {
    this.seed = [...id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 11);
  }

  random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  between(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.random() * list.length)]!;
  }

  turn(): number {
    return round(this.random() * Math.PI * 2, 100);
  }

  /** True when a disc of radius `r` at `spot` is clear of taken ground and of every lane. */
  free(spot: Spot, r: number): boolean {
    if (!this.taken.every((other) => Math.hypot(other.x - spot.x, other.z - spot.z) >= other.r + r)) return false;
    return this.lanes.every((lane) => distanceToLine(spot, lane.points) >= lane.half + r);
  }

  take(spot: Spot, r: number): void {
    this.taken.push({ x: spot.x, z: spot.z, r });
  }

  /** A free spot `inner..outer` metres from `near` (default the origin), clear by `clearance`; it is taken. */
  place(inner: number, outer: number, clearance: number, near: Spot = { x: 0, z: 0 }, keep = true): Spot | null {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const angle = this.random() * Math.PI * 2;
      const distance = inner + this.random() * (outer - inner);
      const spot = { x: round(near.x + Math.cos(angle) * distance), z: round(near.z + Math.sin(angle) * distance) };
      if (this.free(spot, clearance)) {
        if (keep) this.take(spot, clearance);
        return spot;
      }
    }
    return null;
  }

  marker(entry: { id: string; kind: string; at: Spot; y?: number; rotationY?: number; label?: string; catalogId?: string; meta?: Record<string, unknown> }): void {
    this.doc.markers.push({
      id: entry.id,
      kind: entry.kind,
      ...(entry.catalogId === undefined ? {} : { catalogId: entry.catalogId }),
      position: { x: round(entry.at.x), y: round(entry.y ?? 0), z: round(entry.at.z) },
      ...(entry.rotationY === undefined ? {} : { rotationY: round(entry.rotationY, 100) }),
      ...(entry.label === undefined ? {} : { label: entry.label }),
      ...(entry.meta === undefined ? {} : { meta: entry.meta }),
    });
  }

  /** A path drawn on the ground; it also keeps placement off its line. */
  path(entry: { id: string; kind: string; points: Spot[]; width: number; label?: string; meta?: Record<string, unknown> }): void {
    this.lanes.push({ points: entry.points, half: entry.width / 2 + 1 });
    this.doc.paths.push({
      id: entry.id,
      kind: entry.kind,
      width: entry.width,
      points: entry.points.map((point) => ({ x: round(point.x), y: 0, z: round(point.z) })),
      ...(entry.label === undefined ? {} : { label: entry.label }),
      ...(entry.meta === undefined ? {} : { meta: entry.meta }),
    });
  }

  /**
   * A level pad: the terrain flattens across `radius`, easing back over `falloff`. It levels to the
   * ground's own height at its centre, or to `level` when given (a lake shore at the water line).
   */
  pad(id: string, at: Spot, radius: number, level?: number, falloff = 26): void {
    this.marker({ id, kind: "pad", at, y: level ?? 0, meta: { radius: round(radius), falloff, ...(level === undefined ? {} : { level }) } });
  }

  /** A gently winding line from `from` to `to`, `steps` segments long. */
  winding(from: Spot, to: Spot, steps = 8, sway = 0.12): Spot[] {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz);
    const nx = -dz / (length || 1);
    const nz = dx / (length || 1);
    const phase = this.random() * Math.PI * 2;
    const swing = length * sway * (this.random() < 0.5 ? -1 : 1);
    const points: Spot[] = [];
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const bend = Math.sin(t * Math.PI) * swing + Math.sin(t * Math.PI * 3 + phase) * length * 0.025 * Math.sin(t * Math.PI);
      points.push({ x: round(from.x + dx * t + nx * bend), z: round(from.z + dz * t + nz * bend) });
    }
    return points;
  }

  /** An irregular closed outline around `center`: a blob, not a circle. */
  blob(center: Spot, radius: number, points = 11, roughness = 0.3): Spot[] {
    const phase = this.random() * Math.PI * 2;
    return Array.from({ length: points }, (_, index) => {
      const angle = (index / points) * Math.PI * 2;
      const r = radius * (1 + roughness * (Math.sin(angle * 2 + phase) * 0.6 + (this.random() - 0.5)));
      return { x: round(center.x + Math.cos(angle) * r), z: round(center.z + Math.sin(angle) * r) };
    });
  }
}

export function distanceToLine(spot: Spot, line: readonly Spot[]): number {
  let best = Infinity;
  for (let index = 0; index < line.length - 1; index += 1) {
    const a = line[index]!;
    const b = line[index + 1]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((spot.x - a.x) * abx + (spot.z - a.z) * abz) / (abx * abx + abz * abz || 1)));
    best = Math.min(best, Math.hypot(spot.x - (a.x + abx * t), spot.z - (a.z + abz * t)));
  }
  return best;
}
