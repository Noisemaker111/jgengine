/**
 * The one grass model. Every grass patch — an editor `grass_field` volume or an `environment({
 * vegetation: grass(...) })` band — resolves to the same {@link GrassLook}, and the shell draws it
 * with one camera-streamed blade field over a turf mat. The look is what grows, a set of bounded knobs
 * (blade shape, colour and season, species mix, flowers, masks, wind), plus how it is drawn, the
 * {@link GrassStyle} (`grassStyle.ts`). Each knob is clamped to a range where any
 * combination still reads as healthy ground cover: blade count is derived from blade size so a
 * patch can never come out sparse, and draw cost follows the camera, not the patch area.
 *
 * @capability grass-field editor-authorable GPU grass patch
 */
import { registerSceneKind, type SceneKindObject } from "@jgengine/core/scene/sceneKinds";
import { defineParamSchema, parseParams, type ColorParamField, type RangeParamField } from "@jgengine/core/generator/paramSchema";
import { defineGenerator, registerGenerator } from "@jgengine/core/generator/generator";
import { createGrassTuftTemplate, type GrassTuftTemplate } from "@jgengine/core/grass/grassField";
import { GRASS_SPECIES, type GrassSpecies } from "@jgengine/core/grass/grassSpecies";
import { GRASS_STYLE_DEFAULTS, GRASS_STYLE_SCHEMA, resolveGrassStyle, type GrassStyle, type GrassStyleSettings } from "@jgengine/core/grass/grassStyle";

/** The editor volume kind marking a box as a GPU grass patch. */
export const GRASS_FIELD_KIND = "grass_field";

/** Blade shape and cover. */
export interface GrassBlade {
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
  /** 0..1 how far a blade spirals about its own axis from root to tip; 1 is a half turn. */
  twist: number;
  /** 0..1 how sharply the tip folds over at the end of the blade, past the even arc of `curvature`. */
  droop: number;
  /** 0..1 V-fold across the blade, so it lights as a channelled leaf instead of a flat strip. */
  fold: number;
}

/** How blades gather into tufts and clumps. */
export interface GrassTuft {
  /** Spread of blades around each tuft root, in metres. */
  tuftSpread: number;
  /** Blades grown from one tuft root, 1..16. */
  tuftBlades: number;
  /** 0..1 how far blades lean out from the tuft centre: 0 an upright bundle, 1 a rosette fanned near flat. */
  splay: number;
  /** 0..1 clumps mound into domed cushions, tall in the middle and low at the rim (moss, cushion plants). */
  cushion: number;
  /** 0..1 share of tufts gathered around clump centres into thick tussocks. */
  clumping: number;
  /** Typical clump radius in metres. */
  clumpSize: number;
}

/** Blade colour and its jitter. */
export interface GrassColour {
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
  /** 0..1 pale margins along each blade's edges (ribbon grass, variegated sedge). */
  variegation: number;
  /** 0..1 pale bands across each blade (zebra grass). */
  banding: number;
  /** Colour of the variegated margins and bands, hex. */
  variegationColor: string;
}

/** Season, drought and the masks that vary them across the field. */
export interface GrassSeason {
  /** 0..1 season: 0 early-summer green, 0.5 late-summer gold, 1 autumn rust. */
  season: number;
  /** 0..1 large-scale patchiness of season and dryness across the field. */
  seasonNoise: number;
  /** 0..1 drought: blades fade toward straw from the tips down. */
  dryness: number;
  /** Size of the season, dryness and patch masks, in metres. */
  noiseScale: number;
}

/** The optional second species mixed into the field. */
export interface GrassSecondSpecies {
  /** 0..1 share of tufts that grow as the second species. */
  mixShare: number;
  /** Second-species height, as a multiple of `bladeHeight`. */
  mixHeight: number;
  /** Second-species width, as a multiple of `bladeWidth`. */
  mixWidth: number;
  /** Second-species tip colour, hex. */
  mixColor: string;
}

