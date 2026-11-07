/**
 * How grass is drawn, apart from what grows. A species says what grows (blade size and count, leaf
 * shape, natural colours, heads); a style says how it is drawn, from cartoon through animated film
 * to photoreal. `realism` moves every other style slider along its own curve, and a slider set by
 * hand wins. A world sets one style (`environment.grassStyle` in the scene document, or
 * `environment({ grassStyle })` in code) and a patch may override it (`style` in a `grass_field`
 * volume's `meta` or a `grass()` config).
 *
 * Every curve passes through today's look at realism 0.5, so a scene that sets no style draws as it
 * did before styles existed.
 *
 * @capability grass-style realism and style sliders for grass, from cartoon to photoreal
 */
import { readUrlParam } from "@jgengine/core/devtools/urlFlags";
import { defineParamSchema, parseParams, presetBackedMeta } from "@jgengine/core/generator/paramSchema";

/** How a grass field is drawn. */
export interface GrassStyle {
  /** 0..1: 0 cartoon, 0.5 animated film, 1 photoreal. Moves every slider below that nothing sets by hand. */
  realism: number;
  /** 0..1 blend of blade normals toward straight-up: high lights the field as one soft painted surface, low lights each blade on its own. */
  normalLift: number;
  /**
   * 0..1 blade count against blade width at the same ground cover: 0 draws a third as many blades,
   * each three times as wide; 1 draws six times as many, each a sixth as wide. 0.5 is the species as
   * it is. See {@link grassDetailScale}.
   */
  detail: number;
  /**
   * 0..1 shape exaggeration: 1 grows even heights, round tips and big curls; 0 grows irregular
   * lengths lying every way, and mown blades end blunt and torn. 0.5 is the species as it is.
   */
  exaggeration: number;
}

/** The style sliders `realism` drives: every style knob but `realism` itself. */
export type GrassStyleSlider = Exclude<keyof GrassStyle, "realism">;

/** A species' own tuning of style sliders, as it would be drawn at the default realism. */
export type GrassStyleTuning = Partial<Record<GrassStyleSlider, number>>;

/** A style as authored: any sliders, plus an optional named preset (`cartoon`, `painterly`, `animated`, `realistic`) backing the ones left unset. */
export type GrassStyleSettings = Partial<GrassStyle> & { preset?: string };

/** The realism a scene that sets none draws at: the look grass had before styles. */
export const GRASS_REALISM_DEFAULT = 0.5;

/** Each slider's value at a realism, when nothing sets it by hand. Every curve passes through the pre-style look at 0.5. */
export const GRASS_STYLE_CURVES: Readonly<Record<GrassStyleSlider, (realism: number) => number>> = {
  normalLift: (realism) => 0.85 - 0.5 * realism,
  detail: (realism) => realism,
  exaggeration: (realism) => 1 - realism,
};

/**
 * Blades drawn per blade a species grows, at a `detail`: 1 at 0.5, rising to 6 at 1 and falling to a
 * third at 0. Each blade's width divides by the same number, so count times width, the ground the
 * blades cover, never changes with detail.
 */
export function grassDetailScale(detail: number): number {
  const centred = 2 * Math.max(0, Math.min(1, detail)) - 1;
  return centred >= 0 ? 6 ** centred : 3 ** centred;
}

/** `exaggeration` as -1 (natural) .. 0 (the species as it is) .. 1 (cartoon). */
export function grassExaggerationAmount(exaggeration: number): number {
  return 2 * Math.max(0, Math.min(1, exaggeration)) - 1;
}

/**
 * The realism a page asks for with `?realism=<0..1>`, else undefined. It overrides every patch's and
 * world's realism, so a board or perf run can draw any scene at any realism (`bun run shoot ...
 * --param realism=1`, `bun run perf ... --param realism=1`); sliders set by hand still win.
 */
export function grassRealismFromPage(): number | undefined {
  const raw = readUrlParam("realism");
  if (raw === null || raw.trim() === "") return undefined;
  const realism = Number(raw);
  return Number.isFinite(realism) ? clamp01(realism) : undefined;
}

