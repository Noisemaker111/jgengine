/**
 * Impact decals as data: a bounded pool of marks left where shots and blasts land (a bullet hole in
 * a wall, a scorch on the road, a splash of oil under a robot). The pool holds position, surface
 * normal, kind, size and age; it evicts the oldest mark when full and fades each one out over the
 * last seconds of its kind's life. It has no rendering: `ImpactDecals.draw` writes the live pool into
 * one mesh, so any number of decals is a single draw.
 */

export type DecalVec3 = readonly [number, number, number];

export type DecalLook = "scorch" | "hole" | "dent" | "splash" | "chip" | "crack";

export const DECAL_LOOKS: readonly DecalLook[] = ["scorch", "hole", "dent", "splash", "chip", "crack"];

export interface ImpactDecalKind {
  look: DecalLook;
  tint?: string;
  size?: number;
  /** Seconds the mark stays, fade included. */
  lifeSeconds: number;
  /** Seconds at the end of its life over which the mark fades out. Clamped to `lifeSeconds`. */
  fadeSeconds: number;
}

export type DecalSurfaceKind = "terrain" | "wall" | "object" | "entity";

/**
 * Which kind of mark each surface takes. `null` (or a missing entry) leaves no mark there.
 * - `impacts` wins first: an impact class (`"explosive"`) that always leaves its own mark.
 * - `catalog` next: a placed object's or entity's catalog id (`"bandit_barrel"`, `"car_compact"`).
 * - then the surface kind itself.
 * An `entity` mark is laid on the ground under the body that was hit, never on the moving body.
 */
export interface ImpactDecalSurfaces {
  terrain?: string | null;
  wall?: string | null;
  object?: string | null;
  entity?: string | null;
  catalog?: Readonly<Record<string, string | null>>;
  impacts?: Readonly<Record<string, string | null>>;
}

export interface ImpactDecalsConfig {
  kinds: Readonly<Record<string, ImpactDecalKind>>;
  surfaces: ImpactDecalSurfaces;
}

export interface DecalSurfaceHit {
  targetKind: DecalSurfaceKind;
  catalogId?: string | undefined;
  impact?: string | undefined;
}

/**
 * The kind of mark a hit leaves, or `null` for none: the impact class's rule, then the catalog id's,
 * then the surface kind's. An explicit `null` at an earlier step stops there (a vendor that never
 * marks, even though its surface kind would).
 *
 * @capability impact-decal-kind choose the decal a shot leaves from the impact class, the catalog id and the surface it struck
 */
export function impactDecalKindFor(surfaces: ImpactDecalSurfaces, hit: DecalSurfaceHit): string | null {
  if (hit.impact !== undefined && surfaces.impacts !== undefined && Object.hasOwn(surfaces.impacts, hit.impact)) {
    return surfaces.impacts[hit.impact] ?? null;
  }
  if (hit.catalogId !== undefined && surfaces.catalog !== undefined && Object.hasOwn(surfaces.catalog, hit.catalogId)) {
    return surfaces.catalog[hit.catalogId] ?? null;
  }
  return surfaces[hit.targetKind] ?? null;
}

export interface ImpactDecal {
  /** Monotonic: a higher `seq` was added later and draws over a lower one. */
  seq: number;
  kind: string;
  position: DecalVec3;
  normal: DecalVec3;
  /** Edge length in metres. */
  size: number;
  /** Rotation about the normal, radians, so repeated marks do not line up. */
  spin: number;
  /** Clock time the mark was laid, in the caller's seconds. */
  bornAt: number;
}

export interface ImpactDecalInput {
  kind: string;
  point: DecalVec3;
  /** The surface normal there; need not be unit length, must not be zero. */
  normal: DecalVec3;
  /** Edge length in metres before the kind's `size` scale. */
  size: number;
  /** Clock time now, in seconds. */
  at: number;
  spin?: number;
}

export interface ImpactDecalPoolOptions {
  capacity: number;
  kinds: Readonly<Record<string, ImpactDecalKind>>;
  /**
   * Metres each mark is lifted off its surface along the normal, so it never shares a depth with
   * the surface it sits on (z-fighting). Default 0.02.
   */
  surfaceOffset?: number;
  /**
   * Extra lift per overlapping layer, metres, cycling through {@link layers}: a newer mark laid over
   * an older one sits a hair in front of it. Default 0.002.
   */
  layerOffset?: number;
  layers?: number;
}

export interface ImpactDecalPool {
  readonly capacity: number;
  add(input: ImpactDecalInput): ImpactDecal | null;
  prune(now: number): number;
  list(): readonly ImpactDecal[];
  opacity(decal: ImpactDecal, now: number): number;
  fading(now: number): boolean;
  resize(capacity: number): void;
  clear(): void;
  /** Bumps whenever the set of marks changes, so a draw rewrites only then. */
  version(): number;
  kind(id: string): ImpactDecalKind | undefined;
}