/** Flower and seed heads. */
export interface GrassFlowers {
  /** 0..1 share of tufts carrying a flower or seed head. */
  flowerShare: number;
  /** Head size in metres. */
  flowerSize: number;
  /** 0..1 head shape: 0 a round blossom facing the camera, 1 an upright seed spike or plume. */
  headShape: number;
  /** First flower colour, hex. */
  flowerColor: string;
  /** Second flower colour, hex; each flower picks one of the two. */
  flowerColor2: string;
}

/** Where the grass grows and how it covers the ground. */
export interface GrassGrowth {
  /** 0..1 noise mask that drops patches of the field to a low, mown turf. */
  patchiness: number;
  /** 0..1 how much steep ground shortens the grass growing on it. */
  slopeThin: number;
  /** 0..1 share of the field left as open ground between tufts (dune sand, savanna soil); 0 grows everywhere. */
  bareGround: number;
  /** Lowest ground it grows on, in metres; blades thin out over the metre above, so beach sand and shallows stay bare. */
  growAbove: number;
  /** 0..1 turf mat strength under the blades; 0 leaves the ground bare beneath them. */
  groundCover: number;
}

/** Mow stripes. */
export interface GrassMowing {
  /** Width of one mow stripe in metres; 0 turns stripes off. */
  stripeWidth: number;
  /** 0..1 light/dark contrast between neighbouring mow stripes. */
  stripeContrast: number;
  /** Mow stripe heading in degrees, 0 along +X. */
  stripeAngle: number;
}

/** Wind sway. */
export interface GrassWind {
  /** 0..1 sway distance. */
  windStrength: number;
  /** Wind animation speed. */
  windSpeed: number;
  /** 0..1 gust size: low rolls broad waves across the field, high ripples small patches. */
  windGust: number;
  /** Wind heading in degrees, 0 along +X. */
  windDirection: number;
  /** 0..1 the whole field leans downwind at rest (windswept coast, trampled path, flattened by rain). */
  lean: number;
}

/** Blade material and light. */
export interface GrassLighting {
  /** 0..1 blade material roughness. */
  roughness: number;
  /** 0..1 warm glow where sun shines through blade tips. */
  translucency: number;
}

/** Fully-defaulted, clamped grass look, read from a volume's `meta` or a `grass()` config, grouped by the part of the field each knob shapes. */
export interface GrassLook {
  blade: GrassBlade;
  tuft: GrassTuft;
  colour: GrassColour;
  season: GrassSeason;
  mix: GrassSecondSpecies;
  flowers: GrassFlowers;
  growth: GrassGrowth;
  mowing: GrassMowing;
  wind: GrassWind;
  lighting: GrassLighting;
  /** How the field is drawn: realism and the style sliders, resolved from the patch, the world and the species. */
  style: GrassStyle;
  /** Seed; the same seed reproduces the same layout. */
  seed: string;
}

/** Every grass knob flat, the shape a volume's `meta`, the inspector schema and presets use. The style is not a knob: it nests under `style`. */
export type GrassKnobs = GrassBlade & GrassTuft & GrassColour & GrassSeason & GrassSecondSpecies & GrassFlowers & GrassGrowth & GrassMowing & GrassWind & GrassLighting & { seed: string };

/** A knob set a species writes: any knobs, never the seed. */
export type GrassSpeciesKnobs = Partial<Omit<GrassKnobs, "seed">>;

const FLAT_DEFAULTS: GrassKnobs = {
  density: 0.55,
  bladeHeight: 0.55,
  heightVariation: 0.35,
  bladeWidth: 0.06,
  widthVariation: 0.35,
  profile: 0.45,
  curvature: 0.35,
  stiffness: 0.5,
  twist: 0,
  droop: 0,
  fold: 0,
  tuftSpread: 0.15,
  tuftBlades: 5,
  splay: 0,
  cushion: 0,
  baseColor: "#3a6332",
  tipColor: "#9cc35a",
  gradient: 0.45,
  hueNoise: 0.15,
  valueNoise: 0.3,
  variegation: 0,
  banding: 0,
  variegationColor: "#e9ecc4",
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
  headShape: 0,
  flowerColor: "#f2e36b",
  flowerColor2: "#f4f1ea",
  clumping: 0.35,
  clumpSize: 2.5,
  patchiness: 0,
  slopeThin: 0.5,
  bareGround: 0,
  growAbove: -100,
  stripeWidth: 0,
  stripeContrast: 0.35,
  stripeAngle: 0,
  windStrength: 0.3,
  windSpeed: 1.4,
  windGust: 0.25,
  windDirection: 20,
  lean: 0,
  roughness: 0.85,
  translucency: 0.5,
  groundCover: 0.9,
  seed: "",
};

