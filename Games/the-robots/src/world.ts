import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import { resolveTerrainField, type TerrainField } from "@jgengine/core/world/terrain";
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
import { FERRALON } from "./game/palette";
import { SETTLEMENT_KITS } from "./game/world/buildingKit";
import { ROUTES, SPUR_ROUTES, SIDE_POIS, poiFlattenMasks, roadPathProfiles } from "./game/world/level";
import { WORLD_BOUNDS, ZONES } from "./game/world/zones";

export const FERRALON_SEED = "pandora-arid-badlands-2026";

const TERRAIN_BASE = {
  bounds: WORLD_BOUNDS,
  seed: FERRALON_SEED,
  material: "rock",
  height: 52,
  frequency: 0.0035,
  // Six, not five: the sixth octave is the medium-scale relief — gully lips, dune shoulders, rock
  // shelves — that separates a sculpted badlands from smooth heightmap blobs. Large forms are
  // unchanged (same seed/frequency), so authored flatten pads and roads keep their sites.
  octaves: 6,
  ridged: true,
  segments: 340,
  colors: { low: FERRALON.rockLow, high: FERRALON.rockHigh },
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
  const tones = [
    { low: "#8f6e3e", high: "#a3854c" },
    { low: "#ccae6e", high: "#e0c888" },
    { low: "#7c5c34", high: "#8f7042" },
    { low: "#b8935a", high: "#c9ac70" },
    { low: "#9a7c52", high: "#b09262" },
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
      colors: { low: "#b39058", high: "#cdae74" },
      falloff: zone.flattenRadius * 0.4,
    }),
  ),
  ...SIDE_POIS.map(
    (poi): TerrainMaterialRegion => ({
      shape: "circle",
      center: [poi.x, poi.z],
      radius: poi.radius * 0.9,
      colors: { low: "#9c7c48", high: "#b8975c" },
      falloff: poi.radius * 0.4,
    }),
  ),
  ...[...ROUTES, ...SPUR_ROUTES].map(
    (route): TerrainMaterialRegion => ({
      shape: "polyline",
      points: roadPoints(route.points),
      width: 16,
      colors: { low: "#7a5c3a", high: "#8f6e46" },
      falloff: 9,
    }),
  ),
  ...ZONES.flatMap((zone) =>
    speckleRegions(
      zone.center.x,
      zone.center.z,
      zone.flattenRadius * 1.6,
      zone.id === "windshear_waste" ? 90 : 36,
      `bl2-speckle-${zone.id}`,
    ),
  ),
  ...speckleRegions(ZONES[0]!.center.x + 18, ZONES[0]!.center.z + 34, 40, 40, "bl2-speckle-spawn"),
];

