/**
 * Shared world dressing every kind lays its world with: towns and villages from the engine's city
 * studio, forests and outcrops as scatter regions, lakes, meadows, trails and prop clusters. All of it
 * is authored into `editor.scene.json`, so the editor (F2+E) reshapes it afterwards with the same
 * sliders. Placement is clustered, never on a grid: blobs, rings and drifts around the places that
 * matter, leaving the play space clear.
 */
import type { Layout, Spot } from "./layout";

export interface PaletteEntry {
  item: string;
  weight: number;
}

/** How a kind's world is dressed; the items are keys of `idea.world.scatter`. */
export interface Dressing {
  /** Trees for forests and groves. */
  forest: PaletteEntry[];
  /** Bushes, ferns, flowers and small rocks: forest edges and meadow drifts. */
  brush: PaletteEntry[];
  /** Boulders for outcrops. */
  rocks: PaletteEntry[];
  /** Ground cover; omit for sand, ash, snow or a city. */
  grass?: { base: string; tip: string; height: number };
  /** Lake colours; omit for no lakes. */
  water?: { color: string; shallow: string };
  /** What paths between places are made of. */
  trail: { surface: string; color: string; width: number };
}

/** City studio meta for a few town looks; any slider in the city kind can be added. */
export const TOWNS = {
  village: {
    gridness: 0.25, curviness: 0.65, branching: 0.55, blockSize: 26, blockAspect: 1.2, openSpace: 0.2, streetWidth: 4, boulevards: 0,
    gravelLanes: true, surface: "gravel", profile: "uniform", coreExtent: 0.35, midExtent: 0.7,
    coreMix: [{ item: "house", weight: 3 }, { item: "rowhouse", weight: 1 }], midMix: [{ item: "house", weight: 3 }, { item: "farmhouse", weight: 1 }],
    edgeMix: [{ item: "farmhouse", weight: 2 }, { item: "barn", weight: 1 }], lotScale: 0.8, floorsMin: 1, floorsMax: 2, floorHeight: 2.8,
    treeDensity: 0.5, treeMix: [{ item: "broadleaf", weight: 3 }, { item: "conifer", weight: 1 }], lightDensity: 0.15, parkedCars: 0,
    sidewalks: false, fields: false, hedges: true, driveways: false, parking: false, style: "village", roadsideOccupancy: 0.85, blockDensity: 0.55, clusterStrength: 0.6,
  },
  coastal: {
    gridness: 0.35, curviness: 0.55, branching: 0.5, blockSize: 24, blockAspect: 1.3, openSpace: 0.18, streetWidth: 4, boulevards: 0,
    gravelLanes: false, profile: "uniform", coreExtent: 0.4, midExtent: 0.75,
    coreMix: [{ item: "shop", weight: 2 }, { item: "rowhouse", weight: 2 }], midMix: [{ item: "house", weight: 3 }, { item: "rowhouse", weight: 1 }],
    edgeMix: [{ item: "house", weight: 2 }], lotScale: 0.75, floorsMin: 1, floorsMax: 3, floorHeight: 2.8,
    treeDensity: 0.35, treeMix: [{ item: "broadleaf", weight: 2 }, { item: "palm", weight: 1 }], lightDensity: 0.3, parkedCars: 0,
    sidewalks: false, fields: false, style: "coastal", roadsideOccupancy: 0.9, blockDensity: 0.6, clusterStrength: 0.55,
  },
  ruin: {
    gridness: 0.45, curviness: 0.5, branching: 0.6, blockSize: 24, blockAspect: 1, openSpace: 0.15, streetWidth: 3.5, boulevards: 0,
    gravelLanes: true, surface: "gravel", profile: "uniform", coreExtent: 0.4, midExtent: 0.7,
    coreMix: [{ item: "shop", weight: 2 }, { item: "rowhouse", weight: 2 }], midMix: [{ item: "house", weight: 3 }, { item: "rowhouse", weight: 1 }],
    edgeMix: [{ item: "house", weight: 2 }, { item: "barn", weight: 1 }], lotScale: 0.7, floorsMin: 1, floorsMax: 2, floorHeight: 2.6,
    treeDensity: 0.45, treeMix: [{ item: "conifer", weight: 3 }, { item: "broadleaf", weight: 1 }], lightDensity: 0, parkedCars: 0.2,
    hedges: false, driveways: false, parking: false, fields: false, sidewalks: false, style: "ruin", roadsideOccupancy: 0.9, blockDensity: 0.5, clusterStrength: 0.6,
  },
  town: {
    gridness: 0.7, curviness: 0.3, branching: 0.5, blockSize: 34, blockAspect: 1.4, openSpace: 0.12, streetWidth: 7, boulevards: 0.2,
    gravelLanes: false, profile: "core-out", coreExtent: 0.3, midExtent: 0.7,
    coreMix: [{ item: "shop", weight: 3 }, { item: "slab", weight: 1 }], midMix: [{ item: "rowhouse", weight: 2 }, { item: "house", weight: 2 }],
    edgeMix: [{ item: "house", weight: 3 }], lotScale: 1, floorsMin: 1, floorsMax: 4, floorHeight: 3,
    treeDensity: 0.4, treeMix: [{ item: "broadleaf", weight: 1 }], lightDensity: 0.5, parkedCars: 0.4, sidewalks: true, fields: false, style: "generic",
    roadsideOccupancy: 0.9, blockDensity: 0.6, clusterStrength: 0.4,
  },
  downtown: {
    gridness: 0.9, curviness: 0.1, branching: 0.4, blockSize: 48, blockAspect: 1.6, openSpace: 0.06, streetWidth: 10, boulevards: 0.5,
    gravelLanes: false, profile: "core-out", coreExtent: 0.4, midExtent: 0.75,
    coreMix: [{ item: "tower", weight: 3 }, { item: "slab", weight: 2 }], midMix: [{ item: "slab", weight: 2 }, { item: "shop", weight: 2 }],
    edgeMix: [{ item: "shop", weight: 2 }, { item: "rowhouse", weight: 1 }], lotScale: 1.2, floorsMin: 3, floorsMax: 22, floorHeight: 3.4,
    treeDensity: 0.2, treeMix: [{ item: "broadleaf", weight: 1 }], lightDensity: 0.9, parkedCars: 0.6, sidewalks: true, fields: false, style: "neon",
    roadsideOccupancy: 1, blockDensity: 0.8, clusterStrength: 0.3,
  },
  farmland: {
    gridness: 0.55, curviness: 0.35, branching: 0.35, blockSize: 70, blockAspect: 1.6, openSpace: 0.4, streetWidth: 5, boulevards: 0,
    gravelLanes: true, surface: "gravel", profile: "uniform", coreExtent: 0.2, midExtent: 0.5,
    coreMix: [{ item: "farmhouse", weight: 2 }, { item: "house", weight: 1 }], midMix: [{ item: "farmhouse", weight: 2 }, { item: "barn", weight: 1 }],
    edgeMix: [{ item: "barn", weight: 2 }, { item: "silo", weight: 1 }], lotScale: 1.4, floorsMin: 1, floorsMax: 2, floorHeight: 3,
    treeDensity: 0.35, treeMix: [{ item: "broadleaf", weight: 2 }, { item: "conifer", weight: 1 }], lightDensity: 0, parkedCars: 0.1,
    sidewalks: false, fields: true, hedges: true, style: "village", roadsideOccupancy: 0.6, blockDensity: 0.35, clusterStrength: 0.7,
  },
  outpost: {
    gridness: 0.6, curviness: 0.3, branching: 0.4, blockSize: 30, blockAspect: 1.3, openSpace: 0.25, streetWidth: 6, boulevards: 0,
    gravelLanes: true, surface: "gravel", profile: "uniform", coreExtent: 0.4, midExtent: 0.8,
    coreMix: [{ item: "slab", weight: 2 }, { item: "shop", weight: 1 }], midMix: [{ item: "shop", weight: 2 }, { item: "house", weight: 1 }],
    edgeMix: [{ item: "barn", weight: 1 }, { item: "silo", weight: 1 }], lotScale: 1, floorsMin: 1, floorsMax: 3, floorHeight: 3.2,
    treeDensity: 0.1, treeMix: [{ item: "conifer", weight: 1 }], lightDensity: 0.6, parkedCars: 0.3, sidewalks: false, fields: false, style: "industrial",
    roadsideOccupancy: 0.8, blockDensity: 0.5, clusterStrength: 0.5,
  },
} as const satisfies Record<string, Record<string, unknown>>;