/** Group a flat knob set and a style into a {@link GrassLook}. @internal */
export function groupGrassKnobs(knobs: GrassKnobs, style: GrassStyle = GRASS_STYLE_DEFAULTS): GrassLook {
  return {
    blade: { density: knobs.density, bladeHeight: knobs.bladeHeight, heightVariation: knobs.heightVariation, bladeWidth: knobs.bladeWidth, widthVariation: knobs.widthVariation, profile: knobs.profile, curvature: knobs.curvature, stiffness: knobs.stiffness, twist: knobs.twist, droop: knobs.droop, fold: knobs.fold },
    tuft: { tuftSpread: knobs.tuftSpread, tuftBlades: knobs.tuftBlades, splay: knobs.splay, cushion: knobs.cushion, clumping: knobs.clumping, clumpSize: knobs.clumpSize },
    colour: { baseColor: knobs.baseColor, tipColor: knobs.tipColor, gradient: knobs.gradient, hueNoise: knobs.hueNoise, valueNoise: knobs.valueNoise, variegation: knobs.variegation, banding: knobs.banding, variegationColor: knobs.variegationColor },
    season: { season: knobs.season, seasonNoise: knobs.seasonNoise, dryness: knobs.dryness, noiseScale: knobs.noiseScale },
    mix: { mixShare: knobs.mixShare, mixHeight: knobs.mixHeight, mixWidth: knobs.mixWidth, mixColor: knobs.mixColor },
    flowers: { flowerShare: knobs.flowerShare, flowerSize: knobs.flowerSize, headShape: knobs.headShape, flowerColor: knobs.flowerColor, flowerColor2: knobs.flowerColor2 },
    growth: { patchiness: knobs.patchiness, slopeThin: knobs.slopeThin, bareGround: knobs.bareGround, growAbove: knobs.growAbove, groundCover: knobs.groundCover },
    mowing: { stripeWidth: knobs.stripeWidth, stripeContrast: knobs.stripeContrast, stripeAngle: knobs.stripeAngle },
    wind: { windStrength: knobs.windStrength, windSpeed: knobs.windSpeed, windGust: knobs.windGust, windDirection: knobs.windDirection, lean: knobs.lean },
    lighting: { roughness: knobs.roughness, translucency: knobs.translucency },
    style: { ...style },
    seed: knobs.seed,
  };
}

/** Grass defaults: a lush, lightly-swaying summer meadow at the default style. */
export const GRASS_DEFAULTS: GrassLook = groupGrassKnobs(FLAT_DEFAULTS);

/** A partial {@link GrassLook}: any groups, each with any of its knobs; `style` overrides the world style for this patch. */
export type GrassLookGroups = { [Group in Exclude<keyof GrassLook, "seed" | "style">]?: Partial<GrassLook[Group]> } & { style?: GrassStyleSettings; seed?: string };

/** A flat grass `meta`: the knobs, plus the patch's own style nested under `style`. */
export type GrassMeta = Partial<GrassKnobs> & { style?: GrassStyleSettings };

/** The flat knobs of a grouped look or partial look, for a `meta` or schema parse; a `style` stays nested under `style`. @internal */
export function flattenGrassLook(look: GrassLookGroups): GrassMeta {
  const { seed, style, ...groups } = look;
  const flat: GrassMeta = seed === undefined ? {} : { seed };
  for (const group of Object.values(groups)) Object.assign(flat, group);
  if (style !== undefined) flat.style = { ...style };
  return flat;
}

type NumberKey = { [K in keyof GrassKnobs]: GrassKnobs[K] extends number ? K : never }[keyof GrassKnobs];
type ColorKey = "baseColor" | "tipColor" | "mixColor" | "flowerColor" | "flowerColor2" | "variegationColor";

