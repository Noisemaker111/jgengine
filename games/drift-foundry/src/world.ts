import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import {
  building,
  environment,
  ocean,
  road,
  sky,
  terrain,
  type BiomeBand,
  type BuildingEnvironmentDescriptor,
  type OceanEnvironmentDescriptor,
  type RoadEnvironmentDescriptor,
  type TerrainMaterialRegion,
  type WorldFeature,
} from "@jgengine/core/world/features";

import { librarySurfaceScan } from "@jgengine/assets/catalogs/materialLibrary";

import { STORE_KIOSK_KIT } from "./game/art/facades";
import { CORRIDOR_HALF_WIDTH, EXIT_Z, HAUL_ROAD_HALF_WIDTH } from "./game/run/constants";
import { ZONES, type ZoneDef } from "./game/zones/catalog";
import { AISLE_NINE_TRACK, TRACKS, type Track } from "./game/tracks/catalog";
import { YARD_GROUND } from "./game/tracks/ground";

/** The aisles everywhere are glossy ceramic tile, laid over the store's terrazzo floor. */
const RACING_LINE_SCAN = librarySurfaceScan("tile/ceramic", { repeat: 1.2 });

/** Every department but Aisle 9, each laid in its own stretch of the store along z. */
const LAID_TRACKS: readonly Track[] = TRACKS.filter((track) => track !== AISLE_NINE_TRACK);

/**
 * The store holds every department at once, stacked along z (the garden centre farthest north,
 * electronics farthest south) so one floor, one ceiling haze and one set of biome bands serve them all. 800 m wide and
 * 4.9 km long at 3 m cells stays well under the terrain's vertex ceiling.
 */
const YARD_BOUNDS = { w: 800, d: 4900 };
const YARD_CELL = 3;

