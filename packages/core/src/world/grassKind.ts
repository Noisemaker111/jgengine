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

/** The editor volume kind marking a box as a GPU grass patch. */
export const GRASS_FIELD_KIND = "grass_field";

/** Fully-defaulted grass params parsed from a volume's `meta`. */
export interface GrassRules {
  /** Blades per square meter (the shell caps by an instance budget). */
  density: number;
  /** Blade height in meters. */
  bladeHeight: number;
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
  /** Seed string; same seed reproduces the same blade layout. */
  seed: string;
}

/** Grass defaults: a lush, lightly-swaying meadow. */
export const GRASS_DEFAULTS: GrassRules = {
  density: 4,
  bladeHeight: 0.6,
  colorBase: "#3f6f37",
  colorTip: "#9ac25a",
  colorVariation: 0.35,
  windStrength: 0.22,
  windSpeed: 1.6,
  windGust: 0.16,
  roughness: 0.85,
  seed: "",
};

/** The grass parameter schema — drives the inspector and `meta` parse via the studio seam. */
export const GRASS_SCHEMA: ParamSchema = {
  fields: [
    { type: "range", key: "density", label: "density", min: 0.5, max: 16, step: 0.5, default: GRASS_DEFAULTS.density, unit: "/m²" },
    { type: "range", key: "bladeHeight", label: "blade height", min: 0.1, max: 2, step: 0.05, default: GRASS_DEFAULTS.bladeHeight, unit: "m" },
    { type: "color", key: "colorBase", label: "base color", default: GRASS_DEFAULTS.colorBase },
    { type: "color", key: "colorTip", label: "tip color", default: GRASS_DEFAULTS.colorTip },
    { type: "range", key: "colorVariation", label: "color variation", min: 0, max: 1, step: 0.02, default: GRASS_DEFAULTS.colorVariation },
    { type: "range", key: "windStrength", label: "wind strength", min: 0, max: 1, step: 0.01, default: GRASS_DEFAULTS.windStrength },
    { type: "range", key: "windSpeed", label: "wind speed", min: 0, max: 4, step: 0.05, default: GRASS_DEFAULTS.windSpeed },
    { type: "range", key: "windGust", label: "gust scale", min: 0, max: 1, step: 0.02, default: GRASS_DEFAULTS.windGust },
    { type: "range", key: "roughness", label: "roughness", min: 0, max: 1, step: 0.02, default: GRASS_DEFAULTS.roughness },
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
  return {
    density: Math.max(0, metaNumber(meta, "density", GRASS_DEFAULTS.density)),
    bladeHeight: Math.max(0.05, metaNumber(meta, "bladeHeight", GRASS_DEFAULTS.bladeHeight)),
    colorBase: metaString(meta, "colorBase", GRASS_DEFAULTS.colorBase),
    colorTip: metaString(meta, "colorTip", GRASS_DEFAULTS.colorTip),
    colorVariation: metaNumber(meta, "colorVariation", GRASS_DEFAULTS.colorVariation),
    windStrength: metaNumber(meta, "windStrength", GRASS_DEFAULTS.windStrength),
    windSpeed: metaNumber(meta, "windSpeed", GRASS_DEFAULTS.windSpeed),
    windGust: metaNumber(meta, "windGust", GRASS_DEFAULTS.windGust),
    roughness: metaNumber(meta, "roughness", GRASS_DEFAULTS.roughness),
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
    resolve: (object) => resolveGrassObject(object),
    note: (object) => {
      const resolved = resolveGrassObject(object);
      if (resolved === null) return "Give the volume a box footprint.";
      const area = resolved.size[0] * resolved.size[1];
      return `${Math.round(resolved.size[0])}×${Math.round(resolved.size[1])} m · ≈${Math.round(area * resolved.rules.density).toLocaleString()} blades`;
    },
  });
}