/** Where variants explore, inside each knob's full range, so every variant still reads as grass. */
const GRASS_EXPLORE: Partial<Record<NumberKey, readonly [number, number]>> = {
  density: [0.5, 1],
  groundCover: [0.75, 1],
  flowerShare: [0, 0.2],
  clumping: [0, 0.7],
  bladeHeight: [0.01, 1.2],
  heightVariation: [0, 0.8],
  bladeWidth: [0.008, 0.12],
  widthVariation: [0, 0.8],
  profile: [0, 0.8],
  curvature: [0, 0.8],
  stiffness: [0.2, 1],
  tuftSpread: [0, 0.3],
  tuftBlades: [2, 12],
  twist: [0, 0.5],
  droop: [0, 0.6],
  fold: [0, 0.8],
  splay: [0, 0.7],
  cushion: [0, 0.6],
  variegation: [0, 0.4],
  banding: [0, 0.3],
  lean: [0, 0.4],
  gradient: [0.2, 1],
  hueNoise: [0, 0.5],
  valueNoise: [0, 0.5],
  seasonNoise: [0, 0.6],
  dryness: [0, 0.7],
  mixHeight: [0.5, 2.5],
  mixWidth: [0.5, 2.5],
  patchiness: [0, 0.35],
  bareGround: [0, 0.3],
  roughness: [0.4, 1],
  translucency: [0, 0.6],
};
/** Sizes that span orders of magnitude explore by ratio, so a putting green's variants stay short. */
const GRASS_LOG_EXPLORE: ReadonlySet<NumberKey> = new Set<NumberKey>(["bladeHeight", "bladeWidth", "flowerSize"]);

const range = <Key extends NumberKey>(key: Key, label: string, min: number, max: number, step: number, group?: string, unit?: string): RangeParamField & { key: Key } => {
  const explore = GRASS_EXPLORE[key];
  return {
    type: "range", key, label, min, max, step, default: FLAT_DEFAULTS[key], ...(group === undefined ? {} : { group }), ...(unit === undefined ? {} : { unit }),
    ...(explore === undefined ? {} : { explore }), ...(GRASS_LOG_EXPLORE.has(key) ? { exploreScale: "log" as const } : {}),
  };
};
const color = <Key extends ColorKey>(key: Key, label: string, group: string): ColorParamField & { key: Key } => ({
  type: "color", key, label, group, default: FLAT_DEFAULTS[key], explore: { hue: 20, saturation: 0.2, lightness: 0.06 },
});

const { seed: _seed, ...LOOK_BASE } = FLAT_DEFAULTS;

/**
 * Every grass species as an inspector preset: the full knob set over the defaults, listed under its
 * habitat. A field names one with `species` and any knob it also sets wins over the species. Presets
 * hold what grows only; a species' style tuning is read through the `species` id (`readGrassLook`).
 */
export const GRASS_PRESETS = GRASS_SPECIES.map((species) => ({ id: species.id, label: species.label, group: species.group, values: { ...LOOK_BASE, ...species.values } }));

