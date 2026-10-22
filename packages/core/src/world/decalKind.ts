/**
 * `decal` marker: a surface-grime decal authored as a placed marker (dirt, cracks, paint, blood).
 * Its position, facing (`rotationY`), tilt (0 lies on the ground, 90 stands on a wall), size, opacity
 * and seed live in the scene document, so decals are placed in the editor like any other authored
 * content and a game never hardcodes a stain. Pure config here; the procedural texture and the
 * draped/standing quad live in the `shell` renderer.
 *
 * @capability decal editor-authored surface decal
 */
import { registerSceneKind, type ParamSchema, type SceneKindObject } from "../scene/sceneKinds";

/** The editor marker kind marking a surface decal. */
export const DECAL_KIND = "decal";

/** The four authored decal looks; each has its own deterministic procedural texture. */
export const DECAL_STYLES = ["dirt", "cracks", "paint", "blood"] as const;
/** One of the four authored decal looks. */
export type DecalStyle = (typeof DECAL_STYLES)[number];

/** Fully-defaulted decal params parsed from a marker's `meta`. */
export interface DecalRules {
  style: DecalStyle;
  /** Decal width/height in metres. */
  size: number;
  /** 0 lies flat on the ground, 90 stands on a wall; 45 leans. */
  tilt: number;
  /** Vertical offset of the decal centre above the placed point, in metres. */
  lift: number;
  /** Push along the decal's own normal, so a wall decal clears the wall it sits on. */
  offset: number;
  /** 0..1 overall alpha. */
  opacity: number;
  /** Deterministic shape seed. */
  seed: string;
}

/** Default decal rules: a small dirt smudge lying on the ground. */
export const DECAL_DEFAULTS: DecalRules = {
  style: "dirt",
  size: 2.4,
  tilt: 0,
  lift: 0.02,
  offset: 0.04,
  opacity: 0.9,
  seed: "",
};

/** The decal parameter schema — drives the inspector and the `meta` parse. */
export const DECAL_SCHEMA: ParamSchema = {
  fields: [
    { type: "select", key: "style", label: "style", options: DECAL_STYLES.map((value) => ({ value })), default: DECAL_DEFAULTS.style },
    { type: "range", key: "size", label: "size", min: 0.3, max: 24, step: 0.1, default: DECAL_DEFAULTS.size, unit: "m" },
    { type: "range", key: "tilt", label: "tilt", min: 0, max: 90, step: 1, default: DECAL_DEFAULTS.tilt, unit: "°" },
    { type: "range", key: "lift", label: "height", min: 0, max: 30, step: 0.05, default: DECAL_DEFAULTS.lift, unit: "m" },
    { type: "range", key: "offset", label: "surface offset", min: 0, max: 2, step: 0.01, default: DECAL_DEFAULTS.offset, unit: "m" },
    { type: "range", key: "opacity", label: "opacity", min: 0.05, max: 1, step: 0.01, default: DECAL_DEFAULTS.opacity },
    { type: "seed", key: "seed", label: "seed", default: DECAL_DEFAULTS.seed },
  ],
};

function number(meta: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function text(meta: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const value = meta?.[key];
  return typeof value === "string" ? value : fallback;
}

/** Parse a marker's `meta` into fully-defaulted decal rules. @internal */
export function readDecalRules(meta: Record<string, unknown> | undefined): DecalRules {
  const style = text(meta, "style", DECAL_DEFAULTS.style) as DecalStyle;
  return {
    style: DECAL_STYLES.includes(style) ? style : DECAL_DEFAULTS.style,
    size: Math.min(24, Math.max(0.3, number(meta, "size", DECAL_DEFAULTS.size))),
    tilt: Math.min(90, Math.max(0, number(meta, "tilt", DECAL_DEFAULTS.tilt))),
    lift: Math.max(0, number(meta, "lift", DECAL_DEFAULTS.lift)),
    offset: Math.max(0, number(meta, "offset", DECAL_DEFAULTS.offset)),
    opacity: Math.min(1, Math.max(0.05, number(meta, "opacity", DECAL_DEFAULTS.opacity))),
    seed: text(meta, "seed", DECAL_DEFAULTS.seed),
  };
}

/** A resolved decal: its placed point/facing plus fully-defaulted rules. */
export interface ResolvedDecal {
  position: readonly [number, number, number];
  rotationY: number;
  rules: DecalRules;
}

/** Resolve a decal marker into a placed, fully-defaulted decal; null without a position. @internal */
export function resolveDecalObject(object: SceneKindObject): ResolvedDecal | null {
  const position = object.position ?? object.center;
  if (position === undefined) return null;
  return {
    position: [position.x, position.y, position.z],
    rotationY: object.rotationY ?? 0,
    rules: readDecalRules(object.meta),
  };
}

/** Registers the `decal` scene kind. Called by {@link registerBuiltinSceneKinds}. @internal */
export function registerDecalKind(): void {
  registerSceneKind<ResolvedDecal | null>({
    kind: DECAL_KIND,
    target: "marker",
    label: "Decal",
    addCategory: "Studios",
    accent: "#b5793c",
    schema: DECAL_SCHEMA,
    resolve: (object) => resolveDecalObject(object),
    note: (object) => {
      const resolved = resolveDecalObject(object);
      if (resolved === null) return "Place the marker on a surface.";
      return `${resolved.rules.style} · ${resolved.rules.size.toFixed(1)} m ${resolved.rules.tilt >= 45 ? "wall" : "ground"} decal`;
    },
  });
}
