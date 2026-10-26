/**
 * The one grass model. Every grass patch — an editor `grass_field` volume or an `environment({
 * vegetation: grass(...) })` band — resolves to the same {@link GrassLook}, and the shell draws it
 * with one camera-streamed blade field over a turf mat. The look is a set of bounded knobs (blade
 * shape, colour and season, species mix, flowers, masks, wind), each clamped to a range where any
 * combination still reads as healthy ground cover: blade count is derived from blade size so a
 * patch can never come out sparse, and draw cost follows the camera, not the patch area.
 *
 * @capability grass-field editor-authorable GPU grass patch
 */
import { registerSceneKind, type ParamField, type ParamSchema, type SceneKindObject } from "../scene/sceneKinds";

/** The editor volume kind marking a box as a GPU grass patch. */
export const GRASS_FIELD_KIND = "grass_field";

/** Fully-defaulted, clamped grass look, read from a volume's `meta` or a `grass()` config. */
export interface GrassLook {
  /** 0..1 fullness. Blades per m² come from this and the blade size, so 0 is still full cover. */
  density: number;
  /** Tallest blade height in metres. */
  bladeHeight: number;
  /** 0..1 share of `bladeHeight` blades vary below it; 0 is a mown, even height. */
  heightVariation: number;
  /** Typical blade width at its widest, in metres. */
  bladeWidth: number;
  /** 0..1 blade-to-blade width jitter. */
  widthVariation: number;
  /** Blade outline, 0..1: 0 a needle tapering from the root, 0.5 a strap held to the tip, 1 a broad leaf widest mid-blade. */
  profile: number;
  /** 0..1 how far blades arc over under their own weight. */
  curvature: number;
  /** 0..1 how much a blade resists wind and droop; soft grass sways and flops, stiff grass stands. */
  stiffness: number;
  /** Spread of blades around each tuft root, in metres. */
  tuftSpread: number;
  /** Blades grown from one tuft root, 1..9. */
  tuftBlades: number;
  /** Root colour, hex. */
  baseColor: string;
  /** Tip colour, hex. */
  tipColor: string;
  /** 0..1 where along the blade the tip colour takes over; 0 tips the whole blade, 1 only the very end. */
  gradient: number;
  /** 0..1 per-blade hue jitter. */
  hueNoise: number;
  /** 0..1 per-blade brightness jitter. */
  valueNoise: number;
  /** 0..1 season: 0 early-summer green, 0.5 late-summer gold, 1 autumn rust. */
  season: number;
  /** 0..1 large-scale patchiness of season and dryness across the field. */
  seasonNoise: number;
  /** 0..1 drought: blades fade toward straw from the tips down. */
  dryness: number;
  /** Size of the season, dryness and patch masks, in metres. */
  noiseScale: number;
  /** 0..1 share of tufts that grow as the second species. */
  mixShare: number;
  /** Second-species height, as a multiple of `bladeHeight`. */
  mixHeight: number;
  /** Second-species width, as a multiple of `bladeWidth`. */
  mixWidth: number;
  /** Second-species tip colour, hex. */
  mixColor: string;
  /** 0..1 share of tufts carrying a flower head. */
  flowerShare: number;
  /** Flower head size in metres. */
  flowerSize: number;
  /** First flower colour, hex. */
  flowerColor: string;
  /** Second flower colour, hex; each flower picks one of the two. */
  flowerColor2: string;
  /** 0..1 share of tufts gathered around clump centres into thick tussocks. */
  clumping: number;
  /** Typical clump radius in metres. */
  clumpSize: number;
  /** 0..1 noise mask that drops patches of the field to a low, mown turf. */
  patchiness: number;
  /** 0..1 how much steep ground shortens the grass growing on it. */
  slopeThin: number;
  /** 0..1 sway distance. */
  windStrength: number;
  /** Wind animation speed. */
  windSpeed: number;
  /** 0..1 gust size: low rolls broad waves across the field, high ripples small patches. */
  windGust: number;
  /** Wind heading in degrees, 0 along +X. */
  windDirection: number;
  /** 0..1 blend of blade normals toward straight-up, so the field lights as one soft surface. */
  normalLift: number;
  /** 0..1 blade material roughness. */
  roughness: number;
  /** 0..1 warm glow where sun shines through blade tips. */
  translucency: number;
  /** 0..1 turf mat strength under the blades; 0 leaves the ground bare beneath them. */
  groundCover: number;
  /** Seed; the same seed reproduces the same layout. */
  seed: string;
}