/** The grass parameter schema: drives the inspector, the variant grid and every `meta` parse. */
export const GRASS_SCHEMA = defineParamSchema({
  groups: [
    { id: "blade", label: "Blade" },
    { id: "colour", label: "Colour" },
    { id: "species", label: "Second species & heads", collapsed: true },
    { id: "growth", label: "Growth & masks", collapsed: true },
    { id: "mowing", label: "Mow stripes", collapsed: true, parent: "growth" },
    { id: "wind", label: "Wind", collapsed: true },
    { id: "light", label: "Light", collapsed: true },
  ],
  presets: GRASS_PRESETS,
  presetKey: "species",
  fields: [
    range("density", "fullness", 0, 1, 0.01),
    range("bladeHeight", "height", 0.01, 4, 0.005, "blade", "m"),
    range("heightVariation", "height variation", 0, 1, 0.01, "blade"),
    range("bladeWidth", "width", 0.008, 0.3, 0.002, "blade", "m"),
    range("widthVariation", "width variation", 0, 1, 0.01, "blade"),
    range("profile", "profile (needle → leaf)", 0, 1, 0.01, "blade"),
    range("curvature", "curvature", 0, 1, 0.01, "blade"),
    range("stiffness", "stiffness", 0, 1, 0.01, "blade"),
    range("twist", "twist", 0, 1, 0.01, "blade"),
    range("droop", "tip droop", 0, 1, 0.01, "blade"),
    range("fold", "fold (flat → channelled)", 0, 1, 0.01, "blade"),
    range("tuftSpread", "tuft spread", 0, 0.6, 0.01, "blade", "m"),
    range("tuftBlades", "blades per tuft", 1, 16, 1, "blade"),
    range("splay", "splay (upright → rosette)", 0, 1, 0.01, "blade"),
    color("baseColor", "base colour", "colour"),
    color("tipColor", "tip colour", "colour"),
    range("gradient", "tip gradient", 0, 1, 0.01, "colour"),
    range("hueNoise", "hue noise", 0, 1, 0.01, "colour"),
    range("valueNoise", "value noise", 0, 1, 0.01, "colour"),
    range("variegation", "variegated margins", 0, 1, 0.01, "colour"),
    range("banding", "cross bands", 0, 1, 0.01, "colour"),
    color("variegationColor", "variegation colour", "colour"),
    range("season", "season", 0, 1, 0.01, "colour"),
    range("seasonNoise", "season noise", 0, 1, 0.01, "colour"),
    range("dryness", "dryness", 0, 1, 0.01, "colour"),
    range("noiseScale", "noise scale", 2, 80, 0.5, "colour", "m"),
    range("mixShare", "second species share", 0, 0.8, 0.01, "species"),
    range("mixHeight", "second species height", 0.3, 4, 0.05, "species", "×"),
    range("mixWidth", "second species width", 0.3, 4, 0.05, "species", "×"),
    color("mixColor", "second species colour", "species"),
    range("flowerShare", "head share", 0, 0.5, 0.01, "species"),
    range("flowerSize", "head size", 0.01, 0.4, 0.002, "species", "m"),
    range("headShape", "head shape (blossom → spike)", 0, 1, 0.01, "species"),
    color("flowerColor", "flower colour", "species"),
    color("flowerColor2", "second flower colour", "species"),
    range("clumping", "clumping", 0, 1, 0.01, "growth"),
    range("clumpSize", "clump size", 0.2, 12, 0.05, "growth", "m"),
    range("cushion", "cushion mounds", 0, 1, 0.01, "growth"),
    range("patchiness", "mown patches", 0, 1, 0.01, "growth"),
    range("slopeThin", "slope thinning", 0, 1, 0.01, "growth"),
    range("bareGround", "bare ground", 0, 1, 0.01, "growth"),
    range("growAbove", "grows above", -100, 500, 0.1, "growth", "m"),
    range("stripeWidth", "stripe width", 0, 8, 0.1, "mowing", "m"),
    range("stripeContrast", "stripe contrast", 0, 1, 0.01, "mowing"),
    range("stripeAngle", "stripe heading", 0, 180, 1, "mowing", "°"),
    range("windStrength", "strength", 0, 1, 0.01, "wind"),
    range("windSpeed", "speed", 0, 4, 0.05, "wind"),
    range("windGust", "gust size", 0, 1, 0.01, "wind"),
    range("windDirection", "heading", 0, 360, 1, "wind", "°"),
    range("lean", "resting lean", 0, 1, 0.01, "wind"),
    range("roughness", "roughness", 0, 1, 0.01, "light"),
    range("translucency", "translucency", 0, 1, 0.01, "light"),
    range("groundCover", "ground cover", 0, 1, 0.01),
    { type: "seed", key: "seed", label: "seed", default: "" },
  ],
});

const SPECIES_BY_ID: ReadonlyMap<string, GrassSpecies> = new Map(GRASS_SPECIES.map((species) => [species.id, species]));

/**
 * Parse a volume's `meta` (or a `grass()` config) into a fully-defaulted, clamped look; a `species` id
 * backs every knob the meta leaves unset. The style comes from the meta's own `style`, then
 * `worldStyle` (the scene's `environment.grassStyle`), then the species' style tuning, then the
 * realism curves (`resolveGrassStyle`).
 * @internal
 */
