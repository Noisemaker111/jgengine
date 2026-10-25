/**
 * The one grass model. Every grass patch — an editor `grass_field` volume or an `environment({
 * vegetation: grass(...) })` band — resolves to the same {@link GrassRules} and the shell draws it
 * with the same instanced vertex-wind blade field over a turf mat. Knobs cover species (a base
 * blade and an accent blade mixed through the field), colour, height, density, wind and clumping,
 * so two games never have to look alike; the density floor ({@link GRASS_MIN_DENSITY}) keeps any
 * patch from reading as a tuft every few feet.
 *
 * @capability grass-field editor-authorable GPU grass patch
 */
import { registerSceneKind, type ParamSchema, type SceneKindObject } from "../scene/sceneKinds";
import { budgetWarning, densityCoverage } from "./scatterCoverage";

/** The editor volume kind marking a box as a GPU grass patch. */
export const GRASS_FIELD_KIND = "grass_field";

/**
 * Lowest blade density a patch renders at, in blades per square metre. Below it, blades stand
 * apart and the ground shows between every tuft; authored values under it are raised to it.
 */
export const GRASS_MIN_DENSITY = 40;

/** Fully-defaulted grass params, read from a volume's `meta` or a `grass()` config. */
export interface GrassRules {
  /** Blades per square metre; never below {@link GRASS_MIN_DENSITY}. */
  density: number;
  /** Tallest blade height in metres. */
  bladeHeight: number;
  /** 0..1 share of `bladeHeight` blades vary below it; 0 keeps a mown, even height. */
  heightVariation: number;
  /** Blade-width range in metres; endpoints are normalized on read. */
  bladeWidthMin: number;
  bladeWidthMax: number;
  /** Bend range, 0..1. */
  bladeBendMin: number;
  bladeBendMax: number;
  /** Spread of blades around each tuft root, in metres. */
  tuftRadius: number;
  /** Normal lift toward the sky, 0..1; controls the card lighting response. */
  normalLift: number;
  /** Base (root) color, hex. */
  colorBase: string;
  /** Tip color, hex. */
  colorTip: string;
  /** Per-blade color jitter, 0..1. */
  colorVariation: number;
  /** 0..1 how much tufts gather into thick clumps with thinner turf between them; 0 is even. */
  clumping: number;
  /** Typical clump size in metres. */
  clumpSize: number;
  /** 0..1 share of tufts that grow as the accent species (seed heads, reeds, dry stalks). */
  accentShare: number;
  /** Accent blade height as a multiple of `bladeHeight`. */
  accentHeight: number;
  /** Accent tip color, hex. */
  accentColor: string;
  /** Vertex-wind sway strength, 0..1. */
  windStrength: number;
  /** Wind animation speed. */
  windSpeed: number;
  /** Gust patch scale (spatial frequency of gusts). */
  windGust: number;
  /** Blade material roughness, 0..1. */
  roughness: number;
  /**
   * Ground-cover mat strength, 0..1: the patch paints a turf surface over its footprint instead of
   * leaving the ground beneath the blades bare. 0 keeps blades only.
   */
  groundCover: number;
  /** Seed string; same seed reproduces the same blade layout. */
  seed: string;
}

/** Grass defaults: a lush, lightly-swaying meadow. */
export const GRASS_DEFAULTS: GrassRules = {
  density: 56,
  bladeHeight: 0.6,
  heightVariation: 0.3,
  bladeWidthMin: 0.05,
  bladeWidthMax: 0.1,
  bladeBendMin: 0.12,
  bladeBendMax: 0.42,
  tuftRadius: 0.16,
  normalLift: 0.6,
  colorBase: "#3f6f37",
  colorTip: "#9ac25a",
  colorVariation: 0.35,
  clumping: 0.35,
  clumpSize: 2.5,
  accentShare: 0,
  accentHeight: 1.8,
  accentColor: "#c8b46a",
  windStrength: 0.22,
  windSpeed: 1.6,
  windGust: 0.16,
  roughness: 0.85,
  groundCover: 0.9,
  seed: "",
};