/** Grass defaults: a lush, lightly-swaying summer meadow. */
export const GRASS_DEFAULTS: GrassLook = {
  density: 0.55,
  bladeHeight: 0.55,
  heightVariation: 0.35,
  bladeWidth: 0.06,
  widthVariation: 0.35,
  profile: 0.45,
  curvature: 0.35,
  stiffness: 0.5,
  tuftSpread: 0.15,
  tuftBlades: 5,
  baseColor: "#3a6332",
  tipColor: "#9cc35a",
  gradient: 0.45,
  hueNoise: 0.15,
  valueNoise: 0.3,
  season: 0,
  seasonNoise: 0.25,
  dryness: 0,
  noiseScale: 18,
  mixShare: 0,
  mixHeight: 1.6,
  mixWidth: 0.7,
  mixColor: "#c8b46a",
  flowerShare: 0,
  flowerSize: 0.035,
  flowerColor: "#f2e36b",
  flowerColor2: "#f4f1ea",
  clumping: 0.35,
  clumpSize: 2.5,
  patchiness: 0,
  slopeThin: 0.5,
  windStrength: 0.3,
  windSpeed: 1.4,
  windGust: 0.25,
  windDirection: 20,
  normalLift: 0.6,
  roughness: 0.85,
  translucency: 0.5,
  groundCover: 0.9,
  seed: "",
};

type NumberKey = { [K in keyof GrassLook]: GrassLook[K] extends number ? K : never }[keyof GrassLook];
type ColorKey = "baseColor" | "tipColor" | "mixColor" | "flowerColor" | "flowerColor2";

const range = (key: NumberKey, label: string, min: number, max: number, step: number, group?: string, unit?: string): ParamField => ({
  type: "range", key, label, min, max, step, default: GRASS_DEFAULTS[key], ...(group === undefined ? {} : { group }), ...(unit === undefined ? {} : { unit }),
});
const color = (key: ColorKey, label: string, group: string): ParamField => ({ type: "color", key, label, group, default: GRASS_DEFAULTS[key] });

/**
 * Starting looks the inspector offers as one-click applies. Each is plain knob values, so a game
 * tweaks from it or ignores it; together with the seed they are the quickest route to a distinct field.
 */
const { seed: _seed, ...LOOK_BASE } = GRASS_DEFAULTS;
const preset = (id: string, label: string, values: Partial<Omit<GrassLook, "seed">>) => ({ id, label, values: { ...LOOK_BASE, ...values } });

