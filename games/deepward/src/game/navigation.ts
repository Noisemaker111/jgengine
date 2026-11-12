import type { NavMeshLink } from "@jgengine/core/nav/navMesh";
import { navAreaAt, navAuthoringFromDocument } from "@jgengine/core/nav/navAuthoring";
import { createNavRuntime, type NavRuntime } from "@jgengine/core/nav/navRuntime";
import { navTileFromGrid } from "@jgengine/core/nav/navTiles";
import { editorLayers, groundDistance, walkable, WORLD_BOUNDS, type Place, type Point } from "../world";

/** Route mesh sampling, metres. */
const CELL = 0.25;
/** The route mesh stays this far further off walls than a body needs, so a smoothed corner never grazes one. */
const MESH_MARGIN = 0.15;
const BODY = 0.28;
/** How high a print arcs over a gap it leaps, at the middle of the leap, metres. */
const LEAP_HEIGHT = 1.1;

/** Routes use the same authored footprints and actor clearance as locomotion. */
export function traversable(from: Point, to: Point, place: Place): boolean {
  const steps = Math.max(1, Math.ceil(groundDistance(from, to) / 0.12));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!walkable(from[0] + (to[0] - from[0]) * t, from[2] + (to[2] - from[2]) * t, place)) return false;
  }
  return true;
}

/**
 * Each floor's route mesh: the engine's grid tile builder over the authored room and machinery
 * footprints, with the scene's `nav_area` volumes applied and its `nav_link` paths (the leaps across
 * the Wells' open water) resolved onto it. Nav objects belong to the floor their `meta.place` names.
 */
const navs = new Map<Place, NavRuntime>();
function nav(place: Place): NavRuntime {
  const cached = navs.get(place);
  if (cached) return cached;
  const authored = navAuthoringFromDocument(editorLayers, (object) => (object.meta?.["place"] ?? "vault") === place);
  if (authored.issues.length > 0) throw new Error(`Deepward nav authoring is malformed: ${authored.issues.map((issue) => `${issue.id} (${issue.message})`).join(", ")}`);
  const mesh = navTileFromGrid({
    bounds: { min: [WORLD_BOUNDS.minX, WORLD_BOUNDS.minZ], max: [WORLD_BOUNDS.maxX, WORLD_BOUNDS.maxZ] },
    cellSize: CELL,
    areaAt: (x, z) => navAreaAt(authored.areas, x, z, walkable(x, z, place, BODY + MESH_MARGIN) ? 0 : null),
  });
  const runtime = createNavRuntime({ mesh, links: authored.links, maxNodes: 8192 });
  if (runtime.unresolvedLinks().length > 0) throw new Error(`Deepward nav links miss the ${place} floor: ${runtime.unresolvedLinks().join(", ")}`);
  navs.set(place, runtime);
  return runtime;
}

/** Build a floor's route mesh now (tens of milliseconds), at the arrival rather than on a creature's first step. */
export function warmRoutes(place: Place): void { nav(place); }

/** One leg of a route: walk to `to`, or cross `link` to it. */
export interface Leg { to: Point; link: NavMeshLink | null }

/** A body can stand here and step onto the route mesh without crossing a wall. */
function onFloor(point: Point, place: Place): boolean {
  const snap = nav(place).closestPoint([point[0], 0, point[2]]);
  return snap !== null && traversable(point, [snap[0], 0, snap[2]], place);
}

/** Empty means unreachable. Legs that cross an authored link carry it, so the walker can leap. */
function planLegs(from: Point, to: Point, place: Place): Leg[] {
  if (traversable(from, to, place)) return [{ to, link: null }];
  // Both ends must already stand on this floor. Letting the pathfinder snap a goal would route
  // across a wall or from the home floor to the vault, which is not a walk the fitter can take.
  if (!onFloor(from, place) || !onFloor(to, place)) return [];
  const path = nav(place).plan([from[0], 0, from[2]], [to[0], 0, to[2]]);
  if (path === null || path.partial === true || path.points.length === 0) return [];
  const crossing = new Map<number, NavMeshLink>();
  for (const step of path.links ?? []) if (step.end > step.start) crossing.set(step.end, step.link);
  const legs: Leg[] = [];
  for (let i = 1; i < path.points.length; i++) {
    const point = path.points[i]!;
    legs.push({ to: [point[0], 0, point[2]], link: crossing.get(i) ?? null });
  }
  if (legs.length === 0) return [{ to, link: null }];
  // The path ends on the mesh; the caller asked for the exact spot.
  const last = legs[legs.length - 1]!;
  if (last.link === null) last.to = to;
  else legs.push({ to, link: null });
  return legs;
}

/** The points a body walks through to reach `to`; empty means unreachable. */
export function findRoute(from: Point, to: Point, place: Place): Point[] {
  return planLegs(from, to, place).map((leg) => leg.to);
}

export interface Navigator { goal: Point | null; path: Leg[]; leapFrom: Point | null }
/** True while the walker is in the air over an authored link: it lands before it does anything else. */
export function midLeap(route: Navigator): boolean { return route.leapFrom !== null && route.path[0]?.link != null; }
export function createNavigator(): Navigator { return { goal: null, path: [], leapFrom: null }; }

/** Told when a walker starts (`enter`) and lands (`exit`) an authored link, so its body can play the leap. */
export type LinkCrossing = (link: NavMeshLink, phase: "enter" | "exit") => void;

/**
 * Preserve the route while chasing; rebuild only when the target changes cell or the path is
 * obstructed. A leg over an authored link is never "obstructed": the gap under it is the point. The
 * returned point rises in an arc while the walker is mid-leap.
 */
export function advanceRoute(route: Navigator, from: Point, goal: Point, budget: number, place: Place, onLink?: LinkCrossing): Point {
  if (!(budget > 0) || !Number.isFinite(budget)) return from;
  if (!midLeap(route)) {
    const next = route.path[0];
    if (traversable(from, goal, place)) { route.goal = goal; route.path = [{ to: goal, link: null }]; }
    else if (route.goal === null || groundDistance(route.goal, goal) > CELL * 2 || (next !== undefined && next.link === null && !traversable(from, next.to, place))) {
      route.goal = goal; route.path = planLegs(from, goal, place);
    }
  }
  let at: Point = from, left = budget;
  while (route.path.length && left > 0) {
    const leg = route.path[0]!;
    if (leg.link !== null && route.leapFrom === null) { route.leapFrom = at; onLink?.(leg.link, "enter"); }
    const remaining = groundDistance(at, leg.to);
    if (remaining <= left) {
      at = leg.to; left -= remaining; route.path.shift();
      if (leg.link !== null) { route.leapFrom = null; onLink?.(leg.link, "exit"); }
    } else { const f = left / remaining; at = [at[0] + (leg.to[0] - at[0]) * f, at[1], at[2] + (leg.to[2] - at[2]) * f]; left = 0; }
  }
  const leap = route.path[0];
  if (route.leapFrom !== null && leap?.link != null) {
    const span = groundDistance(route.leapFrom, leap.to);
    const t = span > 0 ? Math.min(1, groundDistance(route.leapFrom, at) / span) : 1;
    return [at[0], LEAP_HEIGHT * 4 * t * (1 - t), at[2]];
  }
  return at;
}