/** The grass parameter schema — drives the inspector and `meta` parse via the studio seam. */
export const GRASS_SCHEMA: ParamSchema = {
  fields: [
    { type: "range", key: "density", label: "density", min: GRASS_MIN_DENSITY, max: 160, step: 1, default: GRASS_DEFAULTS.density, unit: "/m²" },
    { type: "range", key: "bladeHeight", label: "blade height", min: 0.1, max: 2, step: 0.05, default: GRASS_DEFAULTS.bladeHeight, unit: "m" },
    { type: "range", key: "heightVariation", label: "height variation", min: 0, max: 1, step: 0.02, default: GRASS_DEFAULTS.heightVariation },
    { type: "range", key: "bladeWidthMin", label: "minimum blade width", min: 0.005, max: 0.3, step: 0.005, default: GRASS_DEFAULTS.bladeWidthMin, unit: "m" },
    { type: "range", key: "bladeWidthMax", label: "maximum blade width", min: 0.005, max: 0.3, step: 0.005, default: GRASS_DEFAULTS.bladeWidthMax, unit: "m" },
    { type: "range", key: "bladeBendMin", label: "minimum bend", min: 0, max: 1, step: 0.01, default: GRASS_DEFAULTS.bladeBendMin },
    { type: "range", key: "bladeBendMax", label: "maximum bend", min: 0, max: 1, step: 0.01, default: GRASS_DEFAULTS.bladeBendMax },
    { type: "range", key: "tuftRadius", label: "tuft radius", min: 0, max: 0.6, step: 0.01, default: GRASS_DEFAULTS.tuftRadius, unit: "m" },
    { type: "range", key: "normalLift", label: "normal lift", min: 0, max: 1, step: 0.01, default: GRASS_DEFAULTS.normalLift },
    { type: "color", key: "colorBase", label: "base color", default: GRASS_DEFAULTS.colorBase },
    { type: "color", key: "colorTip", label: "tip color", default: GRASS_DEFAULTS.colorTip },
    { type: "range", key: "colorVariation", label: "color variation", min: 0, max: 1, step: 0.02, default: GRASS_DEFAULTS.colorVariation },
    { type: "range", key: "clumping", label: "clumping", group: "growth", min: 0, max: 1, step: 0.02, default: GRASS_DEFAULTS.clumping },
    { type: "range", key: "clumpSize", label: "clump size", group: "growth", min: 0.5, max: 12, step: 0.25, default: GRASS_DEFAULTS.clumpSize, unit: "m" },
    { type: "range", key: "accentShare", label: "accent share", group: "species", min: 0, max: 0.6, step: 0.01, default: GRASS_DEFAULTS.accentShare },
    { type: "range", key: "accentHeight", label: "accent height", group: "species", min: 0.5, max: 4, step: 0.05, default: GRASS_DEFAULTS.accentHeight, unit: "×" },
    { type: "color", key: "accentColor", label: "accent color", group: "species", default: GRASS_DEFAULTS.accentColor },
    { type: "range", key: "windStrength", label: "wind strength", group: "wind", min: 0, max: 1, step: 0.01, default: GRASS_DEFAULTS.windStrength },
    { type: "range", key: "windSpeed", label: "wind speed", group: "wind", min: 0, max: 4, step: 0.05, default: GRASS_DEFAULTS.windSpeed },
    { type: "range", key: "windGust", label: "gust scale", group: "wind", min: 0, max: 1, step: 0.02, default: GRASS_DEFAULTS.windGust },
    { type: "range", key: "roughness", label: "roughness", min: 0, max: 1, step: 0.02, default: GRASS_DEFAULTS.roughness },
    { type: "range", key: "groundCover", label: "ground cover", min: 0, max: 1, step: 0.02, default: GRASS_DEFAULTS.groundCover },
    { type: "seed", key: "seed", label: "seed", default: "" },
  ],
};

