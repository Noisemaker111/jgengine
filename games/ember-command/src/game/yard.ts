import type { EditorDocument } from "@jgengine/core/editor/index";

import { HOSE_CROSSING_RADIUS, HOSE_HALF_WIDTH } from "./tuning";

/**
 * The backyard's authored landmarks, read once from `editor.scene.json`: the garden hose and its two
 * crossings, the sprinkler on the hose's end, the lawnmower's lane, the patio stones and the patches of
 * shade the magnifying glass cannot reach. Pure data — gameplay (`hazards.ts`, `units.ts`) and the
 * renderers both read this one layout, so what the player sees is what the rules use.
 */

export interface YardPoint {
  x: number;
  z: number;
}

export interface YardCircle extends YardPoint {
  radius: number;
}

export interface YardSprinkler extends YardPoint {
  /** How far the jet reaches. */
  reach: number;
  /** The arc it sweeps back and forth across, in radians (atan2(dx, dz) convention). */
  arcFrom: number;
  arcTo: number;
}

export interface YardLane {
  from: YardPoint;
  to: YardPoint;
  /** Half the cut's width: anything this close to the lane line is under the deck. */
  halfWidth: number;
}

export interface YardSlab extends YardPoint {
  halfX: number;
  halfZ: number;
}

/** The parked car's shadow: it slides along its path as the sun crosses the sky. */
export interface YardCarShade {
  points: readonly YardPoint[];
  radius: number;
  /** Seconds for the shade to go end to end and back. */
  period: number;
}

export interface YardLayout {
  hose: { points: readonly YardPoint[]; halfWidth: number } | null;
  /** Sun-baked pavement: hot to stand on by day. */
  hot: readonly YardSlab[];
  /** Sidewalk cracks: the cool lanes across the pavement. */
  cracks: readonly { points: readonly YardPoint[]; halfWidth: number }[];
  carShade: YardCarShade | null;
  crossings: readonly YardCircle[];
  sprinkler: YardSprinkler | null;
  mowerLane: YardLane | null;
  patios: readonly YardSlab[];
  shade: readonly YardCircle[];
  /** Giant props nothing walks through (a gnome, a tyre, the mailbox post), as footprints. */
  obstacles: readonly YardCircle[];
}

/** Prop catalog ids whose footprint blocks the yard's routes. */
export const BLOCKING_PROPS: ReadonlySet<string> = new Set(["gnome", "tire", "mailbox"]);

export const HOSE_KIND = "garden_hose";
export const MOWER_LANE_KIND = "mower_lane";
export const PATIO_KIND = "patio_stone";
export const SPRINKLER_MARKER = "sprinkler";
export const HOT_KIND = "hot_pavement";
export const CRACK_KIND = "sidewalk_crack";
export const CAR_SHADE_KIND = "car_shade";

function num(meta: unknown, key: string, fallback: number): number {
  const value = (meta as Record<string, unknown> | undefined)?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const DEG = Math.PI / 180;

export function readYardLayout(doc: EditorDocument): YardLayout {
  const hosePath = doc.paths.find((path) => path.kind === HOSE_KIND);
  const lanePath = doc.paths.find((path) => path.kind === MOWER_LANE_KIND);
  const sprinklerMarker = doc.markers.find((marker) => marker.id === SPRINKLER_MARKER);
  const first = lanePath?.points[0];
  const last = lanePath?.points[lanePath.points.length - 1];
  const carPath = doc.paths.find((path) => path.kind === CAR_SHADE_KIND);
  return {
    hot: doc.volumes
      .filter((volume) => volume.kind === HOT_KIND)
      .map((volume) => ({ x: volume.center.x, z: volume.center.z, halfX: volume.halfExtents?.x ?? 8, halfZ: volume.halfExtents?.z ?? 8 })),
    cracks: doc.paths
      .filter((path) => path.kind === CRACK_KIND)
      .map((path) => ({ points: path.points.map((p) => ({ x: p.x, z: p.z })), halfWidth: num(path.meta, "width", path.width ?? 2.4) / 2 })),
    carShade: carPath === undefined || carPath.points.length < 2 ? null : {
      points: carPath.points.map((p) => ({ x: p.x, z: p.z })),
      radius: num(carPath.meta, "radius", 9),
      period: num(carPath.meta, "period", 120),
    },
    hose: hosePath === undefined ? null : {
      points: hosePath.points.map((p) => ({ x: p.x, z: p.z })),
      halfWidth: num(hosePath.meta, "width", hosePath.width ?? HOSE_HALF_WIDTH * 2) / 2,
    },
    crossings: doc.markers
      .filter((marker) => marker.id.startsWith("hose_crossing"))
      .map((marker) => ({ x: marker.position.x, z: marker.position.z, radius: num(marker.meta, "radius", HOSE_CROSSING_RADIUS) })),
    sprinkler: sprinklerMarker === undefined ? null : {
      x: sprinklerMarker.position.x,
      z: sprinklerMarker.position.z,
      reach: num(sprinklerMarker.meta, "reach", 22),
      arcFrom: num(sprinklerMarker.meta, "arcFrom", 120) * DEG,
      arcTo: num(sprinklerMarker.meta, "arcTo", 300) * DEG,
    },
    mowerLane: lanePath === undefined || first === undefined || last === undefined ? null : {
      from: { x: first.x, z: first.z },
      to: { x: last.x, z: last.z },
      halfWidth: num(lanePath.meta, "width", lanePath.width ?? 8) / 2,
    },
    patios: doc.volumes
      .filter((volume) => volume.kind === PATIO_KIND)
      .map((volume) => ({ x: volume.center.x, z: volume.center.z, halfX: volume.halfExtents?.x ?? 4, halfZ: volume.halfExtents?.z ?? 4 })),
    obstacles: doc.markers
      .filter((marker) => marker.catalogId !== undefined && BLOCKING_PROPS.has(marker.catalogId))
      .map((marker) => ({ x: marker.position.x, z: marker.position.z, radius: num(marker.meta, "clearance", 4) * 0.8 })),
    shade: doc.markers
      .filter((marker) => marker.id.startsWith("shade_"))
      .map((marker) => ({ x: marker.position.x, z: marker.position.z, radius: num(marker.meta, "radius", 6) })),
  };
}

/** Distance from a point to segment AB on the ground plane. */
export function distanceToSegment(px: number, pz: number, a: YardPoint, b: YardPoint): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / len2));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

