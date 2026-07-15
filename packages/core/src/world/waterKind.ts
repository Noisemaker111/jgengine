/**
 * `water` studio: a parametric water surface authored as a box volume — its XZ footprint becomes the
 * water plane, its top face the water height. Pure config here (color/wave/foam/opacity params + a
 * footprint resolver); the animated shader plane lives in the `shell` renderer, which maps these
 * params onto the existing Ocean material. A scene kind so a pond or moat is dragged in the editor and
 * tuned with sliders, persisted in `editor.scene.json`. Distinct from the infinite `waterSurface`
 * ocean primitive (`./water`) — this is a bounded, editor-authored patch.
 *
 * @capability water parametric water surface volume
 */
import { registerSceneKind, type ParamSchema, type SceneKindObject } from "../scene/sceneKinds";

/** The editor volume kind marking a box as a water surface. */
export const WATER_VOLUME_KIND = "water";

/** Fully-defaulted water surface params parsed from a volume's `meta`. */
export interface WaterRules {
  /** Deep-water base color (hex). */
  color: string;
  /** Shallow/edge tint blended toward the shore (hex). */
  shallowColor: string;
  /** Wave amplitude in meters. */
  waveHeight: number;
  /** Wave scroll speed multiplier. */
  waveSpeed: number;
  /** Spatial wave frequency (waves per meter). */
  waveScale: number;
  /** Foam band width at the shoreline, meters. */
  foam: number;
  /** Surface opacity, 0..1. */
  opacity: number;
  /** Reflection/metalness strength, 0..1. */
  reflectivity: number;
}

/** Water defaults: a calm blue-green pond with a soft foam edge. */
export const WATER_DEFAULTS: WaterRules = {
  color: "#1c6c86",
  shallowColor: "#4bb6bf",
  waveHeight: 0.12,
  waveSpeed: 0.6,
  waveScale: 0.35,
  foam: 1.2,
  opacity: 0.86,
  reflectivity: 0.4,
};

/** The water parameter schema — drives the inspector and `meta` parse via the studio seam. */
export const WATER_SCHEMA: ParamSchema = {
  fields: [
    { type: "color", key: "color", label: "deep color", default: WATER_DEFAULTS.color },
    { type: "color", key: "shallowColor", label: "shallow color", default: WATER_DEFAULTS.shallowColor },
    { type: "range", key: "waveHeight", label: "wave height", min: 0, max: 1, step: 0.01, default: WATER_DEFAULTS.waveHeight, unit: "m" },
    { type: "range", key: "waveSpeed", label: "wave speed", min: 0, max: 3, step: 0.05, default: WATER_DEFAULTS.waveSpeed },
    { type: "range", key: "waveScale", label: "wave scale", min: 0.02, max: 2, step: 0.02, default: WATER_DEFAULTS.waveScale },
    { type: "range", key: "foam", label: "foam edge", min: 0, max: 6, step: 0.1, default: WATER_DEFAULTS.foam, unit: "m" },
    { type: "range", key: "opacity", label: "opacity", min: 0.1, max: 1, step: 0.01, default: WATER_DEFAULTS.opacity },
    { type: "range", key: "reflectivity", label: "reflectivity", min: 0, max: 1, step: 0.01, default: WATER_DEFAULTS.reflectivity },
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

/** Parse a volume's `meta` into fully-defaulted water rules. @internal */
export function readWaterRules(meta: Record<string, unknown> | undefined): WaterRules {
  return {
    color: metaString(meta, "color", WATER_DEFAULTS.color),
    shallowColor: metaString(meta, "shallowColor", WATER_DEFAULTS.shallowColor),
    waveHeight: Math.max(0, metaNumber(meta, "waveHeight", WATER_DEFAULTS.waveHeight)),
    waveSpeed: Math.max(0, metaNumber(meta, "waveSpeed", WATER_DEFAULTS.waveSpeed)),
    waveScale: Math.max(0.01, metaNumber(meta, "waveScale", WATER_DEFAULTS.waveScale)),
    foam: Math.max(0, metaNumber(meta, "foam", WATER_DEFAULTS.foam)),
    opacity: Math.min(1, Math.max(0, metaNumber(meta, "opacity", WATER_DEFAULTS.opacity))),
    reflectivity: Math.min(1, Math.max(0, metaNumber(meta, "reflectivity", WATER_DEFAULTS.reflectivity))),
  };
}

/** A resolved water surface: world-space plane center/size (XZ) at surface height `y`, plus its params. */
export interface ResolvedWater {
  center: readonly [number, number, number];
  /** Full width (X) and depth (Z) of the water plane in meters. */
  size: readonly [number, number];
  rules: WaterRules;
}

/** Reads a numeric field off a possibly-untyped `{x,y,z}`-ish object. */
function axis(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Resolve a water volume into a flat surface: the box footprint (`halfExtents`, else `radius`) becomes
 * the plane size, the box top (`center.y + halfExtents.y`) the water height. Returns null for a
 * degenerate footprint. Reads footprint from the object's `halfExtents`/`radius` meta mirror written
 * by the volume, falling back to a 20 m square.
 * @internal
 */
export function resolveWaterObject(object: SceneKindObject): ResolvedWater | null {
  const center = object.center ?? object.position;
  if (center === undefined) return null;
  const meta = object.meta;
  const he = object.halfExtents;
  const radius = object.radius ?? axis(meta?.["radius"]);
  const halfX = axis(he?.x) ?? radius ?? 10;
  const halfZ = axis(he?.z) ?? radius ?? 10;
  const halfY = axis(he?.y) ?? 0;
  const width = Math.max(0.1, halfX * 2);
  const depth = Math.max(0.1, halfZ * 2);
  return { center: [center.x, center.y + halfY, center.z], size: [width, depth], rules: readWaterRules(meta) };
}

/** Registers the `water` scene kind (schema + resolver). Called by {@link registerBuiltinSceneKinds}. @internal */
export function registerWaterKind(): void {
  registerSceneKind<ResolvedWater | null>({
    kind: WATER_VOLUME_KIND,
    target: "volume",
    label: "Water surface",
    addCategory: "Studios",
    accent: "#38bdf8",
    schema: WATER_SCHEMA,
    resolve: (object) => resolveWaterObject(object),
    note: (object) => {
      const resolved = resolveWaterObject(object);
      return resolved === null ? "Give the volume a box footprint." : `${Math.round(resolved.size[0])}×${Math.round(resolved.size[1])} m surface`;
    },
  });
}
