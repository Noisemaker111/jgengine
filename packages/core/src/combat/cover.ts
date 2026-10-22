import { devtools } from "../devtools/devtools";
import type { Vec3 } from "../world/geometry";

/**
 * A box of authored world geometry a body can hide behind. Structurally a `WorldSolid`, so
 * `ctx.world.solids.all()` drops in directly; a game with its own collision can pass any boxes.
 */
export interface CoverSolid {
  readonly center: readonly [number, number, number];
  readonly halfExtents: readonly [number, number, number];
  /** Yaw about `center`, radians, in the engine's `rotationY` convention. Default `0`. */
  readonly rotationY?: number;
}

/** One stand position beside authored geometry, with the face direction it hides against. */
export interface CoverPoint {
  /** Stable id from the rounded position and face, so a held point survives a rebuild. */
  readonly id: string;
  readonly position: Vec3;
  /** Unit XZ direction pointing away from the solid — the way a body leans out to shoot. */
  readonly normal: readonly [number, number];
}

/**
 * Bounded source of cover near a position: generated from authored geometry, or the game's own
 * spatial query. Called for one member at a time, never for the whole squad.
 */
export interface CoverSource {
  near(position: Vec3, radius: number, limit?: number): readonly CoverPoint[];
}

/** How cover points sit relative to the geometry that generates them. */
export interface CoverPointOptions {
  /** How far a stand point sits off the face, world units. Default `0.7`. */
  standOff?: number;
  /** Spacing of stand points along a face. Default `2`. */
  spacing?: number;
  /** Faces shorter than this get no stand points. Default `1.2`. */
  minFaceLength?: number;
  /** Most stand points per face. Default `3`. */
  maxPerFace?: number;
  /** Ground height at a stand point; omit to use the bottom of the solid. */
  yOf?: (x: number, z: number) => number;
  /** Rejects stand points that are not walkable — wire `nav.findPolygon(p) !== null`. */
  walkable?: (point: Vec3) => boolean;
}

const DEFAULT_STAND_OFF = 0.7;
const DEFAULT_SPACING = 2;
const DEFAULT_MIN_FACE = 1.2;
const DEFAULT_MAX_PER_FACE = 3;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function addFace(
  out: CoverPoint[],
  solid: CoverSolid,
  normalX: number,
  normalZ: number,
  tangentX: number,
  tangentZ: number,
  halfAlong: number,
  halfAcross: number,
  options: Required<Pick<CoverPointOptions, "standOff" | "spacing" | "minFaceLength" | "maxPerFace">> & CoverPointOptions,
): void {
  // A spot near a wall's end is not cover: a shooter at an angle sees around the corner, and a body
  // does not stand exactly on the point. Keep stand points clear of the corners by roughly one body.
  const edgeInset = Math.min(options.standOff + 0.4, halfAcross * 0.6);
  const usable = halfAcross - edgeInset;
  if (usable * 2 < options.minFaceLength || usable <= 0) return;
  const count = Math.max(1, Math.min(options.maxPerFace, Math.floor((usable * 2) / options.spacing) + 1));
  const step = count === 1 ? 0 : (usable * 2) / (count - 1);
  const faceX = solid.center[0] + normalX * halfAlong;
  const faceZ = solid.center[2] + normalZ * halfAlong;
  for (let i = 0; i < count; i += 1) {
    const offset = count === 1 ? 0 : -usable + step * i;
    const x = faceX + tangentX * offset + normalX * options.standOff;
    const z = faceZ + tangentZ * offset + normalZ * options.standOff;
    const y = options.yOf === undefined ? solid.center[1] - solid.halfExtents[1] : options.yOf(x, z);
    const point: Vec3 = [x, y, z];
    if (options.walkable !== undefined && !options.walkable(point)) continue;
    out.push({
      id: `${round(x)},${round(z)}|${round(normalX)},${round(normalZ)}`,
      position: point,
      normal: [normalX, normalZ],
    });
  }
}

/**
 * Stand points on every vertical face of the supplied boxes: one row per face, spaced along it,
 * `standOff` out from the surface. Geometry in, cover out — no authored coordinate list, so moving
 * a wall in the editor moves its cover.
 *
 * @capability cover-points-from-solids derive stand-able cover positions from authored solid boxes
 */
