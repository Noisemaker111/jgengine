import type { EnvironmentVec2, TerrainCoast, TerrainColors, TerrainMaterial, TerrainMaterialRegion } from "../world/features";
import { pointInPolygon } from "../world/polygon";
import { buildPolylineIndex, type PolylineIndex } from "../world/polylineIndex";
import type { SceneDocumentLike, ScenePathLike } from "../world/sceneShapes";
import type { TerrainPathProfile } from "./pathTerrain";
import { fractalNoise, seedFrom, seedPhase } from "./terrain";

/** Scene kinds a surveyed landmass reads: shore outlines, summits, mountain chains, hills, cliffs, rivers and biome outlines. */
export const SURVEY_KINDS = {
  /** Closed path: one landmass's shoreline. */
  coast: "coast",
  /** Marker: a summit; `position.y` is its height, `meta.radius` its base radius, `meta.erosion` 0..1 how deeply gullies cut it. */
  peak: "peak",
  /** Path: a mountain chain; each point's `y` is the crest height there, `width` the base width, `meta.erosion` 0..1 how deeply gullies cut it. */
  ridge: "ridge",
  /** Path: a river channel cut to `meta.bed` (default 1.5 below sea level), `width` wide. */
  river: "river",
  /** Closed path: a biome outline; `meta.biome` names it, `meta.material`/`meta.colors` paint its ground. */
  biome: "biome",
  /**
   * Closed path: rolling hills inside the outline. `meta.height` is how high they rise (default 20),
   * `meta.scale` the metres between hilltops (default 160), `meta.ridged` 0..1 how sharp their crests
   * are (default 0.35), `meta.falloff` the metres over which they ease in from the edge (default 80).
   */
  hills: "hills",
  /**
   * Path: a cliff along the line. The ground left of the drawn direction (`meta.side: "right"` flips it)
   * stands `meta.height` metres higher (default 12) across a face `meta.face` metres wide (default 6), and
   * eases back to the plains over `meta.reach` metres (default 120). Its ends taper.
   */
  cliff: "cliff",
} as const;

/** A summit raised over the plains: a cone `radius` wide at its base, optionally with a crater. */
export interface SurveyPeak {
  id: string;
  at: EnvironmentVec2;
  /** Summit height above sea level. */
  height: number;
  /** Base radius where the mountain meets the plains. */
  radius: number;
  /** Profile exponent: 1 a smooth dome, 2 a sharp spire. Default 1.4. */
  sharpness?: number;
  /** A bowl cut into the summit — a volcano's mouth. */
  crater?: { radius: number; depth: number };
  /** 0..1 how deeply gullies and spurs break up the cone. Default 0. */
  erosion?: number;
}

/** A mountain chain: crest heights along a centerline, falling off to the plains across `width / 2`. */
export interface SurveyRidge {
  id: string;
  /** `[x, z, crestHeight]` along the chain. */
  points: readonly (readonly [number, number, number])[];
  /** Base width of the chain. */
  width: number;
  /** 0..1 how deeply gullies and spurs break up its flanks. Default 0. */
  erosion?: number;
}

/** Rolling hills inside an outline, eased in from its edge. */
export interface SurveyHills {
  id: string;
  ring: readonly EnvironmentVec2[];
  /** How high the hills rise over the plains. */
  height: number;
  /** Metres between hilltops. */
  scale: number;
  /** 0 round hills, 1 sharp-crested ones. */
  ridged: number;
  /** Metres inside the outline over which the hills ease in. */
  falloff: number;
  seed: string;
}

/** A cliff along a line: one side stands `height` higher, across a face `face` metres wide. */
export interface SurveyCliff {
  id: string;
  points: readonly EnvironmentVec2[];
  height: number;
  face: number;
  /** Metres the raised side holds before it eases back to the plains. */
  reach: number;
  /** `1`: the raised side is left of the drawn direction; `-1`: right. */
  side: 1 | -1;
}

/** A river channel carved through the land to `bed`, banks easing back over `width / 2`. */
export interface SurveyRiver {
  id: string;
  points: readonly EnvironmentVec2[];
  width: number;
  /** Bed height; below sea level lets the sea fill the channel. */
  bed: number;
}

