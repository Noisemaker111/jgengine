import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { resolveTerrainField, type TerrainField } from "@jgengine/core/terrain/terrain";
import { seededRng } from "@jgengine/core/random/rng";
import {
  building,
  environment,
  grass,
  road,
  sky,
  terrain,
  type GrassEnvironmentDescriptor,
  type RoadEnvironmentDescriptor,
  type TerrainMaterialRegion,
  type WorldFeature,
} from "@jgengine/core/world/features";
import { CLIFF_MAPS, GROUND_MAPS } from "./game/assets";
import { SUBURB } from "./game/palette";
import { ROUTES, SPUR_ROUTES, SIDE_POIS, poiFlattenMasks, roadPathProfiles } from "./game/world/level";
import { WORLD_BOUNDS, ZONES } from "./game/world/zones";

/** The terrain seed. The name is the world generator's identity: changing it would move every authored site. */
export const FERRALON_SEED = "ferralon-arid-badlands-2026";

const TERRAIN_BASE = {
  bounds: WORLD_BOUNDS,
  seed: FERRALON_SEED,
  material: "rock",
  height: 52,
  frequency: 0.0035,
  // The authored scene's props sit at heights measured on this ground, so its shape stays as it was
  // laid out; only its colours, grass and grain moved to the suburb.
  octaves: 6,
  ridged: true,
  segments: 340,
  colors: { low: SUBURB.rockLow, high: SUBURB.rockHigh },
} as const;

export const CLIMB_SLOPE_LIMIT = 0.85;

const rawField = resolveTerrainField(terrain(TERRAIN_BASE));

const roadPoints = (points: readonly { x: number; z: number }[]) =>
  points.map((point) => [point.x, point.z] as const);

const speckleRegions = (
  cx: number,
  cz: number,
  spread: number,
  count: number,
  seed: string,
): TerrainMaterialRegion[] => {
  const rng = seededRng(seed);
  // Patchy yards: mown stripes, clover, a scorched brown patch, dandelion yellow.
  const tones = [
    { low: "#4f8f32", high: "#7ab848" },
    { low: "#8fcf55", high: "#b4e070" },
    { low: "#3b6f26", high: "#5a9638" },
    { low: "#a49a4a", high: "#c2b660" },
    { low: "#6aa63f", high: "#94c95a" },
  ] as const;
  const regions: TerrainMaterialRegion[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = spread * Math.sqrt(rng());
    const radius = 3 + rng() * 9;
    regions.push({
      shape: "circle",
      center: [cx + Math.cos(angle) * distance, cz + Math.sin(angle) * distance],
      radius,
      colors: tones[Math.floor(rng() * tones.length)]!,
      falloff: radius * 0.5,
    });
  }
  return regions;
};

const materialRegions: readonly TerrainMaterialRegion[] = [
  ...ZONES.map(
    (zone): TerrainMaterialRegion => ({
      shape: "circle",
      center: [zone.center.x, zone.center.z],
      radius: zone.flattenRadius * 0.92,
      colors: { low: "#3f7f2a", high: "#5f9e38" },
      falloff: zone.flattenRadius * 0.4,
    }),
  ),
  ...SIDE_POIS.map(
    (poi): TerrainMaterialRegion => ({
      shape: "circle",
      center: [poi.x, poi.z],
      radius: poi.radius * 0.9,
      colors: { low: "#7a6040", high: "#947752" },
      falloff: poi.radius * 0.4,
    }),
  ),
  ...[...ROUTES, ...SPUR_ROUTES].map(
    (route): TerrainMaterialRegion => ({
      shape: "polyline",
      points: roadPoints(route.points),
      width: 16,
      colors: { low: "#8a8a82", high: "#a3a39a" },
      falloff: 9,
    }),
  ),
  ...ZONES.flatMap((zone) =>
    speckleRegions(
      zone.center.x,
      zone.center.z,
      zone.flattenRadius * 1.6,
      zone.id === "rustflat_waste" ? 90 : 36,
      `scrap-speckle-${zone.id}`,
    ),
  ),
  ...speckleRegions(ZONES[0]!.center.x + 18, ZONES[0]!.center.z + 34, 40, 40, "scrap-speckle-spawn"),
];

const terrainDescriptor = terrain({
  ...TERRAIN_BASE,
  materialRegions,
  detail: {
    // Cliff faces go cooler and darker than the flats so relief separates by value, not just by
    // slope shading — the old near-ground-coloured rock made every hill a smooth brown blob.
    rockColor: SUBURB.cliff,
    sandColor: SUBURB.sand,
    snowColor: "#f2f6f8",
    // Low enough that dune flanks and gully walls pick up rock, not just cliff faces — at 0.28 the
    // only geometry steep enough to qualify was the far mesas, so everything walkable was one hue.
    rockSlopeStart: 0.24,
    snowHeight: 999,
    detailScale: 9,
    macroScale: 70,
    roughness: 0.95,
    strength: 1,
    // The shader's default "wet pocket" sweep is green-leaning — meadow moss painted onto a desert
    // is what made whole hillsides read olive. Dry stays bleached sandstone; wet becomes darker
    // compacted soil, so the patchwork breaks up the flats without leaving the warm palette.
    sweeps: { dry: [1.08, 1.06, 0.78], wet: [0.78, 0.9, 0.7] },
    // Real dirt grain over the procedural base. Without this the ground is pure vertex colour, which
    // is what made the flats read as untextured mush at every distance.
    // Grain, not repaint: `tint` low keeps the biome palette, the macro sweeps, and the slope-rock
    // blend visible and takes only the map's light and shade. At the default 1 the dirt albedo
    // painted over all of it and every region came out the same flat tan.
    material: { maps: GROUND_MAPS, repeat: 8, strength: 1, tint: 0.3 },
  },
  flatten: [
    ...ZONES.map((zone) => ({
      center: [zone.center.x, zone.center.z] as const,
      radius: zone.flattenRadius,
    })),
    ...poiFlattenMasks((x, z) => rawField.sampleHeight(x, z)),
  ],
  pathProfiles: roadPathProfiles((x, z) => rawField.sampleHeight(x, z)),
});

