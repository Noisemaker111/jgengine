import type { EnvironmentVec2, TerrainCoast, TerrainColors, TerrainMaterial, TerrainMaterialRegion } from "../world/features";
import { pointInPolygon } from "../world/polygon";
import { buildPolylineIndex, type PolylineIndex } from "../world/polylineIndex";
import type { SceneDocumentLike, ScenePathLike } from "../world/sceneShapes";
import type { TerrainPathProfile } from "./pathTerrain";

/** Scene kinds a surveyed landmass reads: shore outlines, summits, mountain chains, rivers and biome outlines. */
export const SURVEY_KINDS = {
  /** Closed path: one landmass's shoreline. */
  coast: "coast",
  /** Marker: a summit; `position.y` is its height, `meta.radius` its base radius. */
  peak: "peak",
  /** Path: a mountain chain; each point's `y` is the crest height there, `width` the base width. */
  ridge: "ridge",
  /** Path: a river channel cut to `meta.bed` (default 1.5 below sea level), `width` wide. */
  river: "river",
  /** Closed path: a biome outline; `meta.biome` names it, `meta.material`/`meta.colors` paint its ground. */
  biome: "biome",
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
}

/** A mountain chain: crest heights along a centerline, falling off to the plains across `width / 2`. */
export interface SurveyRidge {
  id: string;
  /** `[x, z, crestHeight]` along the chain. */
  points: readonly (readonly [number, number, number])[];
  /** Base width of the chain. */
  width: number;
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

/** Everything a surveyed landmass is built from: shores, summits, chains, rivers and biomes. */
export interface Survey {
  coasts: readonly (readonly EnvironmentVec2[])[];
  peaks: readonly SurveyPeak[];
  ridges: readonly SurveyRidge[];
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
 * Reads a landmass survey from a scene document: `coast` and `biome` outlines, `peak` markers, `ridge`
 * and `river` paths (see {@link SURVEY_KINDS}). Pure; the document stays the one place the map lives.
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
        return {
          id: marker.id,
          at: xz(marker.position),
          height: marker.position.y,
          radius: Math.max(1, num(marker.meta, "radius") ?? 60),
          ...(sharpness === undefined ? {} : { sharpness }),
          ...(craterRadius === undefined ? {} : { crater: { radius: craterRadius, depth: num(marker.meta, "craterDepth") ?? craterRadius * 0.4 } }),
        };
      }),
    ridges: pathsOf(doc, SURVEY_KINDS.ridge)
      .filter((path) => path.points.length >= 2)
      .map((path) => ({ id: path.id, points: path.points.map((point) => [point.x, point.z, point.y] as const), width: Math.max(1, path.width ?? 120) })),
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

function seedPhase(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296) * Math.PI * 2;
}

interface IndexedRidge {
  ridge: SurveyRidge;
  index: PolylineIndex;
}

/**
 * The surveyed ground height before the shore is applied: rolling plains, every summit as a cone (with
 * its crater), every chain as a crest falling off to the plains. Mountains rise out of the plains with
 * a rock roughness that grows with height. Pure and deterministic; feed it to `terrain({ heightField })`
 * with {@link surveyTerrain}'s coast so the shore eases it down to the beach.
 * @capability survey-terrain build a real-world-style landmass (shores, summits, chains, rivers, biomes) from scene shapes and ask it where land and biomes are
 */
export function surveyHeightField(survey: Survey, plains: SurveyPlains = {}): (x: number, z: number) => number {
  const height = plains.height ?? 8;
  const rollHeight = plains.roll ?? 6;
  const frequency = plains.frequency ?? 0.004;
  const rugged = plains.rugged ?? 0.08;
  const phase = seedPhase(plains.seed ?? "survey");
  const ridges: IndexedRidge[] = survey.ridges.map((ridge) => ({ ridge, index: buildPolylineIndex(ridge.points.map((point) => [point[0], point[1]] as const)) }));
  return (x, z) => {
    let ground = height + rollHeight * roll(x, z, frequency, phase);
    let mountain = 0;
    for (const peak of survey.peaks) {
      const distance = Math.hypot(x - peak.at[0], z - peak.at[1]);
      if (distance >= peak.radius) continue;
      let rise = peak.height * Math.pow(1 - smooth01(distance / peak.radius), peak.sharpness ?? 1.4);
      if (peak.crater !== undefined && distance < peak.crater.radius) {
        const t = distance / peak.crater.radius;
        rise -= peak.crater.depth * (1 - t * t);
      }
      mountain = Math.max(mountain, rise);
    }
    for (const { ridge, index } of ridges) {
      const half = ridge.width / 2;
      const hit = index.nearest(x, z, half);
      if (hit === null) continue;
      const a = ridge.points[hit.segment]!;
      const b = ridge.points[Math.min(ridge.points.length - 1, hit.segment + 1)]!;
      const crest = a[2] + (b[2] - a[2]) * hit.t;
      mountain = Math.max(mountain, crest * Math.pow(1 - smooth01(hit.distance / half), 1.2));
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