/** Starting looks the inspector applies in one click; each is a full knob set, so any can be tweaked from there. */
export const GRASS_PRESETS = [
  preset("meadow", "Summer meadow", { flowerShare: 0.05, mixShare: 0.08 }),
  preset("lawn", "Mown lawn", { bladeHeight: 0.12, heightVariation: 0.15, bladeWidth: 0.035, profile: 0.3, curvature: 0.15, stiffness: 0.8,
    tuftSpread: 0.06, tuftBlades: 6, baseColor: "#2f5a28", tipColor: "#78b048", density: 0.8, clumping: 0.1, windStrength: 0.08, seasonNoise: 0.1, mixShare: 0, flowerShare: 0 }),
  preset("prairie", "Golden prairie", { bladeHeight: 1.1, heightVariation: 0.4, bladeWidth: 0.03, profile: 0.15, curvature: 0.55, stiffness: 0.3,
    baseColor: "#6d6a35", tipColor: "#d8c07a", season: 0.45, dryness: 0.35, seasonNoise: 0.5, mixShare: 0.2, mixHeight: 1.4, mixColor: "#e6d49a",
    windStrength: 0.6, windGust: 0.15, translucency: 0.8 }),
  preset("marsh", "Marsh reeds", { bladeHeight: 1.6, heightVariation: 0.3, bladeWidth: 0.025, profile: 0.6, curvature: 0.15, stiffness: 0.85,
    tuftSpread: 0.22, tuftBlades: 7, baseColor: "#3d4f2a", tipColor: "#8fa05a", mixShare: 0.25, mixHeight: 1.25, mixWidth: 1.2, mixColor: "#7a6a40",
    clumping: 0.7, clumpSize: 1.6, windStrength: 0.35 }),
  preset("alpine", "Alpine flowers", { bladeHeight: 0.28, heightVariation: 0.45, bladeWidth: 0.05, profile: 0.55, baseColor: "#355c34",
    tipColor: "#8cc068", flowerShare: 0.3, flowerSize: 0.04, flowerColor: "#b07ee0", flowerColor2: "#f6f0d8", patchiness: 0.3, windStrength: 0.25 }),
  preset("autumn", "Autumn field", { season: 0.95, seasonNoise: 0.6, baseColor: "#4e5a2e", tipColor: "#a8a050", dryness: 0.2,
    bladeHeight: 0.6, curvature: 0.6, stiffness: 0.35, mixShare: 0.12, mixColor: "#b0603a" }),
  preset("scrub", "Dry scrub", { bladeHeight: 0.42, heightVariation: 0.6, bladeWidth: 0.04, profile: 0.2, curvature: 0.5, tuftSpread: 0.3,
    baseColor: "#6e5a34", tipColor: "#c2a868", dryness: 0.65, seasonNoise: 0.4, clumping: 0.7, clumpSize: 1.8, patchiness: 0.45, windStrength: 0.5,
    mixShare: 0.1, mixHeight: 2.1, mixColor: "#e2c878", groundCover: 0.7 }),
  preset("jungle", "Broadleaf jungle floor", { bladeHeight: 0.5, heightVariation: 0.5, bladeWidth: 0.16, profile: 0.95, curvature: 0.7,
    stiffness: 0.4, tuftSpread: 0.25, tuftBlades: 4, baseColor: "#1f4a24", tipColor: "#4f9a3c", hueNoise: 0.25, valueNoise: 0.4, normalLift: 0.45,
    mixShare: 0.2, mixHeight: 1.8, mixWidth: 0.4, mixColor: "#6cae48", windStrength: 0.15 }),
];

/** The grass parameter schema — drives the inspector and `meta` parse via the studio seam. */
export const GRASS_SCHEMA: ParamSchema = {
  groups: [
    { id: "blade", label: "Blade" },
    { id: "colour", label: "Colour" },
    { id: "species", label: "Species & flowers", collapsed: true },
    { id: "growth", label: "Growth & masks", collapsed: true },
    { id: "wind", label: "Wind", collapsed: true },
    { id: "light", label: "Light", collapsed: true },
  ],
  presets: GRASS_PRESETS,
  fields: [
    range("density", "fullness", 0, 1, 0.01),
    range("bladeHeight", "height", 0.05, 2.5, 0.01, "blade", "m"),
    range("heightVariation", "height variation", 0, 1, 0.01, "blade"),
    range("bladeWidth", "width", 0.008, 0.3, 0.002, "blade", "m"),
    range("widthVariation", "width variation", 0, 1, 0.01, "blade"),
    range("profile", "profile (needle → leaf)", 0, 1, 0.01, "blade"),
    range("curvature", "curvature", 0, 1, 0.01, "blade"),
    range("stiffness", "stiffness", 0, 1, 0.01, "blade"),
    range("tuftSpread", "tuft spread", 0, 0.6, 0.01, "blade", "m"),
    range("tuftBlades", "blades per tuft", 1, 9, 1, "blade"),
    color("baseColor", "base colour", "colour"),
    color("tipColor", "tip colour", "colour"),
    range("gradient", "tip gradient", 0, 1, 0.01, "colour"),
    range("hueNoise", "hue noise", 0, 1, 0.01, "colour"),
    range("valueNoise", "value noise", 0, 1, 0.01, "colour"),
    range("season", "season", 0, 1, 0.01, "colour"),
    range("seasonNoise", "season noise", 0, 1, 0.01, "colour"),
    range("dryness", "dryness", 0, 1, 0.01, "colour"),
    range("noiseScale", "noise scale", 2, 80, 0.5, "colour", "m"),
    range("mixShare", "second species share", 0, 0.8, 0.01, "species"),
    range("mixHeight", "second species height", 0.3, 4, 0.05, "species", "×"),
    range("mixWidth", "second species width", 0.3, 4, 0.05, "species", "×"),
    color("mixColor", "second species colour", "species"),
    range("flowerShare", "flower share", 0, 0.5, 0.01, "species"),
    range("flowerSize", "flower size", 0.01, 0.12, 0.002, "species", "m"),
    color("flowerColor", "flower colour", "species"),
    color("flowerColor2", "second flower colour", "species"),
    range("clumping", "clumping", 0, 1, 0.01, "growth"),
    range("clumpSize", "clump size", 0.5, 12, 0.25, "growth", "m"),
    range("patchiness", "mown patches", 0, 1, 0.01, "growth"),
    range("slopeThin", "slope thinning", 0, 1, 0.01, "growth"),
    range("windStrength", "strength", 0, 1, 0.01, "wind"),
    range("windSpeed", "speed", 0, 4, 0.05, "wind"),
    range("windGust", "gust size", 0, 1, 0.01, "wind"),
    range("windDirection", "heading", 0, 360, 1, "wind", "°"),
    range("normalLift", "normal lift", 0, 1, 0.01, "light"),
    range("roughness", "roughness", 0, 1, 0.01, "light"),
    range("translucency", "translucency", 0, 1, 0.01, "light"),
    range("groundCover", "ground cover", 0, 1, 0.01),
    { type: "seed", key: "seed", label: "seed", default: "" },
  ],
};