// Overgrown lawn: nobody has mowed since the update went out. Shaded roots into sunlit tips, with
// dandelion-yellow accents in pockets, so the yards read as growth rather than one stamped blade.
const scrubClump = (x: number, z: number, size: number, seed: string): GrassEnvironmentDescriptor =>
  grass({
    area: { w: size, d: size, position: [x, z] },
    species: "overgrown-lawn",
    colour: { baseColor: "#2f6b22", tipColor: "#9fd35a" },
    seed,
    mix: { mixShare: 0.12, mixHeight: 1.8, mixColor: "#f4e04d" },
  });

const scrubClumps = (
  cx: number,
  cz: number,
  spread: number,
  count: number,
  seed: string,
  size: readonly [number, number] = [9, 6],
): GrassEnvironmentDescriptor[] => {
  const rng = seededRng(seed);
  const clumps: GrassEnvironmentDescriptor[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = spread * (0.15 + rng() * 0.85);
    clumps.push(scrubClump(cx + Math.cos(angle) * distance, cz + Math.sin(angle) * distance, size[0] + rng() * size[1], `${seed}-${index}`));
  }
  return clumps;
};

// Opening scrub is editor-owned. Remote zones retain their legacy generation until their pass.
const vegetation: readonly GrassEnvironmentDescriptor[] = [
  ...ZONES.slice(1).flatMap((zone) => scrubClumps(zone.center.x, zone.center.z, zone.flattenRadius * 1.3, 5, `scrap-scrub-${zone.id}`, [12, 6])),
  ...SIDE_POIS.flatMap((poi) => scrubClumps(poi.x, poi.z, poi.radius, 3, `scrap-scrub-${poi.id}`)),
];

// Suburban asphalt with its centre line: a mid grey, so it reads as street against the lawns
// without punching a black ribbon through the frame.
const SUBURB_ASPHALT = "#5b5d63";

const roadRibbon = (route: { points: readonly { x: number; z: number }[] }, width: number, elevation: number): RoadEnvironmentDescriptor =>
  road({
    path: roadPoints(route.points),
    width,
    color: SUBURB_ASPHALT,
    markings: true,
    sidewalk: false,
    elevation,
  });

const roads: readonly RoadEnvironmentDescriptor[] = [
  ...ROUTES.map((route) => roadRibbon(route, 13, 0.18)),
  ...SPUR_ROUTES.map((route) => roadRibbon(route, 9, 0.24)),
];

export const world: WorldFeature = environment({
  terrain: terrainDescriptor,
  roads,
  vegetation,
  // The old sky washed to near-white at the horizon and swamped the zenith gradient, so the whole
  // upper frame was one flat grey field. A deeper zenith and lower haze restore the gradient and
  // give the ridgeline something to sit against.
  sky: sky({
    preset: "day",
    horizonColor: SUBURB.horizon,
    zenithColor: SUBURB.skyZenith,
    sunIntensity: 1.1,
    ambientIntensity: 0.62,
    radius: 2600,
    hazeStrength: 0.08,
    sunGlowStrength: 0.14,
    // An eye-level camera in a flat desert only ever sees the bottom slice of the dome. At the 0.65
    // default the zenith hue stays banked overhead and every frame is a horizon wash — the reason
    // this sky read as one flat grey band despite an authored blue.
    gradientExponent: 0.2,
    cloudiness: 0.16,
    // The single fog source for the game (`backdrop.fog` is deliberately unset — two fog configs
    // fought here before). `far` has to clear the ridgelines: at 1500 against a 2600-unit sky dome
    // the whole upper frame saturated to flat fog and the zenith gradient never showed.
    // Aerial perspective is the depth cue this world has and was not using: at near 500 nothing
    // within the playable bowl hazed at all, so a ridge two kilometres out read at the same value
    // as the sand underfoot and the whole frame flattened.
    fog: { color: SUBURB.haze, near: 90, far: 2400 },
  }),
  structures: ZONES.filter((zone) => zone.settlement !== undefined).map((zone) => {
    const settlement = zone.settlement!;
    return building({
      position: [zone.center.x, zone.center.z],
      count: settlement.count,
      footprint: { w: settlement.footprint, d: settlement.footprint },
      stories: [settlement.stories[0], settlement.stories[1]],
      storyHeight: 3,
      spacing: 5,
      style: settlement.style,
      // Houses have pitched roofs; the strip mall and the Estates keep flat ones with their clutter.
      roof: settlement.style === "village" ? "gable" : "flat",
      // Houses: a front door on a porch step, a garage door, windows all round.
      ...(settlement.style === "village" ? { ground: "house" as const } : {}),
      // A house's door and garage take the zone's accent; windows are sky glass; trim and steps cream.
      ...(settlement.palette !== undefined
        ? { palette: { ...settlement.palette, ...(settlement.style === "village" ? { shutter: settlement.palette.storefront ?? "#3d7fc4", window: "#9ad4ff", corner: "#f2efe6" } : {}) } }
        : {}),
      seed: `${FERRALON_SEED}-${zone.id}`,
    });
  }),
});

export const terrainField: TerrainField = resolveTerrainField(terrainDescriptor);

export const physics: PhysicsConfig = { gravity: -30, jumpVelocity: 8.4, projectileObstacles: true };