const terrainDescriptor = terrain({
  ...TERRAIN_BASE,
  materialRegions,
  detail: {
    // Cliff faces go cooler and darker than the flats so relief separates by value, not just by
    // slope shading — the old near-ground-coloured rock made every hill a smooth brown blob.
    rockColor: FERRALON.cliff,
    sandColor: FERRALON.sand,
    snowColor: "#d8cbb0",
    // Low enough that dune flanks and gully walls pick up rock, not just cliff faces — at 0.28 the
    // only geometry steep enough to qualify was the far mesas, so everything walkable was one hue.
    rockSlopeStart: 0.24,
    snowHeight: 999,
    waterLevel: -999,
    detailScale: 9,
    macroScale: 70,
    roughness: 0.95,
    strength: 1,
    // The shader's default "wet pocket" sweep is green-leaning — meadow moss painted onto a desert
    // is what made whole hillsides read olive. Dry stays bleached sandstone; wet becomes darker
    // compacted soil, so the patchwork breaks up the flats without leaving the warm palette.
    sweeps: { dry: [1.16, 1.06, 0.82], wet: [0.82, 0.74, 0.64] },
    // Real dirt grain over the procedural base. Without this the ground is pure vertex colour, which
    // is what made the flats read as untextured mush at every distance.
    // Grain, not repaint: `tint` low keeps the biome palette, the macro sweeps, and the slope-rock
    // blend visible and takes only the map's light and shade. At the default 1 the dirt albedo
    // painted over all of it and every region came out the same flat tan.
    material: { maps: GROUND_MAPS, repeat: 3.2, strength: 0.9, tint: 0.18 },
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

// Dry-grass scrub in two silhouettes: a short dense ground tuft that carries most of the coverage,
// and a sparse taller accent clump reserved for pockets — the 70/30 split that reads as vegetation
// growing where it can instead of one blade stamped everywhere.
//
// Roots lifted well off black: the old #6b5526 root meant every side-lit blade rendered as a dark
// strip against bright sand — the "black cardboard" read. Ochre roots into straw tips keeps the
// warm-world rule while the whole blade stays in a value the light can actually model.
const SCRUB_COLORS = ["#7d6434", "#a68a46", "#d8bc6e"] as const;

const scrubClump = (x: number, z: number, size: number, seed: string): GrassEnvironmentDescriptor =>
  grass({
    area: { w: size, d: size, position: [x, z] },
    // Blades per square metre. At 4.6 an individual clump was see-through — a handful of crossed
    // planes with sand between every one — which is what made the midground read as bare dirt.
    density: 8,
    // Low ground tufts: short enough to hold a silhouette and keep the ground plane readable.
    bladeHeight: [0.16, 0.48],
    bladeWidth: 0.05,
    windStrength: 0.55,
    colors: [...SCRUB_COLORS],
    seed,
    // Wind-combed curl plus a wide tuft splay: each instance reads as a bushy clump, not a lone card.
    bladeBend: [0.25, 0.6],
    tuftRadius: 0.3,
    // High brightness jitter breaks the repeated-blade read; near-full normal lift stops side-lit
    // blades from going black — the sun models the clump as a soft mound instead of dark planes.
    colorVariation: 0.45,
    normalLift: 0.8,
  });

// Tall dry accent plants — the 10% silhouette tier. Sparse on purpose: a few reeds catching light
// over the low scrub reads as growth in a protected pocket, a field of them reads as giant reeds.
const accentClump = (x: number, z: number, size: number, seed: string): GrassEnvironmentDescriptor =>
  grass({
    area: { w: size, d: size, position: [x, z] },
    density: 1.6,
    bladeHeight: [0.55, 1.0],
    bladeWidth: 0.045,
    windStrength: 0.7,
    colors: ["#8a6d38", "#c0a052", "#e2c878"],
    seed,
    bladeBend: [0.35, 0.75],
    tuftRadius: 0.22,
    colorVariation: 0.4,
    normalLift: 0.65,
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
    const x = cx + Math.cos(angle) * distance;
    const z = cz + Math.sin(angle) * distance;
    clumps.push(scrubClump(x, z, size[0] + rng() * size[1], `${seed}-${index}`));
    // Every third patch grows a small stand of tall accents inside it — height variation clustered
    // where scrub already holds, never scattered alone on open sand.
    if (index % 3 === 0) {
      clumps.push(accentClump(x + (rng() - 0.5) * 4, z + (rng() - 0.5) * 4, 3 + rng() * 3, `${seed}-acc-${index}`));
    }
  }
  return clumps;
};

const rustflat = ZONES[0]!;

const vegetation: readonly GrassEnvironmentDescriptor[] = [
  ...scrubClumps(rustflat.center.x + 18, rustflat.center.z + 34, 18, 4, "bl2-scrub-spawn"),
  // The 40–110 m band of the opening view. Zone clumps alone spread six patches over a 90 m radius,
  // which leaves the whole middle distance bare sand — the layer that separates foreground scrub
  // from the ridgeline was simply missing. Wider patches, because at this range a 9 m clump is a
  // smudge, and inside the 150 m where blades still render at all.
  ...scrubClumps(rustflat.center.x + 18, rustflat.center.z + 34, 70, 5, "bl2-scrub-spawn-midfield", [16, 8]),
  ...ZONES.flatMap((zone) => scrubClumps(zone.center.x, zone.center.z, zone.flattenRadius * 1.3, 5, `bl2-scrub-${zone.id}`, [12, 6])),
  ...SIDE_POIS.flatMap((poi) => scrubClumps(poi.x, poi.z, poi.radius, 3, `bl2-scrub-${poi.id}`)),
];

// Lighter than the old #5c4529: against sun-bleached sand that value read as an asphalt-black
// ribbon; compacted dirt should sit a step below the sand, not ten.
const FERRALON_DIRT_ROAD = "#71583a";

const roadRibbon = (route: { points: readonly { x: number; z: number }[] }, width: number, elevation: number): RoadEnvironmentDescriptor =>
  road({
    path: roadPoints(route.points),
    width,
    color: FERRALON_DIRT_ROAD,
    markings: false,
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
    horizonColor: FERRALON.horizon,
    zenithColor: FERRALON.skyZenith,
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
    fog: { color: FERRALON.haze, near: 90, far: 2400 },
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
      kit: SETTLEMENT_KITS[settlement.style],
      ...(settlement.palette !== undefined ? { palette: settlement.palette } : {}),
      seed: `${FERRALON_SEED}-${zone.id}`,
    });
  }),
});

export const terrainField: TerrainField = resolveTerrainField(terrainDescriptor);

export const physics: PhysicsConfig = { gravity: -30, jumpVelocity: 8.4, projectileObstacles: true };