const RANGES: ReadonlyMap<string, { min: number; max: number; step: number }> = new Map(
  GRASS_SCHEMA.fields.flatMap((field) => (field.type === "range" ? [[field.key, { min: field.min, max: field.max, step: field.step ?? 0 }] as const] : [])),
);

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Parse a volume's `meta` (or a `grass()` config) into a fully-defaulted, clamped look. @internal */
export function readGrassLook(meta: Readonly<Record<string, unknown>> | undefined): GrassLook {
  const look: Record<string, number | string> = { ...GRASS_DEFAULTS };
  for (const key of Object.keys(GRASS_DEFAULTS) as (keyof GrassLook)[]) {
    const raw = meta?.[key];
    const fallback = GRASS_DEFAULTS[key];
    if (typeof fallback === "number") {
      const bounds = RANGES.get(key)!;
      const value = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
      const clamped = Math.max(bounds.min, Math.min(bounds.max, value));
      look[key] = bounds.step >= 1 ? Math.round(clamped) : clamped;
    } else if (key === "seed") {
      look[key] = typeof raw === "string" ? raw : fallback;
    } else {
      look[key] = typeof raw === "string" && HEX.test(raw) ? raw : fallback;
    }
  }
  return look as unknown as GrassLook;
}

/**
 * Blades per square metre at full detail. Fullness sets how much of the ground the blades cover,
 * and the count follows from blade size: thin or short blades need more of them to cover the same
 * ground, so no width, height or fullness can leave bare gaps between tufts.
 */
export function grassBladeDensity(look: GrassLook): number {
  const width = look.bladeWidth * (1 - look.widthVariation * 0.3);
  const height = look.bladeHeight * (1 - look.heightVariation * 0.3);
  const cover = 2.6 + look.density * 2.4;
  return cover / (width * (0.3 + Math.min(height, 1.2)));
}

/** A resolved grass patch: world-space area center at ground height, footprint size (XZ), and look. */
export interface ResolvedGrass {
  center: readonly [number, number, number];
  size: readonly [number, number];
  look: GrassLook;
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
    look: readGrassLook(object.meta),
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
      const perArea = grassBladeDensity(resolved.look);
      return `${Math.round(resolved.size[0])}×${Math.round(resolved.size[1])} m · ${Math.round(perArea)} blades/m² near the camera, thinned with distance`;
    },
  });
}