export function readGrassLook(meta: Readonly<Record<string, unknown>> | undefined, worldStyle?: GrassStyleSettings): GrassLook {
  const id = meta?.["species"];
  const species = typeof id === "string" ? SPECIES_BY_ID.get(id) : undefined;
  return groupGrassKnobs(parseParams(GRASS_SCHEMA, meta), resolveGrassStyle(meta?.["style"], worldStyle, species?.style));
}

/**
 * Blades per square metre at full detail. Fullness sets how much of the ground the blades cover,
 * and the count follows from blade size: thin or short blades need more of them to cover the same
 * ground, so no width, height or fullness can leave bare gaps between tufts.
 */
export function grassBladeDensity(look: GrassLook): number {
  const width = look.blade.bladeWidth * (1 - look.blade.widthVariation * 0.3);
  const height = look.blade.bladeHeight * (1 - look.blade.heightVariation * 0.3);
  const cover = 2.6 + look.blade.density * 2.4;
  return cover / (width * (0.3 + Math.min(height, 1.2)));
}

/** The generator output family a grass look bakes to: {@link GrassFieldBake}. */
export const GRASS_FIELD_OUTPUT = "grass-field";

/** One baked grass look: the look with its seed settled, and the tuft mesh every instance of it places. */
export interface GrassFieldBake {
  look: GrassLook;
  seed: string;
  /** Blade segments the template was built at. */
  segments: number;
  template: GrassTuftTemplate;
  /** Blades per m² at full detail. */
  bladesPerM2: number;
}

/**
 * The grass generator: one schema from cushion moss and putting greens to reed beds, crops and pampas plumes. Detail picks
 * the blade segments (4 at full detail, 2 at half, 1 at a quarter), so a baked variant carries its LODs.
 */
export const GRASS_GENERATOR = defineGenerator({
  id: "grass",
  label: "Grass",
  output: GRASS_FIELD_OUTPUT,
  schema: GRASS_SCHEMA,
  lods: [1, 0.5, 0.25],
  generate(params, context): GrassFieldBake {
    const look = groupGrassKnobs({ ...params, seed: context.seed });
    const segments = Math.max(1, Math.round(4 * context.detail));
    const bladesPerM2 = grassBladeDensity(look);
    return { look, seed: context.seed, segments, template: createGrassTuftTemplate({ look, seed: context.seed, segments, bladesPerM2 }), bladesPerM2 };
  },
});

/** A resolved grass patch: world-space area center at ground height, footprint size (XZ), and look. */
export interface ResolvedGrass {
  center: readonly [number, number, number];
  size: readonly [number, number];
  look: GrassLook;
}

function axis(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Resolve a grass volume into an area footprint (from box half-extents / radius) at the box base, drawn in the world's grass style. @internal */
export function resolveGrassObject(object: SceneKindObject, worldStyle?: GrassStyleSettings): ResolvedGrass | null {
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
    look: readGrassLook(object.meta, worldStyle),
  };
}

/** Registers the grass generator and the `grass_field` scene kind (schema + resolver). Called by {@link registerBuiltinSceneKinds}. @internal */
export function registerGrassKind(): void {
  registerGenerator(GRASS_GENERATOR);
  registerSceneKind<ResolvedGrass | null>({
    kind: GRASS_FIELD_KIND,
    generator: GRASS_GENERATOR.id,
    target: "volume",
    label: "Grass field",
    addCategory: "Studios",
    accent: "#7fbf4d",
    schema: GRASS_SCHEMA,
    coverage: { spec: "grass_field", densityKey: "density" },
    nested: [{ key: "style", label: "Grass style", schema: GRASS_STYLE_SCHEMA, effective: (object, environment) => ({ ...readGrassLook(object.meta, environment?.grassStyle).style }) }],
    resolve: (object) => resolveGrassObject(object),
    note: (object) => {
      const resolved = resolveGrassObject(object);
      if (resolved === null) return "Give the volume a box footprint.";
      const perArea = grassBladeDensity(resolved.look);
      return `${Math.round(resolved.size[0])}×${Math.round(resolved.size[1])} m · ${Math.round(perArea)} blades/m² near the camera, thinned with distance`;
    },
  });
}