/** A named biome outline with the ground it paints. */
export interface SurveyBiome {
  id: string;
  /** What kind of place it is (`"snow"`, `"swamp"`, `"redwood"`); several outlines may share one. */
  biome: string;
  ring: readonly EnvironmentVec2[];
  material?: TerrainMaterial;
  colors?: TerrainColors;
  /** Ground blend width past the outline. */
  falloff?: number;
}

/** Everything a surveyed landmass is built from: shores, summits, chains, hills, cliffs, rivers and biomes. */
export interface Survey {
  coasts: readonly (readonly EnvironmentVec2[])[];
  peaks: readonly SurveyPeak[];
  ridges: readonly SurveyRidge[];
  hills: readonly SurveyHills[];
  cliffs: readonly SurveyCliff[];
  rivers: readonly SurveyRiver[];
  biomes: readonly SurveyBiome[];
}

/** The rolling ground between the mountains. */
export interface SurveyPlains {
  /** Mean plains height above sea level. Default 8. */
  height?: number;
  /** How far the plains roll above and below `height`. Default 6. */
  roll?: number;
  /** Rolls per metre. Default 0.004. */
  frequency?: number;
  /** Fraction of a mountain's height that stays as rock noise on its flanks, 0..1. Default 0.08. */
  rugged?: number;
  seed?: string;
}

const xz = (point: { x: number; z: number }): EnvironmentVec2 => [point.x, point.z];

