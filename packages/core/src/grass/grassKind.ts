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
import { registerSceneKind, type SceneKindObject } from "@jgengine/core/scene/sceneKinds";
import { defineParamSchema, parseParams, type ColorParamField, type RangeParamField } from "@jgengine/core/generator/paramSchema";
import { defineGenerator, registerGenerator } from "@jgengine/core/generator/generator";
import { createGrassTuftTemplate, type GrassTuftTemplate } from "@jgengine/core/grass/grassField";

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
}

/** How blades gather into tufts and clumps. */
export interface GrassTuft {
  /** Spread of blades around each tuft root, in metres. */
  tuftSpread: number;
  /** Blades grown from one tuft root, 1..9. */
  tuftBlades: number;
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

/** Flower heads. */
export interface GrassFlowers {
  /** 0..1 share of tufts carrying a flower head. */
  flowerShare: number;
  /** Flower head size in metres. */
  flowerSize: number;
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
}

/** Blade material and light. */
export interface GrassLighting {
  /** 0..1 blend of blade normals toward straight-up, so the field lights as one soft surface. */
  normalLift: number;
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
  species: GrassSecondSpecies;
  flowers: GrassFlowers;
  growth: GrassGrowth;
  mowing: GrassMowing;
  wind: GrassWind;
  lighting: GrassLighting;
  /** Seed; the same seed reproduces the same layout. */
  seed: string;
}

/** Every grass knob flat, the shape a volume's `meta`, the inspector schema and presets use. */
export type GrassKnobs = GrassBlade & GrassTuft & GrassColour & GrassSeason & GrassSecondSpecies & GrassFlowers & GrassGrowth & GrassMowing & GrassWind & GrassLighting & { seed: string };

const FLAT_DEFAULTS: GrassKnobs = {
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
  bareGround: 0,
  growAbove: -100,
  stripeWidth: 0,
  stripeContrast: 0.35,
  stripeAngle: 0,
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

/** Group a flat knob set into a {@link GrassLook}. @internal */
export function groupGrassKnobs(knobs: GrassKnobs): GrassLook {
  return {
    blade: { density: knobs.density, bladeHeight: knobs.bladeHeight, heightVariation: knobs.heightVariation, bladeWidth: knobs.bladeWidth, widthVariation: knobs.widthVariation, profile: knobs.profile, curvature: knobs.curvature, stiffness: knobs.stiffness },
    tuft: { tuftSpread: knobs.tuftSpread, tuftBlades: knobs.tuftBlades, clumping: knobs.clumping, clumpSize: knobs.clumpSize },
    colour: { baseColor: knobs.baseColor, tipColor: knobs.tipColor, gradient: knobs.gradient, hueNoise: knobs.hueNoise, valueNoise: knobs.valueNoise },
    season: { season: knobs.season, seasonNoise: knobs.seasonNoise, dryness: knobs.dryness, noiseScale: knobs.noiseScale },
    species: { mixShare: knobs.mixShare, mixHeight: knobs.mixHeight, mixWidth: knobs.mixWidth, mixColor: knobs.mixColor },
    flowers: { flowerShare: knobs.flowerShare, flowerSize: knobs.flowerSize, flowerColor: knobs.flowerColor, flowerColor2: knobs.flowerColor2 },
    growth: { patchiness: knobs.patchiness, slopeThin: knobs.slopeThin, bareGround: knobs.bareGround, growAbove: knobs.growAbove, groundCover: knobs.groundCover },
    mowing: { stripeWidth: knobs.stripeWidth, stripeContrast: knobs.stripeContrast, stripeAngle: knobs.stripeAngle },
    wind: { windStrength: knobs.windStrength, windSpeed: knobs.windSpeed, windGust: knobs.windGust, windDirection: knobs.windDirection },
    lighting: { normalLift: knobs.normalLift, roughness: knobs.roughness, translucency: knobs.translucency },
    seed: knobs.seed,
  };
}

/** Grass defaults: a lush, lightly-swaying summer meadow. */
export const GRASS_DEFAULTS: GrassLook = groupGrassKnobs(FLAT_DEFAULTS);

/** A partial {@link GrassLook}: any groups, each with any of its knobs. */
export type GrassLookGroups = { [Group in Exclude<keyof GrassLook, "seed">]?: Partial<GrassLook[Group]> } & { seed?: string };

/** The flat knobs of a grouped look or partial look, for a `meta` or schema parse. @internal */
export function flattenGrassLook(look: GrassLookGroups): Partial<GrassKnobs> {
  const { seed, ...groups } = look;
  const flat: Partial<GrassKnobs> = seed === undefined ? {} : { seed };
  for (const group of Object.values(groups)) Object.assign(flat, group);
  return flat;
}

type NumberKey = { [K in keyof GrassKnobs]: GrassKnobs[K] extends number ? K : never }[keyof GrassKnobs];
type ColorKey = "baseColor" | "tipColor" | "mixColor" | "flowerColor" | "flowerColor2";

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
  tuftBlades: [2, 9],
  gradient: [0.2, 1],
  hueNoise: [0, 0.5],
  valueNoise: [0, 0.5],
  seasonNoise: [0, 0.6],
  dryness: [0, 0.7],
  mixHeight: [0.5, 2.5],
  mixWidth: [0.5, 2.5],
  patchiness: [0, 0.35],
  bareGround: [0, 0.3],
  normalLift: [0.3, 1],
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

/**
 * Starting looks the inspector offers as one-click applies. Each is plain knob values, so a game
 * tweaks from it or ignores it; together with the seed they are the quickest route to a distinct field.
 */
const { seed: _seed, ...LOOK_BASE } = FLAT_DEFAULTS;
const preset = (id: string, label: string, values: Partial<Omit<GrassKnobs, "seed">>) => ({ id, label, values: { ...LOOK_BASE, ...values } });

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
  preset("green", "Putting green", { density: 1, bladeHeight: 0.02, heightVariation: 0.05, bladeWidth: 0.01, widthVariation: 0.2, profile: 0.3,
    curvature: 0.05, stiffness: 0.95, tuftSpread: 0.03, tuftBlades: 7, baseColor: "#2a5a26", tipColor: "#5fa040", gradient: 0.6, hueNoise: 0.05,
    valueNoise: 0.15, seasonNoise: 0.05, clumping: 0, slopeThin: 0, windStrength: 0, normalLift: 0.85, groundCover: 1, stripeWidth: 1.2, stripeContrast: 0.25 }),
  preset("fairway", "Striped fairway", { density: 0.9, bladeHeight: 0.035, heightVariation: 0.1, bladeWidth: 0.014, widthVariation: 0.25, profile: 0.3,
    curvature: 0.1, stiffness: 0.9, tuftSpread: 0.04, tuftBlades: 7, baseColor: "#335f2a", tipColor: "#76b44c", hueNoise: 0.08, valueNoise: 0.2,
    seasonNoise: 0.1, clumping: 0.05, windStrength: 0.04, normalLift: 0.8, groundCover: 1, stripeWidth: 4, stripeContrast: 0.55, stripeAngle: 30 }),
  preset("savanna", "Tall savanna", { density: 0.45, bladeHeight: 1.8, heightVariation: 0.45, bladeWidth: 0.022, widthVariation: 0.4, profile: 0.1,
    curvature: 0.5, stiffness: 0.35, tuftSpread: 0.28, tuftBlades: 9, baseColor: "#7a6a3a", tipColor: "#e0c27a", gradient: 0.3, season: 0.5,
    dryness: 0.55, seasonNoise: 0.45, mixShare: 0.15, mixHeight: 1.3, mixColor: "#d9b878", clumping: 0.75, clumpSize: 1.4, bareGround: 0.35,
    windStrength: 0.55, windGust: 0.2, translucency: 0.85, groundCover: 0.35 }),
  preset("dune", "Beach dune grass", { density: 0.35, bladeHeight: 0.75, heightVariation: 0.4, bladeWidth: 0.012, widthVariation: 0.3, profile: 0.05,
    curvature: 0.75, stiffness: 0.3, tuftSpread: 0.18, tuftBlades: 9, baseColor: "#6f7a48", tipColor: "#c8c08a", dryness: 0.35, seasonNoise: 0.3,
    clumping: 0.9, clumpSize: 1.2, bareGround: 0.6, slopeThin: 0.2, windStrength: 0.7, windSpeed: 2, windGust: 0.35, windDirection: 200, groundCover: 0 }),
];

/** The grass parameter schema: drives the inspector, the variant grid and every `meta` parse. */
export const GRASS_SCHEMA = defineParamSchema({
  groups: [
    { id: "blade", label: "Blade" },
    { id: "colour", label: "Colour" },
    { id: "species", label: "Species & flowers", collapsed: true },
    { id: "growth", label: "Growth & masks", collapsed: true },
    { id: "mowing", label: "Mow stripes", collapsed: true, parent: "growth" },
    { id: "wind", label: "Wind", collapsed: true },
    { id: "light", label: "Light", collapsed: true },
  ],
  presets: GRASS_PRESETS,
  fields: [
    range("density", "fullness", 0, 1, 0.01),
    range("bladeHeight", "height", 0.01, 2.5, 0.005, "blade", "m"),
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
    range("bareGround", "bare ground", 0, 1, 0.01, "growth"),
    range("growAbove", "grows above", -100, 500, 0.1, "growth", "m"),
    range("stripeWidth", "stripe width", 0, 8, 0.1, "mowing", "m"),
    range("stripeContrast", "stripe contrast", 0, 1, 0.01, "mowing"),
    range("stripeAngle", "stripe heading", 0, 180, 1, "mowing", "°"),
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
});

/** Parse a volume's `meta` (or a `grass()` config) into a fully-defaulted, clamped look. @internal */
export function readGrassLook(meta: Readonly<Record<string, unknown>> | undefined): GrassLook {
  return groupGrassKnobs(parseParams(GRASS_SCHEMA, meta));
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
 * The grass generator: one schema from a putting green to tall savanna and dune grass. Detail picks
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
    return { look, seed: context.seed, segments, template: createGrassTuftTemplate({ look, seed: context.seed, segments }), bladesPerM2: grassBladeDensity(look) };
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
    resolve: (object) => resolveGrassObject(object),
    note: (object) => {
      const resolved = resolveGrassObject(object);
      if (resolved === null) return "Give the volume a box footprint.";
      const perArea = grassBladeDensity(resolved.look);
      return `${Math.round(resolved.size[0])}×${Math.round(resolved.size[1])} m · ${Math.round(perArea)} blades/m² near the camera, thinned with distance`;
    },
  });
}