export type TownLook = keyof typeof TOWNS;

/** A town or village from the city studio, on a level pad. Returns its footprint radius. */
export function town(layout: Layout, entry: { id: string; at: Spot; half: { x: number; z: number }; look: TownLook; label: string; meta?: Record<string, unknown> }): number {
  const radius = Math.hypot(entry.half.x, entry.half.z);
  layout.doc.volumes.push({
    id: entry.id,
    kind: "city",
    shape: "box",
    center: { x: entry.at.x, y: 0, z: entry.at.z },
    halfExtents: { x: entry.half.x, y: 8, z: entry.half.z },
    label: entry.label,
    meta: { ...TOWNS[entry.look], seed: `${entry.id}-${layout.between(0, 1e6).toFixed(0)}`, ...entry.meta },
  });
  layout.pad(`${entry.id}-pad`, entry.at, radius + 4, undefined, 30);
  layout.take(entry.at, radius + 2);
  return radius;
}

/** A forest: an irregular scatter region of trees with brush at its edge. */
export function forest(layout: Layout, entry: { id: string; at: Spot; radius: number; dressing: Dressing; density?: number; label?: string }): void {
  layout.doc.paths.push({
    id: entry.id,
    kind: "scatter",
    points: layout.blob(entry.at, entry.radius).map((point) => ({ x: point.x, y: 0, z: point.z })),
    label: entry.label ?? "Woods",
    meta: {
      palette: [...entry.dressing.forest, ...entry.dressing.brush.map((brush) => ({ item: brush.item, weight: brush.weight * 0.6 }))],
      density: entry.density ?? 0.13,
      minSpacing: 2.4,
      minScale: 0.8,
      maxScale: 1.35,
      edgeFalloff: Math.min(10, entry.radius * 0.35),
      jitter: 1,
      maxSlope: 32,
      seed: entry.id,
    },
  });
  layout.take(entry.at, entry.radius * 0.85);
}