function metaNumber(meta: Readonly<Record<string, unknown>> | undefined, key: string, fallback: number): number {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function metaString(meta: Readonly<Record<string, unknown>> | undefined, key: string, fallback: string): string {
  const value = meta?.[key];
  return typeof value === "string" ? value : fallback;
}

const unit = (value: number): number => Math.max(0, Math.min(1, value));

/** Parse a volume's `meta` (or a `grass()` config) into fully-defaulted grass rules, density floored. @internal */
export function readGrassRules(meta: Readonly<Record<string, unknown>> | undefined): GrassRules {
  const widthMin = Math.max(0.005, metaNumber(meta, "bladeWidthMin", GRASS_DEFAULTS.bladeWidthMin));
  const widthMax = Math.max(0.005, metaNumber(meta, "bladeWidthMax", GRASS_DEFAULTS.bladeWidthMax));
  const bendMin = unit(metaNumber(meta, "bladeBendMin", GRASS_DEFAULTS.bladeBendMin));
  const bendMax = unit(metaNumber(meta, "bladeBendMax", GRASS_DEFAULTS.bladeBendMax));
  return {
    density: Math.max(GRASS_MIN_DENSITY, metaNumber(meta, "density", GRASS_DEFAULTS.density)),
    bladeHeight: Math.max(0.05, metaNumber(meta, "bladeHeight", GRASS_DEFAULTS.bladeHeight)),
    heightVariation: unit(metaNumber(meta, "heightVariation", GRASS_DEFAULTS.heightVariation)),
    bladeWidthMin: Math.min(widthMin, widthMax),
    bladeWidthMax: Math.max(widthMin, widthMax),
    bladeBendMin: Math.min(bendMin, bendMax),
    bladeBendMax: Math.max(bendMin, bendMax),
    tuftRadius: Math.max(0, metaNumber(meta, "tuftRadius", GRASS_DEFAULTS.tuftRadius)),
    normalLift: unit(metaNumber(meta, "normalLift", GRASS_DEFAULTS.normalLift)),
    colorBase: metaString(meta, "colorBase", GRASS_DEFAULTS.colorBase),
    colorTip: metaString(meta, "colorTip", GRASS_DEFAULTS.colorTip),
    colorVariation: unit(metaNumber(meta, "colorVariation", GRASS_DEFAULTS.colorVariation)),
    clumping: unit(metaNumber(meta, "clumping", GRASS_DEFAULTS.clumping)),
    clumpSize: Math.max(0.5, metaNumber(meta, "clumpSize", GRASS_DEFAULTS.clumpSize)),
    accentShare: unit(metaNumber(meta, "accentShare", GRASS_DEFAULTS.accentShare)),
    accentHeight: Math.max(0.1, metaNumber(meta, "accentHeight", GRASS_DEFAULTS.accentHeight)),
    accentColor: metaString(meta, "accentColor", GRASS_DEFAULTS.accentColor),
    windStrength: metaNumber(meta, "windStrength", GRASS_DEFAULTS.windStrength),
    windSpeed: metaNumber(meta, "windSpeed", GRASS_DEFAULTS.windSpeed),
    windGust: metaNumber(meta, "windGust", GRASS_DEFAULTS.windGust),
    roughness: unit(metaNumber(meta, "roughness", GRASS_DEFAULTS.roughness)),
    groundCover: unit(metaNumber(meta, "groundCover", GRASS_DEFAULTS.groundCover)),
    seed: metaString(meta, "seed", GRASS_DEFAULTS.seed),
  };
}

/** A resolved grass patch: world-space area center at ground height, footprint size (XZ), and rules. */
export interface ResolvedGrass {
  center: readonly [number, number, number];
  size: readonly [number, number];
  rules: GrassRules;
}

function axis(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Resolve a grass volume into an area footprint (from box half-extents / radius) at the box base. @internal */
export function resolveGrassObject(object: SceneKindObject): ResolvedGrass | null {
  const center = object.center ?? object.position;
  if (center === undefined) return null;
  const he = object.halfExtents;
  const radius = object.radius;
  const halfX = axis(he?.x) ?? radius ?? 10;
  const halfZ = axis(he?.z) ?? radius ?? 10;
  const halfY = axis(he?.y) ?? 0;
  return {
    center: [center.x, center.y - halfY, center.z],
    size: [Math.max(0.5, halfX * 2), Math.max(0.5, halfZ * 2)],
    rules: readGrassRules(object.meta),
  };
}

/** Registers the `grass_field` scene kind (schema + resolver). Called by {@link registerBuiltinSceneKinds}. @internal */
export function registerGrassKind(): void {
  registerSceneKind<ResolvedGrass | null>({
    kind: GRASS_FIELD_KIND,
    target: "volume",
    label: "Grass field",
    addCategory: "Studios",
    accent: "#7fbf4d",
    schema: GRASS_SCHEMA,
    coverage: { spec: "grass_field", densityKey: "density" },
    resolve: (object) => resolveGrassObject(object),
    note: (object) => {
      const resolved = resolveGrassObject(object);
      if (resolved === null) return "Give the volume a box footprint.";
      const area = resolved.size[0] * resolved.size[1];
      const coverage = densityCoverage("grass_field", area, resolved.rules.density);
      return `${Math.round(resolved.size[0])}×${Math.round(resolved.size[1])} m · ≈ ${coverage.count.toLocaleString()} blades${budgetWarning(coverage)}`;
    },
  });
}
