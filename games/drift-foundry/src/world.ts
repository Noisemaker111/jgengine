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

import { YARD_FLOOR_MATERIAL } from "./game/assets";
import { SALVAGE_FACADE_KIT } from "./game/art/facades";
import { CORRIDOR_HALF_WIDTH, EXIT_Z, HAUL_ROAD_HALF_WIDTH } from "./game/run/constants";
import { ZONES, type ZoneDef } from "./game/zones/catalog";
import { ROW_SIX_TRACK, TRACKS, type Track } from "./game/tracks/catalog";
import { YARD_GROUND } from "./game/tracks/ground";

/** Every yard track but Row Six, each laid in its own stretch of the yard along z. */
const LAID_TRACKS: readonly Track[] = TRACKS.filter((track) => track !== ROW_SIX_TRACK);

/**
 * The yard holds every track at once, stacked along z (the quarry farthest north, the conveyor hall
 * farthest south) so one terrain, one sky and one set of biome bands serve them all. 800 m wide and
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
      color: "#38322c",
      markings: route.id === "main",
      markingColor: "#e8c24a",
      sidewalk: false,
      elevation: route.id === "main" ? 0.12 : 0.14,
    }),
  );
}

/** The dark shoulder painted under each route, wider than the paving, so the road reads from the air. */
function trackShoulders(track: Track): TerrainMaterialRegion[] {
  return track.course.routes.map((route) => ({
    shape: "polyline" as const,
    points: routePath(route.points, 4),
    width: track.def.halfWidth * 2 + 10,
    falloff: 10,
    colors: { low: track.def.ground.low, high: track.def.ground.low, waterline: track.def.ground.low },
  }));
}

/** Slag pools and flood water: a liquid sheet over the track's lowland, its level the track's own. */
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

/** Haul road runs the whole corridor and a little past both ends so neither cap is a visible seam. */
const HAUL_START_Z = -70;
const HAUL_END_Z = EXIT_Z + 60;

/** Frontage width the near wall lines: buildings front on the drivable corridor plus its shoulders. */
const NEAR_WALL_FRONTAGE = 76;
/** Second row sits a block back so the corridor reads as layered depth, not a single flat facade. */
const FAR_WALL_FRONTAGE = 132;

function zoneRoad(zone: ZoneDef): { path: readonly (readonly [number, number])[]; width: number } {
  return { path: [[0, zone.start - 6] as const, [0, zone.end + 6] as const], width: NEAR_WALL_FRONTAGE };
}

function nearWall(zone: ZoneDef): BuildingEnvironmentDescriptor {
  return building({
    count: 20,
    footprint: { w: 15, d: 11 },
    stories: [2, 5],
    storyHeight: 3.4,
    spacing: 5,
    style: zone.buildingStyle,
    palette: zone.palette,
    seed: `drift-foundry-${zone.id}-near`,
    along: { roads: [zoneRoad(zone)], setback: 2, bothSides: true, maxLots: 20 },
    kit: SALVAGE_FACADE_KIT,
  });
}

function farWall(zone: ZoneDef): BuildingEnvironmentDescriptor {
  return building({
    count: 10,
    footprint: { w: 20, d: 14 },
    stories: [4, 8],
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
    kit: SALVAGE_FACADE_KIT,
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
    // Wide enough that the far wall and the yard's landmark silhouettes stand on ground rather than
    // over the world edge, and long enough to cover the whole run plus its fog falloff.
    bounds: YARD_BOUNDS,
    // The yard's swell with every track's grade laid in: the same field the headless runs drive on.
    heightField: YARD_GROUND,
    cellSize: YARD_CELL,
    colors: { low: "#1d1610", high: "#57351f", waterline: "#1d1610" },
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
        colors: { low: "#33291f", high: "#4a4036", waterline: "#33291f" },
      },
    ],
    detail: {
      rockColor: "#4a3421",
      sandColor: "#4a3826",
      snowHeight: 400,
      detailScale: 3.2,
      macroScale: 30,
      roughness: 0.94,
      strength: 1,
      // `tint` well under 1 keeps the authored oil-black corridor and rust-dirt bands: at the default
      // the map's own pale albedo wins and every zone flattens to one grey.
      material: { maps: YARD_FLOOR_MATERIAL, repeat: 1.8, strength: 0.72, tint: 0.3 },
    },
  }),
  roads: [
    road({
      path: [
        [0, HAUL_START_Z],
        [0, HAUL_END_Z],
      ],
      // Narrower than the drivable corridor on purpose: a haul strip with textured dirt shoulders
      // either side, rather than one untextured slab filling the near frame.
      width: HAUL_ROAD_HALF_WIDTH * 2,
      color: "#453a30",
      markings: true,
      markingColor: "#e8c24a",
      sidewalk: false,
      elevation: 0.12,
    }),
    ...LAID_TRACKS.flatMap(trackRoads),
  ],
  water: LAID_TRACKS.map(trackLiquid).filter((entry): entry is OceanEnvironmentDescriptor => entry !== null),
  sky: sky({
    preset: "day",
    horizonColor: "#ff9d3d",
    zenithColor: "#8a5230",
    sunIntensity: 2.6,
    ambientIntensity: 0.95,
    // The dome tracks the camera in xz, so this only has to clear the visible terrain (±500m along
    // the run) and stay inside the camera's far plane — past it the dome is depth-clipped to black.
    radius: 520,
    hazeStrength: 0.7,
    sunGlowStrength: 1.5,
    // Above 1 banks the burnt-orange horizon further up the dome; the default drops the near-black
    // zenith straight into an eye-level frame and the dusk reads as night.
    gradientExponent: 1.4,
    cloudiness: 0.55,
    fog: { color: "#7a4a24", near: 55, far: 300 },
  }),
  structures: ZONES.flatMap((zone) => [nearWall(zone), farWall(zone)]),
});

export const physics: PhysicsConfig = { gravity: -24 };
