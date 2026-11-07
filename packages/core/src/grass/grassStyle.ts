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
import { defineParamSchema, parseParams, presetBackedMeta } from "@jgengine/core/generator/paramSchema";

/** How a grass field is drawn. */
export interface GrassStyle {
  /** 0..1: 0 cartoon, 0.5 animated film, 1 photoreal. Moves every slider below that nothing sets by hand. */
  realism: number;
  /** 0..1 blend of blade normals toward straight-up: high lights the field as one soft painted surface, low lights each blade on its own. */
  normalLift: number;
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
};

const SLIDERS = Object.keys(GRASS_STYLE_CURVES) as GrassStyleSlider[];

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** The grass style schema: the editor's grass style sections, their presets and every style parse. */
export const GRASS_STYLE_SCHEMA = defineParamSchema({
  groups: [{ id: "light", label: "Light", collapsed: true }],
  presets: [
    { id: "cartoon", label: "Cartoon", values: { realism: 0 } },
    { id: "painterly", label: "Painterly", values: { realism: 0.3 } },
    { id: "animated", label: "Animated", values: { realism: GRASS_REALISM_DEFAULT } },
    { id: "realistic", label: "Realistic", values: { realism: 1 } },
  ],
  presetKey: "preset",
  fields: [
    { type: "range", key: "realism", label: "realism (cartoon → photoreal)", min: 0, max: 1, step: 0.01, default: GRASS_REALISM_DEFAULT },
    { type: "range", key: "normalLift", label: "normal lift (per blade → soft)", min: 0, max: 1, step: 0.01, default: GRASS_STYLE_CURVES.normalLift(GRASS_REALISM_DEFAULT), group: "light" },
  ],
});

/** The style a scene that sets nothing draws with. */
export const GRASS_STYLE_DEFAULTS: GrassStyle = resolveGrassStyle(undefined, undefined, undefined);

type StyleInput = Readonly<Record<string, unknown>> | undefined;

function readStyle(settings: unknown): { has: (key: keyof GrassStyle) => boolean; values: GrassStyle } {
  const bag: StyleInput = typeof settings === "object" && settings !== null && !Array.isArray(settings) ? (settings as Record<string, unknown>) : undefined;
  const backed = presetBackedMeta(GRASS_STYLE_SCHEMA, bag);
  // type-escape: parseParams fills exactly the schema's two range fields, which is GrassStyle.
  const values = parseParams(GRASS_STYLE_SCHEMA, bag) as GrassStyle;
  return { has: (key) => typeof backed?.[key] === "number" && Number.isFinite(backed[key]), values };
}

/**
 * The style a patch draws with. Realism comes from the patch, else the world, else 0.5. Each slider
 * comes from the patch, else the world, else the species' own tuning carried along the slider's
 * curve (so realism still moves it), else the curve.
 * @internal
 */
export function resolveGrassStyle(patch: unknown, world: unknown, species: GrassStyleTuning | undefined): GrassStyle {
  const own = readStyle(patch);
  const shared = readStyle(world);
  const realism = own.has("realism") ? own.values.realism : shared.has("realism") ? shared.values.realism : GRASS_REALISM_DEFAULT;
  const style: GrassStyle = { realism, normalLift: 0 };
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