function num(meta: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function str(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = meta?.[key];
  return typeof value === "string" ? value : undefined;
}

function pathsOf(doc: SceneDocumentLike, kind: string): readonly ScenePathLike[] {
  return doc.paths.filter((path) => path.kind === kind);
}

/**
 * Reads a landmass survey from a scene document: `coast`, `hills` and `biome` outlines, `peak` markers,
 * `ridge`, `cliff` and `river` paths (see {@link SURVEY_KINDS}). Pure; the document stays the one place the map lives.
 *
 * @capability survey-terrain build a real-world-style landmass (shores, summits, chains, rivers, biomes) from authored scene shapes
 */
export function surveyFromDocument(doc: SceneDocumentLike): Survey {
  return {
    coasts: pathsOf(doc, SURVEY_KINDS.coast)
      .filter((path) => path.points.length >= 3)
      .map((path) => path.points.map(xz)),
    peaks: doc.markers
      .filter((marker) => marker.kind === SURVEY_KINDS.peak)
      .map((marker) => {
        const craterRadius = num(marker.meta, "craterRadius");
        const sharpness = num(marker.meta, "sharpness");
        const erosion = num(marker.meta, "erosion");
        return {
          id: marker.id,
          at: xz(marker.position),
          height: marker.position.y,
          radius: Math.max(1, num(marker.meta, "radius") ?? 60),
          ...(sharpness === undefined ? {} : { sharpness }),
          ...(erosion === undefined ? {} : { erosion: clamp01(erosion) }),
          ...(craterRadius === undefined ? {} : { crater: { radius: craterRadius, depth: num(marker.meta, "craterDepth") ?? craterRadius * 0.4 } }),
        };
      }),
    ridges: pathsOf(doc, SURVEY_KINDS.ridge)
      .filter((path) => path.points.length >= 2)
      .map((path) => {
        const erosion = num(path.meta, "erosion");
        return {
          id: path.id,
          points: path.points.map((point) => [point.x, point.z, point.y] as const),
          width: Math.max(1, path.width ?? 120),
          ...(erosion === undefined ? {} : { erosion: clamp01(erosion) }),
        };
      }),
    hills: pathsOf(doc, SURVEY_KINDS.hills)
      .filter((path) => path.points.length >= 3)
      .map((path) => ({
        id: path.id,
        ring: path.points.map(xz),
        height: num(path.meta, "height") ?? 20,
        scale: Math.max(10, num(path.meta, "scale") ?? 160),
        ridged: clamp01(num(path.meta, "ridged") ?? 0.35),
        falloff: Math.max(1, num(path.meta, "falloff") ?? 80),
        seed: str(path.meta, "seed") ?? path.id,
      })),
    cliffs: pathsOf(doc, SURVEY_KINDS.cliff)
      .filter((path) => path.points.length >= 2)
      .map((path) => ({
        id: path.id,
        points: path.points.map(xz),
        height: num(path.meta, "height") ?? 12,
        face: Math.max(0.5, num(path.meta, "face") ?? 6),
        reach: Math.max(1, num(path.meta, "reach") ?? 120),
        side: str(path.meta, "side") === "right" ? -1 : 1,
      })),
    rivers: pathsOf(doc, SURVEY_KINDS.river)
      .filter((path) => path.points.length >= 2)
      .map((path) => ({ id: path.id, points: path.points.map(xz), width: Math.max(1, path.width ?? 16), bed: num(path.meta, "bed") ?? -1.5 })),
    biomes: pathsOf(doc, SURVEY_KINDS.biome)
      .filter((path) => path.points.length >= 3)
      .map((path) => {
        const material = str(path.meta, "material") as TerrainMaterial | undefined;
        const colors = path.meta?.["colors"] as TerrainColors | undefined;
        const falloff = num(path.meta, "falloff");
        return {
          id: path.id,
          biome: str(path.meta, "biome") ?? path.id,
          ring: path.points.map(xz),
          ...(material === undefined ? {} : { material }),
          ...(colors === undefined ? {} : { colors }),
          ...(falloff === undefined ? {} : { falloff }),
        };
      }),
  };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smooth01(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Cheap deterministic rolling noise in about [-1, 1], phase-shifted by a seed. */
function roll(x: number, z: number, frequency: number, phase: number): number {
  const a = Math.sin(x * frequency + phase) * Math.cos(z * frequency * 0.83 - phase * 0.7);
  const b = Math.sin((x * 0.6 + z) * frequency * 2.1 + phase * 1.9) * 0.5;
  const c = Math.sin((x - z * 0.7) * frequency * 4.3 + phase * 2.9) * 0.25;
  return (a + b + c) / 1.75;
}

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function boundsOf(points: readonly EnvironmentVec2[], pad: number): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

function inBounds(b: Bounds, x: number, z: number): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

interface IndexedRidge {
  ridge: SurveyRidge;
  index: PolylineIndex;
  seed: number;
}

interface IndexedHills {
  hills: SurveyHills;
  edge: PolylineIndex;
  bounds: Bounds;
  seed: number;
}

interface IndexedCliff {
  cliff: SurveyCliff;
  index: PolylineIndex;
  bounds: Bounds;
  /** Distance along the line at each point, for tapering the two ends. */
  along: readonly number[];
}

/** How much of an eroded mountain's rise its deepest gullies take away, at erosion 1. */
const GULLY_DEPTH = 0.45;

/** 0 on a spur's crest to 1 in a gully floor, with gullies about `size` metres apart. */
function gully(x: number, z: number, size: number, seed: number): number {
  return 0.5 + 0.5 * fractalNoise(x, z, { seed, frequency: 1 / size, octaves: 3, lacunarity: 2.1, persistence: 0.5, ridged: true });
}

function hillsRise(entry: IndexedHills, x: number, z: number): number {
  const { hills } = entry;
  if (!inBounds(entry.bounds, x, z) || !pointInPolygon(hills.ring, x, z)) return 0;
  const edge = entry.edge.nearest(x, z, hills.falloff);
  const mask = edge === null ? 1 : smooth01(edge.distance / hills.falloff);
  if (mask <= 0) return 0;
  // Separate hills with plains between them: negative noise stays at plains level, so no outline shows.
  const round = fractalNoise(x, z, { seed: entry.seed, frequency: 1 / hills.scale, octaves: 3, lacunarity: 2, persistence: 0.4, ridged: false });
  let shape = smooth01(round * 1.8 + 0.15);
  if (shape <= 0) return 0;
  if (hills.ridged > 0) {
    const crest = fractalNoise(x, z, { seed: entry.seed + 7, frequency: 1.3 / hills.scale, octaves: 2, lacunarity: 2, persistence: 0.4, ridged: true }) * 0.5 + 0.5;
    shape *= Math.min(1, 1 - hills.ridged * 0.6 + hills.ridged * crest);
  }
  return mask * hills.height * shape;
}

function cliffRise(entry: IndexedCliff, x: number, z: number): number {
  const { cliff } = entry;
  if (!inBounds(entry.bounds, x, z)) return 0;
  const half = cliff.face / 2;
  const hit = entry.index.nearest(x, z, half + cliff.reach);
  if (hit === null) return 0;
  const a = cliff.points[hit.segment];
  const b = cliff.points[hit.segment + 1] ?? a;
  if (a === undefined || b === undefined) return 0;
  // The cross product's sign says which side of the line the point is on.
  const cross = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const signed = (cross >= 0 ? 1 : -1) * cliff.side * hit.distance;
  if (signed < -half) return 0;
  const step = smooth01((signed + half) / cliff.face);
  const hold = signed <= half ? 1 : 1 - smooth01((signed - half) / cliff.reach);
  const from = entry.along[hit.segment] ?? 0;
  const to = entry.along[hit.segment + 1] ?? from;
  const at = from + (to - from) * hit.t;
  const length = entry.along[entry.along.length - 1] ?? 0;
  const taper = Math.min(cliff.reach, length / 3);
  const ends = taper <= 0 ? 1 : smooth01(Math.min(at, length - at) / taper);
  return cliff.height * step * hold * ends;
}

function indexHills(hills: SurveyHills): IndexedHills {
  const first = hills.ring[0];
  const closed = first === undefined ? hills.ring : [...hills.ring, first];
  return { hills, edge: buildPolylineIndex(closed, hills.falloff), bounds: boundsOf(hills.ring, 0), seed: seedFrom(hills.seed, 1) };
}

function indexCliff(cliff: SurveyCliff): IndexedCliff {
  const along: number[] = [];
  let total = 0;
  let previous: EnvironmentVec2 | undefined;
  for (const point of cliff.points) {
    if (previous !== undefined) total += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    along.push(total);
    previous = point;
  }
  const reach = cliff.face + cliff.reach;
  return { cliff, index: buildPolylineIndex(cliff.points, reach), bounds: boundsOf(cliff.points, reach), along };
}

/**
 * The surveyed ground height before the shore is applied: rolling plains, hills inside their outlines,
 * cliffs along their lines, every summit as a cone (with its crater), every chain as a crest falling off
 * to the plains. Mountains rise out of the plains with a rock roughness that grows with height, and an
 * eroded one is cut by gullies. Pure and deterministic; feed it to `terrain({ heightField })` with
 * {@link surveyTerrain}'s coast so the shore eases it down to the beach.
 * @capability survey-terrain build a real-world-style landmass (shores, summits, chains, rivers, biomes) from scene shapes and ask it where land and biomes are
 */
export function surveyHeightField(survey: Survey, plains: SurveyPlains = {}): (x: number, z: number) => number {
  const height = plains.height ?? 8;
  const rollHeight = plains.roll ?? 6;
  const frequency = plains.frequency ?? 0.004;
  const rugged = plains.rugged ?? 0.08;
  const phase = seedPhase(plains.seed ?? "survey");
  const ridges: IndexedRidge[] = survey.ridges.map((ridge) => ({
    ridge,
    index: buildPolylineIndex(ridge.points.map((point) => [point[0], point[1]] as const)),
    seed: seedFrom(ridge.id, 1),
  }));
  const peaks = survey.peaks.map((peak) => ({ peak, seed: seedFrom(peak.id, 1) }));
  const hills = survey.hills.map(indexHills);
  const cliffs = survey.cliffs.map(indexCliff);
  return (x, z) => {
    let ground = height + rollHeight * roll(x, z, frequency, phase);
    for (const entry of hills) ground += hillsRise(entry, x, z);
    for (const entry of cliffs) ground += cliffRise(entry, x, z);
    let mountain = 0;
    for (const { peak, seed } of peaks) {
      const distance = Math.hypot(x - peak.at[0], z - peak.at[1]);
      if (distance >= peak.radius) continue;
      let rise = peak.height * Math.pow(1 - smooth01(distance / peak.radius), peak.sharpness ?? 1.4);
      if (peak.erosion !== undefined && peak.erosion > 0) rise *= 1 - peak.erosion * GULLY_DEPTH * gully(x, z, peak.radius * 0.3, seed);
      if (peak.crater !== undefined && distance < peak.crater.radius) {
        const t = distance / peak.crater.radius;
        rise -= peak.crater.depth * (1 - t * t);
      }
      mountain = Math.max(mountain, rise);
    }
    for (const { ridge, index, seed } of ridges) {
      const half = ridge.width / 2;
      const hit = index.nearest(x, z, half);
      if (hit === null) continue;
      const a = ridge.points[hit.segment];
      const b = ridge.points[hit.segment + 1] ?? a;
      if (a === undefined || b === undefined) continue;
      const crest = a[2] + (b[2] - a[2]) * hit.t;
      let rise = crest * Math.pow(1 - smooth01(hit.distance / half), 1.2);
      if (ridge.erosion !== undefined && ridge.erosion > 0) rise *= 1 - ridge.erosion * GULLY_DEPTH * gully(x, z, half * 0.5, seed);
      mountain = Math.max(mountain, rise);
    }
    if (mountain > 0) {
      // Mountains stand on the plains and carry rock roughness in proportion to their height.
      const rock = mountain * rugged * roll(x * 3.1, z * 3.1, frequency * 2.5, phase + 1.3);
      ground = Math.max(ground, ground * 0.5 + mountain + rock);
    }
    return ground;
  };
}

/** Knobs for {@link surveyTerrain}: the plains, the shore, the sea floor. */
export interface SurveyTerrainOptions {
  plains?: SurveyPlains;
  /** Shore shaping passed to the terrain coast (falloff, shelf, sea floor, wobble). */
  shore?: Omit<TerrainCoast, "outlines" | "radius" | "center" | "stretch">;
}

/** The terrain config a survey resolves to — spread it into `terrain({ ... })`. */
export interface SurveyTerrainConfig {
  heightField: (x: number, z: number) => number;
  coast: TerrainCoast;
  materialRegions: TerrainMaterialRegion[];
  pathProfiles: TerrainPathProfile[];
}

/**
 * Turns a survey into terrain config: its height field, its shore outlines as the coast, its biomes as
 * polygon ground regions and its rivers as carved channels.
 */
export function surveyTerrain(survey: Survey, options: SurveyTerrainOptions = {}): SurveyTerrainConfig {
  return {
    heightField: surveyHeightField(survey, options.plains),
    coast: { ...(options.shore ?? {}), outlines: survey.coasts },
    materialRegions: survey.biomes
      .filter((biome) => biome.material !== undefined || biome.colors !== undefined)
      .map((biome) => ({
        shape: "polygon" as const,
        points: biome.ring,
        ...(biome.material === undefined ? {} : { material: biome.material }),
        ...(biome.colors === undefined ? {} : { colors: biome.colors }),
        ...(biome.falloff === undefined ? {} : { falloff: biome.falloff }),
      })),
    pathProfiles: survey.rivers.map((river) => ({ points: river.points, width: river.width, shoulder: river.width * 0.8, height: { kind: "fixed" as const, height: river.bed }, maxFill: 0 })),
  };
}

/**
 * The biome at a point: the last outline (in survey order) that contains it, or null outside them all.
 * @capability survey-terrain build a real-world-style landmass (shores, summits, chains, rivers, biomes) from scene shapes and ask it where land and biomes are
 */
export function surveyBiomeAt(survey: Survey, x: number, z: number): SurveyBiome | null {
  for (let i = survey.biomes.length - 1; i >= 0; i -= 1) {
    const biome = survey.biomes[i]!;
    if (pointInPolygon(biome.ring, x, z)) return biome;
  }
  return null;
}

/**
 * Whether a point is on land: inside one of the survey's shore outlines.
 * @capability survey-terrain build a real-world-style landmass (shores, summits, chains, rivers, biomes) from scene shapes and ask it where land and biomes are
 */
export function surveyIsLand(survey: Survey, x: number, z: number): boolean {
  return survey.coasts.some((ring) => pointInPolygon(ring, x, z));
}