const SLIDERS = Object.keys(GRASS_STYLE_CURVES) as GrassStyleSlider[];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** The grass style schema: the editor's grass style sections, their presets and every style parse. */
export const GRASS_STYLE_SCHEMA = defineParamSchema({
  groups: [{ id: "shape", label: "Detail and shape", collapsed: true }, { id: "light", label: "Light", collapsed: true }],
  presets: [
    { id: "cartoon", label: "Cartoon", values: { realism: 0 } },
    { id: "painterly", label: "Painterly", values: { realism: 0.3 } },
    { id: "animated", label: "Animated", values: { realism: GRASS_REALISM_DEFAULT } },
    { id: "realistic", label: "Realistic", values: { realism: 1 } },
  ],
  presetKey: "preset",
  fields: [
    { type: "range", key: "realism", label: "realism (cartoon → photoreal)", min: 0, max: 1, step: 0.01, default: GRASS_REALISM_DEFAULT },
    { type: "range", key: "detail", label: "detail (few wide → many thin blades)", min: 0, max: 1, step: 0.01, default: GRASS_STYLE_CURVES.detail(GRASS_REALISM_DEFAULT), group: "shape" },
    { type: "range", key: "exaggeration", label: "exaggeration (natural → cartoon shapes)", min: 0, max: 1, step: 0.01, default: GRASS_STYLE_CURVES.exaggeration(GRASS_REALISM_DEFAULT), group: "shape" },
    { type: "range", key: "normalLift", label: "normal lift (per blade → soft)", min: 0, max: 1, step: 0.01, default: GRASS_STYLE_CURVES.normalLift(GRASS_REALISM_DEFAULT), group: "light" },
  ],
});

/** The style a scene that sets nothing draws with (a page's `?realism=` aside). */
export const GRASS_STYLE_DEFAULTS: GrassStyle = {
  realism: GRASS_REALISM_DEFAULT,
  normalLift: GRASS_STYLE_CURVES.normalLift(GRASS_REALISM_DEFAULT),
  detail: GRASS_STYLE_CURVES.detail(GRASS_REALISM_DEFAULT),
  exaggeration: GRASS_STYLE_CURVES.exaggeration(GRASS_REALISM_DEFAULT),
};

type StyleInput = Readonly<Record<string, unknown>> | undefined;

function readStyle(settings: unknown): { has: (key: keyof GrassStyle) => boolean; values: GrassStyle } {
  const bag: StyleInput = typeof settings === "object" && settings !== null && !Array.isArray(settings) ? (settings as Record<string, unknown>) : undefined;
  const backed = presetBackedMeta(GRASS_STYLE_SCHEMA, bag);
  // type-escape: parseParams fills exactly the schema's range fields, which are GrassStyle's.
  const values = parseParams(GRASS_STYLE_SCHEMA, bag) as GrassStyle;
  return { has: (key) => typeof backed?.[key] === "number" && Number.isFinite(backed[key]), values };
}

/**
 * The style a patch draws with. Realism comes from the page (`?realism=`, see
 * {@link grassRealismFromPage}), else the patch, else the world, else 0.5. Each slider comes from the
 * patch, else the world, else the species' own tuning carried along the slider's curve (so realism
 * still moves it), else the curve.
 * @internal
 */
export function resolveGrassStyle(patch: unknown, world: unknown, species: GrassStyleTuning | undefined): GrassStyle {
  const own = readStyle(patch);
  const shared = readStyle(world);
  const realism = grassRealismFromPage() ?? (own.has("realism") ? own.values.realism : shared.has("realism") ? shared.values.realism : GRASS_REALISM_DEFAULT);
  const style: GrassStyle = { realism, normalLift: 0, detail: 0, exaggeration: 0 };
  for (const slider of SLIDERS) {
    const curve = GRASS_STYLE_CURVES[slider];
    const tuned = species?.[slider];
    style[slider] = own.has(slider) ? own.values[slider]
      : shared.has(slider) ? shared.values[slider]
      : tuned !== undefined ? clamp01(tuned + (curve(realism) - curve(GRASS_REALISM_DEFAULT)))
      : curve(realism);
  }
  return style;
}