function inCircle(circles: readonly YardCircle[], x: number, z: number): boolean {
  return circles.some((c) => Math.hypot(c.x - x, c.z - z) <= c.radius);
}

/** True when a point is on the hose body (not at one of its crossings): climbing it is slow. */
export function onHose(layout: YardLayout, x: number, z: number): boolean {
  const hose = layout.hose;
  if (hose === null || hose.points.length < 2) return false;
  if (inCircle(layout.crossings, x, z)) return false;
  for (let i = 1; i < hose.points.length; i += 1) {
    if (distanceToSegment(x, z, hose.points[i - 1]!, hose.points[i]!) <= hose.halfWidth) return true;
  }
  return false;
}

/** True when a point stands on a patio stone (high ground). */
export function onPatio(layout: YardLayout, x: number, z: number): boolean {
  return layout.patios.some((slab) => Math.abs(x - slab.x) <= slab.halfX && Math.abs(z - slab.z) <= slab.halfZ);
}

/** True when a point is in shade the magnifying glass cannot focus through. */
export function inShade(layout: YardLayout, x: number, z: number): boolean {
  return inCircle(layout.shade, x, z);
}

/** True on sun-baked pavement. */
export function onHotPavement(layout: YardLayout, x: number, z: number): boolean {
  return layout.hot.some((slab) => Math.abs(x - slab.x) <= slab.halfX && Math.abs(z - slab.z) <= slab.halfZ);
}

/** True inside a sidewalk crack (a cool lane). */
export function onCrack(layout: YardLayout, x: number, z: number): boolean {
  for (const crack of layout.cracks) {
    for (let i = 1; i < crack.points.length; i += 1) {
      if (distanceToSegment(x, z, crack.points[i - 1]!, crack.points[i]!) <= crack.halfWidth) return true;
    }
  }
  return false;
}

/** Where the parked car's shade lies at battle second `t`: it ping-pongs along its path. */
export function carShadeAt(layout: YardLayout, t: number): YardCircle | null {
  const shade = layout.carShade;
  if (shade === null) return null;
  const phase = (t % shade.period) / shade.period;
  const u = phase < 0.5 ? phase * 2 : 2 - phase * 2;
  const segments = shade.points.length - 1;
  const f = u * segments;
  const i = Math.min(segments - 1, Math.floor(f));
  const a = shade.points[i]!;
  const b = shade.points[i + 1]!;
  const k = f - i;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, radius: shade.radius };
}

/** True in any cool spot at battle second `t`: authored shade, a crack, or the car's shade. */
export function coolAt(layout: YardLayout, x: number, z: number, t: number): boolean {
  if (inShade(layout, x, z) || onCrack(layout, x, z)) return true;
  const car = carShadeAt(layout, t);
  return car !== null && Math.hypot(car.x - x, car.z - z) <= car.radius;
}
