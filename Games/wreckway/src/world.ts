import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import {
  building,
  environment,
  road,
  sky,
  terrain,
  type BiomeBand,
  type BuildingEnvironmentDescriptor,
  type WorldFeature,
} from "@jgengine/core/world/features";

import { YARD_FLOOR_MATERIAL } from "./game/assets";
import { CORRIDOR_HALF_WIDTH, EXIT_Z } from "./game/run/constants";
import { ZONES, type ZoneDef } from "./game/zones/catalog";

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
    seed: `wreckway-${zone.id}-near`,
    along: { roads: [zoneRoad(zone)], setback: 2, bothSides: true, maxLots: 20 },
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
    seed: `wreckway-${zone.id}-far`,
    along: {
      roads: [{ ...zoneRoad(zone), width: FAR_WALL_FRONTAGE }],
      setback: 3,
      bothSides: true,
      maxLots: 10,
    },
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
    bounds: { w: 320, d: 1000 },
    height: 2.4,
    frequency: 0.012,
    octaves: 3,
    baseHeight: 0,
    seed: "wreckway-yard",
    segments: 260,
    colors: { low: "#1d1610", high: "#57351f", waterline: "#1d1610" },
    biomeBands: ZONES.map(zoneBand),
    materialRegions: [
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
      // The noise field dips below y=0 across most of the yard, so the default waterline would paint
      // a pale beach band right through the corridor. There is no water here — push it out of range.
      waterLevel: -60,
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
      width: 15,
      color: "#453a30",
      markings: true,
      markingColor: "#e8c24a",
      sidewalk: false,
      elevation: 0.12,
    }),
  ],
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
