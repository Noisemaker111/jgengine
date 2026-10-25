import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { skyFromDocument } from "@jgengine/core/editor/environment";
import {
  environment,
  ocean,
  rain,
  sky,
  terrain,
  type EnvironmentWorldFeature,
  type TerrainMaterialRegion,
} from "@jgengine/core/world/features";
import { editorLayers } from "./editorLayers";
import { GROUND_MAPS } from "./game/assets";
import { roadSource } from "./game/world/cityLayout";
import { DISTRICTS, ROADS, SHORE_X, WORLD_D, WORLD_W } from "./game/world/districts";

/** The sky the scene document authors; the day/night cycle runs on it. */
const authoredSky = skyFromDocument(editorLayers);

/**
 * The streets at boot. Their widths, kerbs and sidewalks come from the one layout block in
 * `game/world/cityLayout.ts`; `roadSource` below keeps the drawn streets in step when a layout slider
 * moves.
 */
export const streets = roadSource.initial;

/**
 * Region order is paint order — later entries win overlaps. Districts wash first, streets lay
 * pavement over them, and the beach goes on last so the sand runs right up to Mainsail Boulevard's west
 * kerb instead of being overpainted by that avenue's own pavement apron.
 */
const districtRegions: TerrainMaterialRegion[] = DISTRICTS.map((district) => ({
  center: district.center,
  radius: district.radius,
  falloff: district.radius * 0.45,
  colors:
    district.id === "downtown"
      ? { low: "#7e838a", high: "#8d9299" }
      : district.id === "port_carmine"
        ? { low: "#6e7378", high: "#7d8288" }
        : district.id === "palm_heights"
          ? { low: "#8d8a6a", high: "#9c9878" }
          : { low: "#a2937a", high: "#b0a189" },
}));

/** A pavement apron either side of every authored street, so a city block is paved, not lawn. */
const pavementRegions: TerrainMaterialRegion[] = ROADS.map((segment) => ({
  shape: "polyline" as const,
  points: [segment.from, segment.to],
  width: 44,
  falloff: 18,
  colors: { low: "#8a8f96", high: "#989da4" },
}));

/** Beach and wet-sand bands, hugging the coastline the terrain's shore falloff already carves. */
const beachRegions: TerrainMaterialRegion[] = [
  {
    shape: "polyline",
    points: [
      [SHORE_X - 5, -WORLD_D / 2],
      [SHORE_X - 5, WORLD_D / 2],
    ],
    width: 62,
    falloff: 11,
    colors: { low: "#c9ac7a", high: "#d6bd92" },
  },
  {
    shape: "polyline",
    points: [
      [SHORE_X - 16, -WORLD_D / 2],
      [SHORE_X - 16, WORLD_D / 2],
    ],
    width: 20,
    falloff: 9,
    colors: { low: "#a89269", high: "#c4a878", waterline: "#3ec6cf" },
  },
];

const cityFlatten = DISTRICTS.map((d) => ({
  center: d.center,
  radius: d.radius,
  height: d.id === "palm_heights" ? 14 : 1.2,
  falloff: d.radius * 0.6,
}));

function coastalHeight(x: number, z: number): number {
  const shoreFall = x < SHORE_X ? (x - SHORE_X) * 0.22 : 0;
  const hills = Math.max(0, -(z + 150)) * 0.09;
  const roll = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 2.2;
  return 1.5 + roll + hills + shoreFall;
}

export const world: EnvironmentWorldFeature = environment({
  terrain: terrain({
    bounds: { w: WORLD_W, d: WORLD_D },
    segments: 150,
    seed: "harbor-heat-06",
    heightField: coastalHeight,
    waterLevel: -0.6,
    colors: { low: "#a89464", high: "#7d8c52", waterline: "#33c2ce" },
    materialRegions: [...districtRegions, ...pavementRegions, ...beachRegions],
    flatten: cityFlatten,
    detail: {
      // Sun-bleached coastal surface: pale dune sand at the waterline, warm dry rock on the few
      // slopes steep enough to show, and no snow anywhere on a tropical isle.
      sandColor: "#c3ab7e",
      rockColor: "#7d735f",
      // Well below the city floor: the detail shader fades its beach band in over the two metres
      // above `waterLevel`, and every district is flattened to 1.2, so the terrain default painted
      // the whole downtown as beach. The real sand is a `materialRegions` band along the coast.
      waterLevel: -3,
      snowHeight: 9999,
      rockSlopeStart: 0.34,
      detailScale: 7,
      macroScale: 62,
      roughness: 1,
      strength: 1,
      // Grain, not repaint: a low `tint` keeps the beach, the pavement aprons, and the district
      // washes above and takes only the map's light and shade. Without this whole block the ground
      // is pure vertex colour, which is what made the isle read as untextured plastic at any range.
      // `strength` is deliberately held at half: it is also the mix weight on the map's ROUGHNESS
      // channel, and ambientCG's ground reads about 0.45 there, so a strong blend turned the dunes
      // glossy enough to throw a blown sun blob across the middle of any shot facing the light. Half
      // keeps the grain and the normal relief; the procedural layer above carries the rest.
      material: { maps: GROUND_MAPS, repeat: 2.4, strength: 0.5, tint: 0.18 },
    },
  }),
  // The dome's shape lives here; its colours, haze and the light come from the game's `mood`, and
  // the authored environment block runs the day/night cycle and places the sun
  // (`sunAzimuth`/`sunElevation`), so the key light and the dome's sun stay one sun.
  sky: sky({
    hazeStrength: 0.18,
    sunGlowStrength: 0.9,
    gradientExponent: 0.34,
    cloudiness: 0.3,
    radius: 620,
    ...(authoredSky ?? { preset: "day", timeOfDay: true }),
  }),
  // A squall far out over the Gulf: atmosphere on the horizon the boulevard looks into, well clear
  // of the sun-drenched city itself.
  weather: rain({
    area: { w: 120, d: 120, h: 60, position: [-430, -210] },
    density: 0.55,
    speed: 17,
    dropLength: 1.6,
    wind: [1.5, 0.5],
    color: "#5f86ab",
    opacity: 0.32,
  }),
  roads: streets,
  roadSource,
  water: [
    ocean({
      // Reaches past the terrain's waterline so the sea meets the beach instead of stopping short
      // of it and leaving a band of dry seabed between sand and water.
      bounds: { w: 470, d: 780 },
      position: [-430, 0],
      level: -0.4,
      color: "#12b0cd",
      waveHeight: 0.55,
      waveScale: 26,
      waveSpeed: 0.5,
    }),
  ],
  // Vegetation footprints and appearance are authored grass_field scene volumes.

  // The city's buildings are authored at runtime as collidable, street-facing scene-object lots (see
  // `game/world/setup.ts` → `placeBuildings`, driven by the engine's `deriveBuildingLots` frontage
  // engine). The old `structures: [building(...)]` clusters were rendered and blocked NPC navigation
  // but were NOT part of the player's movement-obstacle set (only scene objects are), so the player
  // walked straight through them — and, being center-anchored clusters, they overlapped the street
  // grid. Both problems are gone now that every building is a solid lot set back from the road.
});

export const physics: PhysicsConfig = { gravity: -28, jumpVelocity: 7.4 };