function unit(v: DecalVec3): DecalVec3 | null {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (!(length > 1e-6) || !Number.isFinite(length)) return null;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * A bounded pool of impact decals. Adding past the capacity evicts the oldest mark, each mark lives
 * its kind's `lifeSeconds` and fades over the last `fadeSeconds`, and each sits a few millimetres off
 * its surface (plus a cycling layer step) so it neither z-fights the surface nor the mark beneath it.
 *
 * @capability impact-decals bounded pool of bullet holes, scorches and splashes with surface normal, kind, fade and oldest-first eviction
 */
export function createImpactDecalPool(options: ImpactDecalPoolOptions): ImpactDecalPool {
  const kinds = options.kinds;
  const surfaceOffset = options.surfaceOffset ?? 0.02;
  const layerOffset = options.layerOffset ?? 0.002;
  const layers = Math.max(1, Math.floor(options.layers ?? 4));
  let capacity = Math.max(0, Math.floor(options.capacity));
  let marks: ImpactDecal[] = [];
  let seq = 0;
  let version = 0;

  const lifeOf = (decal: ImpactDecal) => Math.max(0, kinds[decal.kind]?.lifeSeconds ?? 0);
  const fadeOf = (decal: ImpactDecal) => Math.min(lifeOf(decal), Math.max(0, kinds[decal.kind]?.fadeSeconds ?? 0));

  const pool: ImpactDecalPool = {
    get capacity() {
      return capacity;
    },
    add(input) {
      const kind = kinds[input.kind];
      if (kind === undefined || capacity === 0 || !(input.size > 0)) return null;
      const normal = unit(input.normal);
      if (normal === null) return null;
      const lift = surfaceOffset + (seq % layers) * layerOffset;
      const decal: ImpactDecal = {
        seq,
        kind: input.kind,
        position: [input.point[0] + normal[0] * lift, input.point[1] + normal[1] * lift, input.point[2] + normal[2] * lift],
        normal,
        size: input.size * (kind.size ?? 1),
        spin: input.spin ?? 0,
        bornAt: input.at,
      };
      seq += 1;
      marks.push(decal);
      if (marks.length > capacity) marks.splice(0, marks.length - capacity);
      version += 1;
      return decal;
    },
    prune(now) {
      const before = marks.length;
      marks = marks.filter((decal) => now - decal.bornAt < lifeOf(decal));
      const dropped = before - marks.length;
      if (dropped > 0) version += 1;
      return dropped;
    },
    list() {
      return marks;
    },
    opacity(decal, now) {
      const life = lifeOf(decal);
      const left = life - (now - decal.bornAt);
      if (left <= 0) return 0;
      const fade = fadeOf(decal);
      if (fade <= 0 || left >= fade) return 1;
      return left / fade;
    },
    fading(now) {
      for (const decal of marks) {
        const left = lifeOf(decal) - (now - decal.bornAt);
        if (left > 0 && left < fadeOf(decal)) return true;
      }
      return false;
    },
    resize(next) {
      capacity = Math.max(0, Math.floor(next));
      if (marks.length > capacity) {
        marks.splice(0, marks.length - capacity);
        version += 1;
      }
    },
    clear() {
      if (marks.length === 0) return;
      marks = [];
      version += 1;
    },
    version() {
      return version;
    },
    kind(id) {
      return kinds[id];
    },
  };
  return pool;
}

/**
 * The four corners of a mark's square, in the plane through its position facing along its normal,
 * rotated by its spin: written as x,y,z triples into `out` from `offset` in the order
 * bottom-left, bottom-right, top-right, top-left (counter-clockwise seen from the front).
 */
export function decalCorners(decal: Pick<ImpactDecal, "position" | "normal" | "size" | "spin">, out: Float32Array | number[], offset = 0): void {
  const [nx, ny, nz] = decal.normal;
  // Any axis not parallel to the normal seeds the tangent; up for walls, +x for floors and ceilings.
  const helper: DecalVec3 = Math.abs(ny) < 0.99 ? [0, 1, 0] : [1, 0, 0];
  // u = helper × n, v = n × u: a right-handed (u, v, n) frame.
  let ux = helper[1] * nz - helper[2] * ny;
  let uy = helper[2] * nx - helper[0] * nz;
  let uz = helper[0] * ny - helper[1] * nx;
  const ul = Math.hypot(ux, uy, uz);
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const vx = ny * uz - nz * uy;
  const vy = nz * ux - nx * uz;
  const vz = nx * uy - ny * ux;
  const c = Math.cos(decal.spin);
  const s = Math.sin(decal.spin);
  const h = decal.size / 2;
  // Spun axes, scaled to the half edge.
  const ax = (ux * c + vx * s) * h;
  const ay = (uy * c + vy * s) * h;
  const az = (uz * c + vz * s) * h;
  const bx = (vx * c - ux * s) * h;
  const by = (vy * c - uy * s) * h;
  const bz = (vz * c - uz * s) * h;
  const [px, py, pz] = decal.position;
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const;
  for (let i = 0; i < 4; i += 1) {
    const [su, sv] = corners[i]!;
    out[offset + i * 3] = px + ax * su + bx * sv;
    out[offset + i * 3 + 1] = py + ay * su + by * sv;
    out[offset + i * 3 + 2] = pz + az * su + bz * sv;
  }
}