/** A drift of bushes, flowers or rocks: small, dense, soft-edged. */
export function patch(layout: Layout, entry: { id: string; at: Spot; radius: number; palette: PaletteEntry[]; density?: number; label?: string; minScale?: number; maxScale?: number }): void {
  layout.doc.paths.push({
    id: entry.id,
    kind: "scatter",
    points: layout.blob(entry.at, entry.radius, 9, 0.35).map((point) => ({ x: point.x, y: 0, z: point.z })),
    label: entry.label ?? "Undergrowth",
    meta: {
      palette: entry.palette,
      density: entry.density ?? 0.35,
      minSpacing: 1.1,
      minScale: entry.minScale ?? 0.7,
      maxScale: entry.maxScale ?? 1.4,
      edgeFalloff: Math.min(5, entry.radius * 0.4),
      jitter: 1,
      seed: entry.id,
    },
  });
  layout.take(entry.at, entry.radius * 0.6);
}

/** A lake: its surface sits at `level`, the bed is carved under it and the shore levelled around it. */
export function lake(layout: Layout, entry: { id: string; at: Spot; radius: number; level: number; dressing: Dressing; label?: string }): void {
  const water = entry.dressing.water ?? { color: "#2c5d6e", shallow: "#5a9aa0" };
  const sx = entry.radius * layout.between(0.85, 1.2);
  const sz = entry.radius * layout.between(0.75, 1.1);
  layout.doc.volumes.push({
    id: entry.id,
    kind: "water",
    shape: "box",
    // A 4 m deep box: the bed is carved its full depth below the shore, so the water reads deep.
    center: { x: entry.at.x, y: entry.level - 2, z: entry.at.z },
    halfExtents: { x: Math.round(sx), y: 2, z: Math.round(sz) },
    label: entry.label ?? "Lake",
    meta: { color: water.color, shallowColor: water.shallow, waveHeight: 0.08, foam: 1.6, opacity: 0.92 },
  });
  layout.pad(`${entry.id}-shore`, entry.at, Math.max(sx, sz) + 10, entry.level + 0.5, 22);
  layout.take(entry.at, Math.max(sx, sz) + 6);
}

/** Ground cover over a box; it grows on the terrain wherever nothing is built. */
export function meadow(layout: Layout, entry: { id: string; at: Spot; half: number; dressing: Dressing; density?: number }): void {
  const grass = entry.dressing.grass;
  if (grass === undefined) return;
  layout.doc.volumes.push({
    id: entry.id,
    kind: "grass_field",
    shape: "box",
    center: { x: entry.at.x, y: 0, z: entry.at.z },
    halfExtents: { x: entry.half, y: 0.01, z: entry.half },
    label: "Meadow",
    meta: { density: entry.density ?? 2.2, bladeHeight: grass.height, colorBase: grass.base, colorTip: grass.tip, windStrength: 0.18, windSpeed: 1.2, seed: entry.id },
  });
}