export function coverPointsFromSolids(solids: readonly CoverSolid[], options: CoverPointOptions = {}): CoverPoint[] {
  const resolved = {
    standOff: Math.max(0, options.standOff ?? DEFAULT_STAND_OFF),
    spacing: Math.max(0.2, options.spacing ?? DEFAULT_SPACING),
    minFaceLength: Math.max(0, options.minFaceLength ?? DEFAULT_MIN_FACE),
    maxPerFace: Math.max(1, Math.floor(options.maxPerFace ?? DEFAULT_MAX_PER_FACE)),
    ...(options.yOf === undefined ? {} : { yOf: options.yOf }),
    ...(options.walkable === undefined ? {} : { walkable: options.walkable }),
  };
  const out: CoverPoint[] = [];
  for (const solid of solids) {
    const yaw = solid.rotationY ?? 0;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    // Local +X and +Z in world XZ, matching the engine's rotationY convention.
    const ux = cos;
    const uz = -sin;
    const vx = sin;
    const vz = cos;
    const [hx, , hz] = solid.halfExtents;
    addFace(out, solid, ux, uz, vx, vz, hx, hz, resolved);
    addFace(out, solid, -ux, -uz, vx, vz, hx, hz, resolved);
    addFace(out, solid, vx, vz, ux, uz, hz, hx, resolved);
    addFace(out, solid, -vx, -vz, ux, uz, hz, hx, resolved);
  }
  return out;
}

/**
 * The `limit` nearest cover points within `radius`, nearest first, ties broken by id. A linear scan
 * of the points the field holds; the field caps how many points exist.
 *
 * @capability cover-points-near bounded nearest-cover query
 */
export function coverPointsNear(
  points: readonly CoverPoint[],
  position: Vec3,
  radius: number,
  limit = Number.POSITIVE_INFINITY,
): CoverPoint[] {
  const max = radius * radius;
  const found: { point: CoverPoint; distance: number }[] = [];
  for (const point of points) {
    const dx = point.position[0] - position[0];
    const dz = point.position[2] - position[2];
    const distance = dx * dx + dz * dz;
    if (distance <= max) found.push({ point, distance });
  }
  found.sort((a, b) => a.distance - b.distance || (a.point.id < b.point.id ? -1 : a.point.id > b.point.id ? 1 : 0));
  return found.slice(0, Math.max(0, Math.floor(limit))).map((entry) => entry.point);
}

/** Serializable cover field state: the boxes and the dials, not the derived points. */
export interface CoverFieldSnapshot {
  solids: CoverSolid[];
  standOff: number;
  spacing: number;
  minFaceLength: number;
  maxPerFace: number;
}

/** Options for {@link createCoverField}: the authored boxes, the dials, and a probe name. */
export interface CoverFieldOptions extends CoverPointOptions {
  solids: readonly CoverSolid[];
  /** Register a devtools probe under this name so the overlay shows the derived point count. */
  devtoolsName?: string;
}

