/**
 * `soil` studio: a crack/moss ground-variation patch authored as a box volume — its XZ footprint is
 * the patch area, its top the ground height (same footprint convention as `grass_field`). Pure config
 * here (crack scale/intensity/color, moss coverage/color, seed + a footprint resolver); the Worley
 * (cellular) crack mask and FBM moss mask, injected via `onBeforeCompile` into a soil-patch material
 * built from the same noise machinery as the terrain detail material, live in the `shell` renderer. An
 * engine environment kind (like water/grass_field) so cracked, mossy ground is slider-authorable in
 * the editor and persisted in `editor.scene.json` — the #815 soil studio.
 */
import { registerSceneKind, type ParamSchema, type SceneKindObject } from "../scene/sceneKinds";

/**
 * The editor volume kind marking a box as a soil crack/moss patch.
 * @capability soil-patch editor-authorable terrain crack/moss material variation
 */
export const SOIL_KIND = "soil";

/** Fully-defaulted soil params parsed from a volume's `meta`. */
export interface SoilRules {
  /** Underlying dirt/soil base tint, hex. */
  baseColor: string;
  /** Worley cell size in meters — larger cells read as bigger cracked-earth plates. */
  crackScale: number;
  /** Crack-line color blended into the cell boundaries, hex. */
  crackColor: string;
  /** Crack blend strength, 0..1. */
  crackIntensity: number;
  /** Moss patch color, hex. */
  mossColor: string;
  /** Fraction of the patch covered by moss, 0..1. */
  mossCoverage: number;
  /** Seed string; same seed reproduces the same crack/moss layout. */
  seed: string;
}

/** Soil defaults: sun-cracked dirt with light moss creep. */
export const SOIL_DEFAULTS: SoilRules = {
  baseColor: "#8a7256",
  crackScale: 3,
  crackColor: "#42301f",
  crackIntensity: 0.65,
  mossColor: "#5c7a3a",
  mossCoverage: 0.22,
  seed: "",
};

/** The soil parameter schema — drives the inspector and `meta` parse via the studio seam. */
export const SOIL_SCHEMA: ParamSchema = {
  fields: [
    { type: "color", key: "baseColor", label: "base color", default: SOIL_DEFAULTS.baseColor },
    { type: "range", key: "crackScale", label: "crack scale", min: 0.5, max: 12, step: 0.25, default: SOIL_DEFAULTS.crackScale, unit: "m" },
    { type: "color", key: "crackColor", label: "crack color", default: SOIL_DEFAULTS.crackColor },
    { type: "range", key: "crackIntensity", label: "crack intensity", min: 0, max: 1, step: 0.02, default: SOIL_DEFAULTS.crackIntensity },
    { type: "color", key: "mossColor", label: "moss color", default: SOIL_DEFAULTS.mossColor },
    { type: "range", key: "mossCoverage", label: "moss coverage", min: 0, max: 1, step: 0.02, default: SOIL_DEFAULTS.mossCoverage },
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

/** Parse a volume's `meta` into fully-defaulted soil rules. @internal */
export function readSoilRules(meta: Record<string, unknown> | undefined): SoilRules {
  return {
    baseColor: metaString(meta, "baseColor", SOIL_DEFAULTS.baseColor),
    crackScale: Math.max(0.1, metaNumber(meta, "crackScale", SOIL_DEFAULTS.crackScale)),
    crackColor: metaString(meta, "crackColor", SOIL_DEFAULTS.crackColor),
    crackIntensity: Math.min(1, Math.max(0, metaNumber(meta, "crackIntensity", SOIL_DEFAULTS.crackIntensity))),
    mossColor: metaString(meta, "mossColor", SOIL_DEFAULTS.mossColor),
    mossCoverage: Math.min(1, Math.max(0, metaNumber(meta, "mossCoverage", SOIL_DEFAULTS.mossCoverage))),
    seed: metaString(meta, "seed", SOIL_DEFAULTS.seed),
  };
}

/** A resolved soil patch: world-space area center at ground height, footprint size (XZ), and rules. */
export interface ResolvedSoil {
  center: readonly [number, number, number];
  size: readonly [number, number];
  rules: SoilRules;
}

function axis(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Resolve a soil volume into an area footprint (from box half-extents / radius) at the box base. @internal */
export function resolveSoilObject(object: SceneKindObject): ResolvedSoil | null {
  const center = object.center ?? object.position;
  if (center === undefined) return null;
  const he = object.halfExtents;
  const radius = object.radius;
  const halfX = axis(he?.x) ?? radius ?? 6;
  const halfZ = axis(he?.z) ?? radius ?? 6;
  const halfY = axis(he?.y) ?? 0;
  return {
    center: [center.x, center.y - halfY, center.z],
    size: [Math.max(0.5, halfX * 2), Math.max(0.5, halfZ * 2)],
    rules: readSoilRules(object.meta),
  };
}

/** Registers the `soil` scene kind (schema + resolver). Called by {@link registerBuiltinSceneKinds}. @internal */
export function registerSoilKind(): void {
  registerSceneKind<ResolvedSoil | null>({
    kind: SOIL_KIND,
    target: "volume",
    label: "Soil patch",
    addCategory: "Studios",
    accent: "#8a6d4a",
    schema: SOIL_SCHEMA,
    resolve: (object) => resolveSoilObject(object),
    note: (object) => {
      const resolved = resolveSoilObject(object);
      return resolved === null ? "Give the volume a box footprint." : `${Math.round(resolved.size[0])}×${Math.round(resolved.size[1])} m patch`;
    },
  });
}