/** A route's centreline thinned to a vertex every few metres, for ribbons and paint. */
function routePath(points: readonly (readonly [number, number])[], every = 3): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  for (let i = 0; i < points.length; i += every) out.push(points[i]!);
  const last = points[points.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function trackBand(track: Track): BiomeBand {
  const def = track.def;
  return {
    z: def.bandZ,
    // The tracks sit hundreds of metres apart, so a short cross-fade settles each one's light well before its road.
    fade: 110,
    colors: def.ground,
    fog: def.fog,
    sky: def.sky,
    ...(def.weather === undefined ? {} : { weather: def.weather }),
  };
}

/** The paved strip of every route: a ribbon the width of the track's paving, draped on the graded ground. */
function trackRoads(track: Track): RoadEnvironmentDescriptor[] {
  return track.course.routes.map((route) =>
    road({
      path: routePath(route.points),
      width: 2 * (route.id === "main" ? track.def.pavedHalfWidth : Math.min(track.def.pavedHalfWidth, track.def.branches.find((branch) => branch.id === route.id)!.halfWidth)),
      color: "#bab4a8",
      materials: { road: RACING_LINE_SCAN },
      markings: route.id === "main",
      markingColor: "#2f6fd6",
      sidewalk: false,
      elevation: route.id === "main" ? 0.12 : 0.14,
    }),
  );
}

/** The dark shoulder painted under each route, wider than the paving, so the road reads from the air. */
function trackShoulders(track: Track): TerrainMaterialRegion[] {
  const shoulder = track.def.ground.low;
  return track.course.routes.map((route) => ({
    shape: "polyline" as const,
    points: routePath(route.points, 4),
    width: track.def.halfWidth * 2 + 10,
    falloff: 10,
    colors: shoulder === undefined ? {} : { low: shoulder, high: shoulder, waterline: shoulder },
  }));
}

/** The juice flood and the koi pond: a liquid sheet over the department's lowland, its level its own. */
function trackLiquid(track: Track): OceanEnvironmentDescriptor | null {
  const liquid = track.def.liquid;
  if (liquid === undefined) return null;
  const b = track.course.bounds;
  const margin = 70;
  return ocean({
    bounds: { w: b.maxX - b.minX + margin * 2, d: b.maxZ - b.minZ + margin * 2 },
    position: [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2],
    level: liquid.level,
    waveHeight: liquid.waveHeight,
    waveScale: 9,
    waveSpeed: 0.4,
    color: liquid.color,
    ...(liquid.palette === undefined ? {} : { palette: liquid.palette }),
  });
}

/** The main-aisle tile runs the whole corridor and a little past both ends so neither cap is a visible seam. */
const HAUL_START_Z = -70;
const HAUL_END_Z = EXIT_Z + 60;

/** Frontage width the near kiosk row lines: in-store kiosks front on the aisle plus its shoulders. */
const NEAR_WALL_FRONTAGE = 76;
/** Second row (the stockroom walls) sits a block back so the store reads as layered depth. */
const FAR_WALL_FRONTAGE = 132;

function zoneRoad(zone: ZoneDef): { path: readonly (readonly [number, number])[]; width: number } {
  return { path: [[0, zone.start - 6] as const, [0, zone.end + 6] as const], width: NEAR_WALL_FRONTAGE };
}

function nearWall(zone: ZoneDef): BuildingEnvironmentDescriptor {
  return building({
    count: 20,
    footprint: { w: 15, d: 11 },
    stories: [1, 2],
    storyHeight: 3.4,
    spacing: 5,
    style: zone.buildingStyle,
    palette: zone.palette,
    seed: `drift-foundry-${zone.id}-near`,
    along: { roads: [zoneRoad(zone)], setback: 2, bothSides: true, maxLots: 20 },
    kit: STORE_KIOSK_KIT,
  });
}

function farWall(zone: ZoneDef): BuildingEnvironmentDescriptor {
  return building({
    count: 10,
    footprint: { w: 20, d: 14 },
    stories: [4, 5],
    storyHeight: 3.8,
    spacing: 12,
    style: zone.buildingStyle,
    palette: zone.palette,
    seed: `drift-foundry-${zone.id}-far`,
    along: {
      roads: [{ ...zoneRoad(zone), width: FAR_WALL_FRONTAGE }],
      setback: 3,
      bothSides: true,
      maxLots: 10,
    },
    kit: STORE_KIOSK_KIT,
  });
}

function zoneBand(zone: ZoneDef): BiomeBand {
  return {
    z: (zone.start + zone.end) / 2,
    fade: 70,
    colors: zone.ground,
    fog: zone.fog,
    sky: zone.sky,
  };
}

export const world: WorldFeature = environment({
  terrain: terrain({
    // Wide enough that the stockroom walls and the store's landmarks stand on floor rather than over
    // the world edge, and long enough to cover the whole run plus its fog falloff.
    bounds: YARD_BOUNDS,
    // The store floor with every department's grade laid in: the same field the headless runs drive on.
    heightField: YARD_GROUND,
    cellSize: YARD_CELL,
    colors: { low: "#b9b2a3", high: "#c9c2b2", waterline: "#b9b2a3" },
    biomeBands: [...ZONES.map(zoneBand), ...LAID_TRACKS.map(trackBand)].sort((a, b) => a.z - b.z),
    materialRegions: [
      ...LAID_TRACKS.flatMap(trackShoulders),
      {
        shape: "polyline",
        points: [
          [0, HAUL_START_Z],
          [0, HAUL_END_Z],
        ],
        width: CORRIDOR_HALF_WIDTH * 2 + 14,
        falloff: 16,
        colors: { low: "#c4bdae", high: "#d2cbbb", waterline: "#c4bdae" },
      },
    ],
    detail: {
      rockColor: "#cfc8ba",
      sandColor: "#ddd6c8",
      snowHeight: 400,
      detailScale: 3.2,
      macroScale: 30,
      roughness: 0.42,
      strength: 1,
      // `tint` under 1 keeps each department's authored floor colour reading through the terrazzo
      // chips instead of every band flattening to the scan's own grey.
      material: librarySurfaceScan("stone/terrazzo", { repeat: 1.4, strength: 0.6, tint: 0.45 }),
    },
  }),
  roads: [
    road({
      path: [
        [0, HAUL_START_Z],
        [0, HAUL_END_Z],
      ],
      // Narrower than the drivable aisle on purpose: a tiled walkway with terrazzo either side, rather
      // than one slab filling the near frame.
      width: HAUL_ROAD_HALF_WIDTH * 2,
      color: "#bab4a8",
      materials: { road: RACING_LINE_SCAN },
      markings: true,
      markingColor: "#2f6fd6",
      sidewalk: false,
      elevation: 0.12,
    }),
    ...LAID_TRACKS.flatMap(trackRoads),
  ],
  water: LAID_TRACKS.map(trackLiquid).filter((entry): entry is OceanEnvironmentDescriptor => entry !== null),
  sky: sky({
    preset: "day",
    // The ceiling haze of a big-box store: warm white at eye level, a cooler grey up where the roof is.
    horizonColor: "#e6e1d6",
    zenithColor: "#aeb6c2",
    sun: { azimuth: 200, elevation: 62 },
    sunColor: "#fff6e6",
    sunIntensity: 1.5,
    ambientIntensity: 0.9,
    // The dome tracks the camera in xz, so this only has to clear the visible terrain (±500m along
    // the run) and stay inside the camera's far plane — past it the dome is depth-clipped to black.
    radius: 520,
    hazeStrength: 0.9,
    sunGlowStrength: 0.2,
    // Above 1 keeps the bright haze high on the dome, so the far end of an aisle fades to white, not grey.
    gradientExponent: 1.6,
    cloudiness: 0,
    fog: { color: "#ddd7cb", near: 70, far: 340 },
  }),
  structures: ZONES.flatMap((zone) => [nearWall(zone), farWall(zone)]),
});

export const physics: PhysicsConfig = { gravity: -24 };
