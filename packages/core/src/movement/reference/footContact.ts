/**
 * A sagittal ground profile: a polyline of `[x, y]` vertices with `x` never decreasing, so a stair riser is two
 * vertices at the same `x`. Beyond the ends the first and last segments extend flat.
 */
export interface GroundProfile {
  readonly vertices: readonly (readonly [number, number])[];
}

/**
 * Level ground at height `y`.
 * @internal
 */
export function flatGround(y = 0): GroundProfile {
  return { vertices: [[-1e6, y], [1e6, y]] };
}

/**
 * Ground flat until `startX`, then a constant grade of `angle` rad (positive climbs toward +x).
 * @capability reference-slope-ground a constant-grade sagittal ground profile for the reference human
 */
export function slopeGround(angle: number, startX = 0): GroundProfile {
  return { vertices: [[-1e6, 0], [startX, 0], [startX + 1e4 * Math.cos(angle), 1e4 * Math.sin(angle)]] };
}

/**
 * Flat ground until `startX`, then `count` steps of `rise` × `going` (m), flat at the top. Negative `rise` descends.
 * @capability reference-stair-ground a stair-flight sagittal ground profile for the reference human
 */
export function stairGround(rise: number, going: number, count: number, startX = 0): GroundProfile {
  const vertices: [number, number][] = [[-1e6, 0]];
  for (let i = 0; i < count; i++) {
    const x = startX + i * going;
    vertices.push([x, i * rise], [x, (i + 1) * rise]);
  }
  vertices.push([1e6, count * rise]);
  return { vertices };
}

/**
 * Height of the walkable surface at `x` (the top of a riser at its own `x`).
 * @internal
 */
export function groundHeight(ground: GroundProfile, x: number): number {
  const v = ground.vertices;
  let best = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 1 < v.length; i++) {
    const a = v[i];
    const b = v[i + 1];
    if (a === undefined || b === undefined) continue;
    if (x < a[0] || x > b[0]) continue;
    const y = b[0] === a[0] ? Math.max(a[1], b[1]) : a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
    if (y > best) best = y;
  }
  if (best === Number.NEGATIVE_INFINITY) {
    const first = v[0];
    const last = v[v.length - 1];
    return first !== undefined && x < first[0] ? first[1] : (last?.[1] ?? 0);
  }
  return best;
}

/** Contact law parameters. */
export interface ContactParameters {
  /** Hunt–Crossley stiffness, N/m^1.5. */
  stiffness: number;
  /** Hunt–Crossley damping, s/m. */
  damping: number;
  /** Coulomb friction coefficient (static and sliding). */
  friction: number;
  /** Tangential stick spring, N/m, and its damping, N·s/m. */
  stickStiffness: number;
  stickDamping: number;
}

/**
 * Shoe sole on a hard floor. Stiffness and damping put a 1 BW load at about 7 mm of sole compression with a
 * restitution near zero, as in heel-pad and sole tests (Ackermann & van den Bogert, *J. Biomech.* 43, 2010);
 * friction 0.8 is a rubber sole on dry concrete (ASTM F1679 range 0.6–1.0).
 */
export const SHOE_ON_CONCRETE: ContactParameters = { stiffness: 1.2e6, damping: 1.5, friction: 0.8, stickStiffness: 1.5e5, stickDamping: 1.5e3 };

/** Per-point stick state: the anchor the tangential spring pulls toward, or `null` when not in contact. */
export interface ContactPointState {
  anchor: [number, number] | null;
}

const closest = new Float64Array(4);

/** Nearest point on the ground polyline to `(x, y)`, its outward normal, and whether `(x, y)` is under the surface. */
function nearestOnGround(ground: GroundProfile, x: number, y: number): number {
  const v = ground.vertices;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < v.length; i++) {
    const a = v[i];
    const b = v[i + 1];
    if (a === undefined || b === undefined) continue;
    if (x < a[0] - 1 || x > b[0] + 1) continue;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const l2 = ex * ex + ey * ey;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / l2));
    const px = a[0] + t * ex;
    const py = a[1] + t * ey;
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    if (d2 < best) {
      best = d2;
      const l = Math.sqrt(l2) || 1;
      // Outward normal of a left-to-right polyline is the left normal (−ey, ex); a riser climbing (ey > 0) faces −x.
      closest[0] = px;
      closest[1] = py;
      closest[2] = -ey / l;
      closest[3] = ex / l;
    }
  }
  return Math.sqrt(best);
}

/**
 * Contact force on a foot point at `p` moving at `v` against `ground` (world, N), written to `out`; returns the
 * normal force. Normal: Hunt–Crossley `k·d^1.5·(1 + 1.5·c·ḋ)` (K. H. Hunt and F. R. E. Crossley, *J. Appl. Mech.*
 * 42, 1975), never pulling. Tangential: a stick spring to the touchdown anchor, capped at `μ·N`; when the cap is
 * hit the anchor slides along so the point slips at the Coulomb limit.
 * @capability foot-ground-contact compliant foot-ground contact with stick-slip Coulomb friction on slopes and stairs
 */
export function footContactForce(ground: GroundProfile, params: ContactParameters, p: ArrayLike<number>, v: ArrayLike<number>, state: ContactPointState, out: Float64Array): number {
  const x = p[0] ?? 0;
  const y = p[1] ?? 0;
  out[0] = 0;
  out[1] = 0;
  const surface = groundHeight(ground, x);
  if (y >= surface && y - surface > 0.05) {
    state.anchor = null;
    return 0;
  }
  const distance = nearestOnGround(ground, x, y);
  const nx = closest[2] ?? 0;
  const ny = closest[3] ?? 1;
  const below = (x - (closest[0] ?? 0)) * nx + (y - (closest[1] ?? 0)) * ny < 0;
  if (!below) {
    state.anchor = null;
    return 0;
  }
  const depth = distance;
  const vx = v[0] ?? 0;
  const vy = v[1] ?? 0;
  const penetrationRate = -(vx * nx + vy * ny);
  const normal = Math.max(0, params.stiffness * depth ** 1.5 * (1 + 1.5 * params.damping * penetrationRate));
  if (normal === 0) {
    state.anchor = null;
    return 0;
  }
  const tx = ny;
  const ty = -nx;
  if (state.anchor === null) state.anchor = [x, y];
  const stretch = (x - state.anchor[0]) * tx + (y - state.anchor[1]) * ty;
  const slip = vx * tx + vy * ty;
  let tangential = -params.stickStiffness * stretch - params.stickDamping * slip;
  const limit = params.friction * normal;
  if (Math.abs(tangential) > limit) {
    tangential = Math.sign(tangential) * limit;
    // Slide the anchor so the spring alone holds the Coulomb force.
    const held = -tangential / params.stickStiffness;
    state.anchor = [x - held * tx, y - held * ty];
  }
  out[0] = normal * nx + tangential * tx;
  out[1] = normal * ny + tangential * ty;
  return normal;
}
