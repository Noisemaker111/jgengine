/**
 * `grass_field` studio: a GPU grass patch authored as a box volume — its XZ footprint is the grass
 * area, its top the ground height. Pure config here (blade/wind/color params + a footprint resolver);
 * the instanced vertex-wind grass mesh lives in the `shell` renderer, which drives the existing
 * `GrassField`. An engine environment kind (like water/scatter) so grass wind and colours are
 * slider-authorable in the editor and persisted in `editor.scene.json` — the #813 grass studio.
 *
 * @capability grass-field editor-authorable GPU grass patch
 */
import { registerSceneKind, type ParamSchema, type SceneKindObject } from "../scene/sceneKinds";
import { budgetWarning, densityCoverage } from "./scatterCoverage";

/** The editor volume kind marking a box as a GPU grass patch. */
export const GRASS_FIELD_KIND = "grass_field";

/** Fully-defaulted grass params parsed from a volume's `meta`. */
export interface GrassRules {
  /** Blades per square meter (the shell caps by an instance budget). */
  density: number;
  /** Blade height in meters. */
  bladeHeight: number;
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
  density: 12,
  bladeHeight: 0.6,
  bladeWidthMin: 0.05,
  bladeWidthMax: 0.1,
  bladeBendMin: 0.12,
  bladeBendMax: 0.42,
  tuftRadius: 0.16,
  normalLift: 0.6,
  colorBase: "#3f6f37",
  colorTip: "#9ac25a",
  colorVariation: 0.35,
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
    { type: "range", key: "density", label: "density", min: 0.5, max: 160, step: 0.5, default: GRASS_DEFAULTS.density, unit: "/m²" },
    { type: "range", key: "bladeHeight", label: "blade height", min: 0.1, max: 2, step: 0.05, default: GRASS_DEFAULTS.bladeHeight, unit: "m" },
    { type: "range", key: "bladeWidthMin", label: "minimum blade width", min: 0.005, max: 0.3, step: 0.005, default: GRASS_DEFAULTS.bladeWidthMin, unit: "m" },
    { type: "range", key: "bladeWidthMax", label: "maximum blade width", min: 0.005, max: 0.3, step: 0.005, default: GRASS_DEFAULTS.bladeWidthMax, unit: "m" },
    { type: "range", key: "bladeBendMin", label: "minimum bend", min: 0, max: 1, step: 0.01, default: GRASS_DEFAULTS.bladeBendMin },
    { type: "range", key: "bladeBendMax", label: "maximum bend", min: 0, max: 1, step: 0.01, default: GRASS_DEFAULTS.bladeBendMax },
    { type: "range", key: "tuftRadius", label: "tuft radius", min: 0, max: 0.6, step: 0.01, default: GRASS_DEFAULTS.tuftRadius, unit: "m" },
    { type: "range", key: "normalLift", label: "normal lift", min: 0, max: 1, step: 0.01, default: GRASS_DEFAULTS.normalLift },
    { type: "color", key: "colorBase", label: "base color", default: GRASS_DEFAULTS.colorBase },
    { type: "color", key: "colorTip", label: "tip color", default: GRASS_DEFAULTS.colorTip },
    { type: "range", key: "colorVariation", label: "color variation", min: 0, max: 1, step: 0.02, default: GRASS_DEFAULTS.colorVariation },
    { type: "range", key: "windStrength", label: "wind strength", min: 0, max: 1, step: 0.01, default: GRASS_DEFAULTS.windStrength },
    { type: "range", key: "windSpeed", label: "wind speed", min: 0, max: 4, step: 0.05, default: GRASS_DEFAULTS.windSpeed },
    { type: "range", key: "windGust", label: "gust scale", min: 0, max: 1, step: 0.02, default: GRASS_DEFAULTS.windGust },
    { type: "range", key: "roughness", label: "roughness", min: 0, max: 1, step: 0.02, default: GRASS_DEFAULTS.roughness },
    { type: "range", key: "groundCover", label: "ground cover", min: 0, max: 1, step: 0.02, default: GRASS_DEFAULTS.groundCover },
    { type: "seed", key: "seed", label: "seed", default: "" },
  ],
};

function metaNumber(meta: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function metaString(meta: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const value = meta?.[key];
  return typeof value === "string" ? value : fallback;
}

/** Parse a volume's `meta` into fully-defaulted grass rules. @internal */
export function readGrassRules(meta: Record<string, unknown> | undefined): GrassRules {
  const widthMin = Math.max(0.005, metaNumber(meta, "bladeWidthMin", GRASS_DEFAULTS.bladeWidthMin));
  const widthMax = Math.max(0.005, metaNumber(meta, "bladeWidthMax", GRASS_DEFAULTS.bladeWidthMax));
  const bendMin = Math.max(0, Math.min(1, metaNumber(meta, "bladeBendMin", GRASS_DEFAULTS.bladeBendMin)));
  const bendMax = Math.max(0, Math.min(1, metaNumber(meta, "bladeBendMax", GRASS_DEFAULTS.bladeBendMax)));
  return {
    density: Math.max(0, metaNumber(meta, "density", GRASS_DEFAULTS.density)),
    bladeHeight: Math.max(0.05, metaNumber(meta, "bladeHeight", GRASS_DEFAULTS.bladeHeight)),
    bladeWidthMin: Math.min(widthMin, widthMax),
    bladeWidthMax: Math.max(widthMin, widthMax),
    bladeBendMin: Math.min(bendMin, bendMax),
    bladeBendMax: Math.max(bendMin, bendMax),
    tuftRadius: Math.max(0, metaNumber(meta, "tuftRadius", GRASS_DEFAULTS.tuftRadius)),
    normalLift: Math.max(0, Math.min(1, metaNumber(meta, "normalLift", GRASS_DEFAULTS.normalLift))),
    colorBase: metaString(meta, "colorBase", GRASS_DEFAULTS.colorBase),
    colorTip: metaString(meta, "colorTip", GRASS_DEFAULTS.colorTip),
    colorVariation: metaNumber(meta, "colorVariation", GRASS_DEFAULTS.colorVariation),
    windStrength: metaNumber(meta, "windStrength", GRASS_DEFAULTS.windStrength),
    windSpeed: metaNumber(meta, "windSpeed", GRASS_DEFAULTS.windSpeed),
    windGust: metaNumber(meta, "windGust", GRASS_DEFAULTS.windGust),
    roughness: metaNumber(meta, "roughness", GRASS_DEFAULTS.roughness),
    groundCover: Math.max(0, Math.min(1, metaNumber(meta, "groundCover", GRASS_DEFAULTS.groundCover))),
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