/** A winding trail between two places, drawn as a dirt or gravel ribbon; nothing is placed on it. */
export function trail(layout: Layout, entry: { id: string; from: Spot; to: Spot; dressing: Dressing; width?: number; label?: string }): Spot[] {
  const points = layout.winding(entry.from, entry.to, Math.max(4, Math.round(Math.hypot(entry.to.x - entry.from.x, entry.to.z - entry.from.z) / 12)));
  layout.path({
    id: entry.id,
    kind: "trail",
    points,
    width: entry.width ?? entry.dressing.trail.width,
    ...(entry.label === undefined ? {} : { label: entry.label }),
    meta: { surface: entry.dressing.trail.surface, color: entry.dressing.trail.color, clearance: (entry.width ?? entry.dressing.trail.width) / 2 + 1 },
  });
  return points;
}

/**
 * A cluster of props around a spot: a few of each catalog id, piled near the middle and thinning out,
 * turned every which way. For camps, wreck yards, market stalls, ruins.
 */
export function cluster(layout: Layout, entry: { id: string; at: Spot; radius: number; props: readonly string[]; count: number; label?: string; spacing?: number }): void {
  for (let index = 0; index < entry.count; index += 1) {
    const reach = entry.radius * Math.sqrt((index + 1) / entry.count);
    const spot = layout.place(0.5, Math.max(1.5, reach), entry.spacing ?? 1.2, entry.at);
    if (spot === null) continue;
    layout.marker({ id: `${entry.id}-${index + 1}`, kind: "prop", catalogId: entry.props[index % entry.props.length]!, at: spot, rotationY: layout.turn(), label: entry.label ?? "Prop", meta: { clearance: 1 } });
  }
}

/**
 * The wild land around the play space: forests in a broken ring, rock outcrops, brush drifts and
 * meadows, filling `inner..outer` metres from the middle so the horizon is never bare ground.
 */
export function wilds(layout: Layout, entry: { dressing: Dressing; inner: number; outer: number; forests?: number; outcrops?: number; drifts?: number; prefix?: string; meadow?: number }): void {
  const prefix = entry.prefix ?? "wild";
  const forests = entry.forests ?? 9;
  for (let index = 0; index < forests; index += 1) {
    const radius = layout.between(18, 38);
    const at = layout.place(entry.inner + radius * 0.6, entry.outer, radius * 0.7, { x: 0, z: 0 }, false);
    if (at === null) continue;
    forest(layout, { id: `${prefix}-forest-${index + 1}`, at, radius, dressing: entry.dressing, density: layout.between(0.1, 0.16) });
  }
  for (let index = 0; index < (entry.outcrops ?? 6); index += 1) {
    const radius = layout.between(5, 10);
    const at = layout.place(entry.inner, entry.outer, radius, { x: 0, z: 0 }, false);
    if (at === null) continue;
    patch(layout, { id: `${prefix}-rocks-${index + 1}`, at, radius, palette: entry.dressing.rocks, density: 0.16, label: "Outcrop", minScale: 0.8, maxScale: 2.2 });
  }
  for (let index = 0; index < (entry.drifts ?? 10); index += 1) {
    const radius = layout.between(4, 8);
    const at = layout.place(entry.inner * 0.7, entry.outer, radius * 0.6, { x: 0, z: 0 }, false);
    if (at === null) continue;
    patch(layout, { id: `${prefix}-brush-${index + 1}`, at, radius, palette: entry.dressing.brush, density: 0.3 });
  }
  if (entry.dressing.grass !== undefined) meadow(layout, { id: `${prefix}-meadow`, at: { x: 0, z: 0 }, half: Math.min(entry.outer, entry.meadow ?? 85), dressing: entry.dressing });
}

/** A grove: a handful of trees close together near a place, so it does not stand on bare ground. */
export function grove(layout: Layout, entry: { id: string; at: Spot; radius: number; dressing: Dressing }): void {
  forest(layout, { ...entry, density: 0.18, label: "Grove" });
}