/** Cover derived from authored geometry, rebuilt when the world is edited. */
export interface CoverField extends CoverSource {
  points(): readonly CoverPoint[];
  count(): number;
  /** Re-derive from a new set of boxes after an editor edit or a procedural world change. */
  rebuild(solids: readonly CoverSolid[]): void;
  retune(patch: CoverPointOptions): void;
  snapshot(): CoverFieldSnapshot;
  restore(next: CoverFieldSnapshot): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

/**
 * Cover over authored boxes: derive the stand points once, re-derive them after an edit, and answer
 * bounded nearest-cover queries. `walkable` is injected, so the seam checks the game's own ground
 * test (`nav.findPolygon(point) !== null`) instead of assuming a flat floor.
 *
 * @capability cover-field authored-geometry cover with a bounded nearest query and rebuild on edit
 */
export function createCoverField(options: CoverFieldOptions): CoverField {
  let solids = options.solids.map((solid) => ({ ...solid }));
  let tunables: CoverPointOptions = {
    ...(options.standOff === undefined ? {} : { standOff: options.standOff }),
    ...(options.spacing === undefined ? {} : { spacing: options.spacing }),
    ...(options.minFaceLength === undefined ? {} : { minFaceLength: options.minFaceLength }),
    ...(options.maxPerFace === undefined ? {} : { maxPerFace: options.maxPerFace }),
    ...(options.yOf === undefined ? {} : { yOf: options.yOf }),
    ...(options.walkable === undefined ? {} : { walkable: options.walkable }),
  };
  let derived: CoverPoint[] = [];
  let queries = 0;

  function derive(): void {
    derived = coverPointsFromSolids(solids, tunables);
  }
  derive();

  function debugLine(): string {
    return `${derived.length} points from ${solids.length} solids · ${queries} queries`;
  }

  const unregister = options.devtoolsName === undefined ? null : devtools.probes.register(options.devtoolsName, () => debugLine());

  return {
    near(position, radius, limit) {
      queries += 1;
      return coverPointsNear(derived, position, radius, limit);
    },
    points: () => derived,
    count: () => derived.length,
    rebuild(next) {
      solids = next.map((solid) => ({ ...solid }));
      derive();
    },
    retune(patch) {
      tunables = { ...tunables, ...patch };
      derive();
    },
    snapshot() {
      return {
        solids: solids.map((solid) => ({ ...solid })),
        standOff: tunables.standOff ?? DEFAULT_STAND_OFF,
        spacing: tunables.spacing ?? DEFAULT_SPACING,
        minFaceLength: tunables.minFaceLength ?? DEFAULT_MIN_FACE,
        maxPerFace: tunables.maxPerFace ?? DEFAULT_MAX_PER_FACE,
      };
    },
    restore(next) {
      solids = next.solids.map((solid) => ({ ...solid }));
      tunables = {
        ...tunables,
        standOff: next.standOff,
        spacing: next.spacing,
        minFaceLength: next.minFaceLength,
        maxPerFace: next.maxPerFace,
      };
      derive();
    },
    dispose() {
      unregister?.();
    },
  };
}

/** A remembered threat: where the member last saw it and how strongly it still believes it. */
export interface CoverThreat {
  readonly id: string;
  readonly position: Vec3;
  /** `0..1` memory confidence; a fading memory steers less. */
  readonly confidence: number;
}

/** What each term is worth when choosing cover. A role owns these numbers. */
export interface CoverWeights {
  /** Hides the stand point from remembered threats. Default `3`. */
  hidden?: number;
  /** Stands at the role's preferred fighting distance from the nearest threat. Default `1`. */
  range?: number;
  /** Stands at the role's flank angle around the threat. Default `1`. */
  flank?: number;
  /** Stays close to where the member is now. Default `0.6`. */
  near?: number;
  /** Avoids a point a squadmate already holds. Default `2`. */
  crowding?: number;
  /** Adds distance from the nearest threat — a fallback. Default `0`. */
  retreat?: number;
  /** Penalizes a point the member cannot walk to in a straight line (a detour around the obstacle). Default `1.2`. */
  path?: number;
}

/** Everything one cover decision reads: where the member is, what it believes, and its role's policy. */
export interface CoverQuery {
  position: Vec3;
  /** Radius `near()` was called with, so `near` and `retreat` can normalize. */
  radius: number;
  threats: readonly CoverThreat[];
  /** Distance from the nearest threat this role would rather fight at. */
  preferredRange: number;
  /** Angle around the threat to attack from, radians off the squad's line. Default `0`. */
  flankAngle?: number;
  /** Point the squad's line runs through, so a flank angle means the same for every member. Default `position`. */
  lineThrough?: Vec3;
  /** Ids squadmates already hold. */
  taken?: ReadonlySet<string>;
  /** True when nothing blocks the segment — the game's collision layer. */
  blocked: (from: Vec3, to: Vec3) => boolean;
  /** Ignore memories weaker than this. Default `0.05`. */
  minConfidence?: number;
  /** Only consider points hidden from at least one remembered threat. Default `false`. */
  hiddenOnly?: boolean;
  /**
   * Radius of the body a point must hide, world units: a point counts as hidden only when the body
   * standing there is out of sight, not just its centre. `0` tests the point alone. Default `0.4`.
   */
  bodyRadius?: number;
  weights?: CoverWeights;
}

/** A scored cover point, with every term visible so a probe or test can see why it won. */
export interface CoverChoice {
  readonly point: CoverPoint;
  readonly score: number;
  readonly hidden: number;
  readonly range: number;
  readonly flank: number;
  readonly near: number;
  readonly retreat: number;
  /** `1` when the straight walk to the point is blocked, so reaching it means a detour. */
  readonly path: number;
}

const DEFAULT_WEIGHTS: Required<CoverWeights> = { hidden: 3, range: 1, flank: 1, near: 0.6, crowding: 2, retreat: 0, path: 1.2 };

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function wrapAngle(angle: number): number {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function flatDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/** True when the whole body at `point` is out of sight from `threat`, not just the point's centre. */
function hiddenAt(point: Vec3, threat: Vec3, bodyRadius: number, blocked: (from: Vec3, to: Vec3) => boolean): boolean {
  if (!blocked(point, threat)) return false;
  if (bodyRadius <= 0) return true;
  const dx = threat[0] - point[0];
  const dz = threat[2] - point[2];
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return true;
  const px = (-dz / length) * bodyRadius;
  const pz = (dx / length) * bodyRadius;
  return blocked([point[0] + px, point[1], point[2] + pz], threat) && blocked([point[0] - px, point[1], point[2] - pz], threat);
}

/**
 * Score one stand point against the threats the member remembers. `hidden` is the confidence-weighted
 * share of remembered threats that cannot see the point, so a point that hides from the shooter that
 * matters scores over one that hides from a fading one. Returns `null` when nothing it can hide from
 * is worth considering.
 *
 * @capability cover-score threat-driven cover point scoring
 */
export function scoreCoverPoint(point: CoverPoint, query: CoverQuery): CoverChoice | null {
  const minConfidence = query.minConfidence ?? 0.05;
  const weights = { ...DEFAULT_WEIGHTS, ...query.weights };
  const bodyRadius = Math.max(0, query.bodyRadius ?? 0.4);
  let totalConfidence = 0;
  let hidden = 0;
  let nearest = Number.POSITIVE_INFINITY;
  let strongest: CoverThreat | null = null;
  for (const threat of query.threats) {
    if (threat.confidence < minConfidence) continue;
    totalConfidence += threat.confidence;
    if (hiddenAt(point.position, threat.position, bodyRadius, query.blocked)) hidden += threat.confidence;
    const distance = flatDistance(point.position, threat.position);
    if (distance < nearest) nearest = distance;
    if (strongest === null || threat.confidence > strongest.confidence || (threat.confidence === strongest.confidence && threat.id < strongest.id)) {
      strongest = threat;
    }
  }
  if (strongest === null || totalConfidence <= 0) return null;
  const hiddenShare = hidden / totalConfidence;
  if (query.hiddenOnly === true && hiddenShare <= 0) return null;

  const radius = Math.max(query.radius, 0.0001);
  const range = clamp01(1 - Math.abs(nearest - query.preferredRange) / Math.max(query.preferredRange, 1));
  const near = clamp01(1 - flatDistance(query.position, point.position) / radius);
  const retreat = clamp01(nearest / radius);

  let flank = 0;
  const line = query.lineThrough ?? query.position;
  const axisX = line[0] - strongest.position[0];
  const axisZ = line[2] - strongest.position[2];
  const axisLength = Math.hypot(axisX, axisZ);
  if (axisLength > 0.0001) {
    const dirX = point.position[0] - strongest.position[0];
    const dirZ = point.position[2] - strongest.position[2];
    const dirLength = Math.hypot(dirX, dirZ);
    if (dirLength > 0.0001) {
      const offset = Math.abs(wrapAngle(Math.atan2(dirX, dirZ) - Math.atan2(axisX, axisZ)));
      flank = clamp01(1 - Math.abs(offset - (query.flankAngle ?? 0)) / Math.PI);
    }
  }

  const crowding = query.taken?.has(point.id) === true ? 1 : 0;
  const path = query.blocked(query.position, point.position) ? 1 : 0;
  const score =
    weights.hidden * hiddenShare +
    weights.range * range +
    weights.flank * flank +
    weights.near * near +
    weights.retreat * retreat -
    weights.crowding * crowding -
    weights.path * path;

  return { point, score, hidden: hiddenShare, range, flank, near, retreat, path };
}

/**
 * The best of `points` under one {@link CoverQuery}, ties broken by point id. Pass the candidate set
 * the injected query already bounded; this scores what it is given.
 *
 * @capability cover-select select cover by threat, role range and flank angle
 */
export function selectCover(points: readonly CoverPoint[], query: CoverQuery): CoverChoice | null {
  let best: CoverChoice | null = null;
  for (const point of points) {
    const choice = scoreCoverPoint(point, query);
    if (choice === null) continue;
    if (best === null || choice.score > best.score || (choice.score === best.score && choice.point.id < best.point.id)) best = choice;
  }
  return best;
}
