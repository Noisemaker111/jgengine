/**
 * The typed parameter schema every generator and studio shares: an ordered list of fields (sliders,
 * toggles, colours, enums, seeds, weighted lists, curves, gradients) in optionally nested groups,
 * plus presets. One schema drives the editor inspector, `meta` parsing and validation, randomize and
 * reset, and the seeded variant grid, so a new generator writes no UI or parsing code of its own.
 * Declare a schema with {@link defineParamSchema} and {@link ParamsOf} gives the parsed params' type.
 */

/** One weighted entry in a `weightedList` param — an item id and its relative spawn weight. */
export interface WeightedParamEntry {
  item: string;
  weight: number;
}

/** One control point of a `curve` param: `x` in 0..1 along the curve, `y` its value. */
export interface CurvePoint {
  x: number;
  y: number;
}

/** One stop of a `gradient` param: `at` in 0..1 and a hex colour. */
export interface GradientStop {
  at: number;
  color: string;
}

/** What every field row carries. */
interface ParamFieldBase {
  key: string;
  label?: string | undefined;
  /** Optional group id — the inspector renders fields sharing a group under one collapsible section. */
  group?: string;
  /** `false` keeps this field fixed when the variant grid explores around the current values. */
  vary?: boolean;
}

/** A numeric slider row: bounded range with a live readout. */
export interface RangeParamField extends ParamFieldBase {
  type: "range";
  min: number;
  max: number;
  step?: number;
  default: number;
  /** Suffix shown next to the readout, e.g. "m" or "/m²". */
  unit?: string;
  /** The window variants explore inside, when the full range allows values that stop looking right. Defaults to `[min, max]`. */
  explore?: readonly [number, number];
  /** `"log"` explores by ratio rather than by step, for sizes spanning orders of magnitude (needs `min > 0`). */
  exploreScale?: "linear" | "log";
}

/** A free numeric input, optionally clamped. */
export interface NumberParamField extends ParamFieldBase {
  type: "number";
  step?: number;
  default: number;
  min?: number;
  max?: number;
  /** The window variants explore inside. Defaults to `[min, max]`. */
  explore?: readonly [number, number];
}

/** A checkbox. */
export interface BoolParamField extends ParamFieldBase {
  type: "bool";
  default: boolean;
}

/** A dropdown of fixed string options. */
export interface SelectParamField extends ParamFieldBase {
  type: "select";
  options: readonly { value: string; label?: string }[];
  default: string;
}

/** A hex colour picker. */
export interface ColorParamField extends ParamFieldBase {
  type: "color";
  default: string;
  /** How far variants shift this colour at full explore. */
  explore?: ColorExplore;
}

/**
 * How far variant exploration may shift a colour at full explore, so a variant keeps the colour's
 * character instead of drifting to black or white.
 */
export interface ColorExplore {
  /** Hue shift in degrees. Default 24. */
  hue?: number;
  /** Saturation change as a fraction of the current saturation. Default 0.25. */
  saturation?: number;
  /** Lightness change, 0..1. Default 0.08. */
  lightness?: number;
}

/** A free string input. */
export interface TextParamField extends ParamFieldBase {
  type: "text";
  default: string;
}

/** A seed string with a reroll button — same seed reproduces the same generated result. */
export interface SeedParamField extends ParamFieldBase {
  type: "seed";
  default: string;
}

/** A repeatable list of weighted `{ item, weight }` rows (species palette, book set, …). */
export interface WeightedListParamField extends ParamFieldBase {
  type: "weightedList";
  /** Placeholder for the item id input. */
  itemLabel?: string;
  default: readonly WeightedParamEntry[];
}

/**
 * A curve over 0..1: control points the generator samples with {@link sampleCurve} (a height
 * profile, a falloff, a density-by-distance ramp). `y` is clamped to `[min, max]`.
 */
export interface CurveParamField extends ParamFieldBase {
  type: "curve";
  /** Lowest allowed `y`. Default 0. */
  min?: number;
  /** Highest allowed `y`. Default 1. */
  max?: number;
  default: readonly CurvePoint[];
}

/** A colour ramp over 0..1 the generator samples with {@link sampleGradient}. */
export interface GradientParamField extends ParamFieldBase {
  type: "gradient";
  default: readonly GradientStop[];
  /** How far variants shift every stop at full explore; all stops shift together. */
  explore?: ColorExplore;
}

/**
 * A button row that runs a built-in inspector action on its group — currently `"randomize"` (reroll
 * the group's numeric/seed/bool/select fields within their bounds) or `"reset"` (restore group
 * defaults). Carries no persisted value; purely a control.
 */
export interface ActionParamField {
  type: "action";
  key: string;
  label?: string | undefined;
  group?: string;
  action: "randomize" | "reset";
}

/** One row in a parameter schema — the union the generic inspector knows how to render. */
export type ParamField =
  | RangeParamField
  | NumberParamField
  | BoolParamField
  | SelectParamField
  | ColorParamField
  | TextParamField
  | SeedParamField
  | WeightedListParamField
  | CurveParamField
  | GradientParamField
  | ActionParamField;

/** A named, optionally collapsed section the inspector groups fields under (by `field.group === id`). */
export interface ParamGroup {
  id: string;
  label: string;
  /** Start collapsed. Default expanded. */
  collapsed?: boolean;
  /** Parent group id: this section renders inside that one. Omit for a top-level section. */
  parent?: string;
}

/**
 * A named slider/weight bundle — a saved set of field values the inspector (or the `apply_preset`
 * verb) writes into an object's `meta` in one patch, ready to tweak afterwards. Presets are plain
 * data on the schema, so a generator ships starting looks and games can override the registration.
 */
export interface ParamPreset {
  id: string;
  label?: string;
  /** Field values the preset writes; fields not listed keep their current values. */
  values: Readonly<Record<string, unknown>>;
}

/** A full parameter surface: an ordered list of fields the inspector renders top to bottom. */
export interface ParamSchema<Fields extends readonly ParamField[] = readonly ParamField[]> {
  fields: Fields;
  /** Optional named sections; fields reference one by `group`. Ungrouped fields render first, headerless. */
  groups?: readonly ParamGroup[] | undefined;
  /** Optional named field-value bundles the inspector offers as one-click applies. */
  presets?: readonly ParamPreset[];
}

/** The parsed value one field yields. */
export type ParamValue<Field extends ParamField> = Field extends RangeParamField | NumberParamField
  ? number
  : Field extends BoolParamField
    ? boolean
    : Field extends SelectParamField
      ? Field["options"][number]["value"]
      : Field extends ColorParamField | TextParamField | SeedParamField
        ? string
        : Field extends WeightedListParamField
          ? WeightedParamEntry[]
          : Field extends CurveParamField
            ? CurvePoint[]
            : Field extends GradientParamField
              ? GradientStop[]
              : never;

/** Parsed params after `parseParams` on an untyped schema: every field present, validated and defaulted. */
export type ParsedParams = Record<string, number | boolean | string | WeightedParamEntry[] | CurvePoint[] | GradientStop[]>;

type ValueField<Schema extends ParamSchema> = Exclude<Schema["fields"][number], ActionParamField>;

/**
 * The typed params a schema parses to: one property per non-action field, keyed by its `key`. A
 * schema declared with {@link defineParamSchema} keeps literal keys, so `ParamsOf<typeof SCHEMA>` is
 * an exact object type; a plain `ParamSchema` falls back to {@link ParsedParams}.
 */
export type ParamsOf<Schema extends ParamSchema> = string extends ValueField<Schema>["key"]
  ? ParsedParams
  : { [Field in ValueField<Schema> as Field["key"]]: ParamValue<Field> };

/**
 * Declare a schema and keep its field keys and option values as literal types, so
 * {@link ParamsOf} and {@link parseParams} return an exact params object instead of a loose record.
 */
export function defineParamSchema<const Fields extends readonly ParamField[]>(schema: ParamSchema<Fields>): ParamSchema<Fields> {
  return schema;
}

/** Look up a schema preset by id, or undefined — the seam `apply_preset` and games resolve bundles through. */
export function findSchemaPreset(schema: ParamSchema, id: string): ParamPreset | undefined {
  return schema.presets?.find((preset) => preset.id === id);
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** True for a `#rgb` or `#rrggbb` hex colour string. */
function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

function num(value: unknown, fallback: number, min?: number, max?: number): number {
  let n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  if (min !== undefined) n = Math.max(min, n);
  if (max !== undefined) n = Math.min(max, n);
  return n;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readWeightedList(value: unknown, fallback: readonly WeightedParamEntry[]): WeightedParamEntry[] {
  if (!Array.isArray(value)) return fallback.map((entry) => ({ ...entry }));
  const entries = value
    .filter(isRecord)
    .map((entry) => ({
      item: typeof entry["item"] === "string" ? entry["item"] : "",
      weight: num(entry["weight"], 1, 0),
    }))
    .filter((entry) => entry.item.length > 0);
  return entries.length > 0 ? entries : fallback.map((entry) => ({ ...entry }));
}

function readCurve(value: unknown, field: CurveParamField): CurvePoint[] {
  const min = field.min ?? 0;
  const max = field.max ?? 1;
  const points = Array.isArray(value)
    ? value
        .filter(isRecord)
        .filter((point) => typeof point["x"] === "number" && Number.isFinite(point["x"]) && typeof point["y"] === "number" && Number.isFinite(point["y"]))
        .map((point) => ({ x: num(point["x"], 0, 0, 1), y: num(point["y"], 0, min, max) }))
    : [];
  const source = points.length >= 2 ? points : field.default.map((point) => ({ ...point }));
  return source.sort((a, b) => a.x - b.x);
}

function readGradient(value: unknown, fallback: readonly GradientStop[]): GradientStop[] {
  const stops = Array.isArray(value)
    ? value
        .filter(isRecord)
        .filter((stop) => typeof stop["at"] === "number" && Number.isFinite(stop["at"]) && isHexColor(stop["color"]))
        .map((stop) => ({ at: num(stop["at"], 0, 0, 1), color: String(stop["color"]) }))
    : [];
  const source = stops.length >= 1 ? stops : fallback.map((stop) => ({ ...stop }));
  return source.sort((a, b) => a.at - b.at);
}

function parseField(field: Exclude<ParamField, ActionParamField>, raw: unknown): ParsedParams[string] {
  switch (field.type) {
    case "range":
    case "number": {
      const value = num(raw, field.default, field.min, field.max);
      return field.step !== undefined && field.step >= 1 ? Math.round(value) : value;
    }
    case "bool":
      return typeof raw === "boolean" ? raw : field.default;
    case "select": {
      const match = field.options.find((option) => option.value === raw);
      return match === undefined ? field.default : match.value;
    }
    case "color":
      return isHexColor(raw) ? raw : field.default;
    case "text":
    case "seed":
      return typeof raw === "string" ? raw : field.default;
    case "weightedList":
      return readWeightedList(raw, field.default);
    case "curve":
      return readCurve(raw, field);
    case "gradient":
      return readGradient(raw, field.default);
  }
}

function parseInto(schema: ParamSchema, meta: Readonly<Record<string, unknown>> | undefined): ParsedParams {
  const out: ParsedParams = {};
  for (const field of schema.fields) {
    if (field.type === "action") continue;
    out[field.key] = parseField(field, meta?.[field.key]);
  }
  return out;
}

/**
 * Parse a raw `meta` bag against a schema into typed params — every field present, invalid or
 * missing values replaced by the field default, numbers clamped to their range (and rounded when
 * `step >= 1`), colours checked as hex. The single parser every generator and studio shares.
 */
export function parseParams<Schema extends ParamSchema>(schema: Schema, meta: Readonly<Record<string, unknown>> | undefined): ParamsOf<Schema> {
  // type-escape: parseInto fills exactly one validated value per schema field, which is what ParamsOf describes.
  return parseInto(schema, meta) as ParamsOf<Schema>;
}

/** One validation problem found by {@link validateParams}: which field and why. */
export interface ParamIssue {
  key: string;
  message: string;
}

/**
 * Check a raw `meta` bag against a schema without mutating it — reports out-of-range numbers, unknown
 * select values, and wrong types. Empty array means valid. Used by `set_meta` to reject bad agent
 * patches before they land in the document.
 * @internal
 */
export function validateParams(schema: ParamSchema, meta: Readonly<Record<string, unknown>> | undefined): ParamIssue[] {
  const issues: ParamIssue[] = [];
  if (meta === undefined) return issues;
  for (const field of schema.fields) {
    const raw = meta[field.key];
    if (raw === undefined) continue;
    switch (field.type) {
      case "range":
        if (typeof raw !== "number" || !Number.isFinite(raw)) issues.push({ key: field.key, message: "expected a number" });
        else if (raw < field.min || raw > field.max) issues.push({ key: field.key, message: `out of range ${field.min}..${field.max}` });
        break;
      case "number":
        if (typeof raw !== "number" || !Number.isFinite(raw)) issues.push({ key: field.key, message: "expected a number" });
        else if ((field.min !== undefined && raw < field.min) || (field.max !== undefined && raw > field.max))
          issues.push({ key: field.key, message: "out of range" });
        break;
      case "bool":
        if (typeof raw !== "boolean") issues.push({ key: field.key, message: "expected a boolean" });
        break;
      case "select":
        if (!field.options.some((option) => option.value === raw)) issues.push({ key: field.key, message: "not an allowed option" });
        break;
      case "color":
        if (!isHexColor(raw)) issues.push({ key: field.key, message: "expected a hex colour" });
        break;
      case "text":
      case "seed":
        if (typeof raw !== "string") issues.push({ key: field.key, message: "expected a string" });
        break;
      case "weightedList":
      case "curve":
      case "gradient":
        if (!Array.isArray(raw)) issues.push({ key: field.key, message: "expected an array" });
        break;
      case "action":
        break;
    }
  }
  return issues;
}

function channelHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");
}

function hexChannels(hex: string): [number, number, number] {
  const body = hex.slice(1);
  const full = body.length === 3 ? [...body].map((c) => c + c).join("") : body;
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Mix two hex colours (3- or 6-digit) in sRGB, clamped. */
function blendHex(a: string, b: string, t: number): string {
  const ca = hexChannels(isHexColor(a) ? a : "#000000");
  const cb = hexChannels(isHexColor(b) ? b : "#000000");
  const k = Math.max(0, Math.min(1, t));
  return `#${channelHex(ca[0] + (cb[0] - ca[0]) * k)}${channelHex(ca[1] + (cb[1] - ca[1]) * k)}${channelHex(ca[2] + (cb[2] - ca[2]) * k)}`;
}

/** The value of a curve at `x` (0..1), linear between control points and flat past the ends. */
export function sampleCurve(points: readonly CurvePoint[], x: number): number {
  const first = points[0];
  if (first === undefined) return 0;
  if (x <= first.x) return first.y;
  for (let i = 1; i < points.length; i += 1) {
    const b = points[i];
    const a = points[i - 1];
    if (a === undefined || b === undefined) break;
    if (x <= b.x) return b.x === a.x ? b.y : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  }
  return points[points.length - 1]?.y ?? first.y;
}

/**
 * The hex colour of a gradient at `t` (0..1), mixed between neighbouring stops.
 * @capability generator-contract seeded, schema-driven procedural generator with variants and editor exposure
 */
export function sampleGradient(stops: readonly GradientStop[], t: number): string {
  const first = stops[0];
  if (first === undefined) return "#000000";
  if (t <= first.at) return first.color;
  for (let i = 1; i < stops.length; i += 1) {
    const b = stops[i];
    const a = stops[i - 1];
    if (a === undefined || b === undefined) break;
    if (t <= b.at) return b.at === a.at ? b.color : blendHex(a.color, b.color, (t - a.at) / (b.at - a.at));
  }
  return stops[stops.length - 1]?.color ?? first.color;
}

function randomHex(random: () => number): string {
  return `#${channelHex(60 + random() * 180)}${channelHex(60 + random() * 180)}${channelHex(60 + random() * 180)}`;
}

function exploreWindow(window: readonly [number, number] | undefined, min: number, max: number, current: number): [number, number] {
  const low = Math.max(min, window?.[0] ?? min);
  const high = Math.min(max, window?.[1] ?? max);
  return [Math.min(low, current), Math.max(high, current)];
}

interface ColourShift {
  hue: number;
  saturation: number;
  lightness: number;
}

function colourShift(explore: ColorExplore | undefined, random: () => number, k: number): ColourShift {
  return {
    hue: (random() * 2 - 1) * (explore?.hue ?? 24) * k,
    saturation: (random() * 2 - 1) * (explore?.saturation ?? 0.25) * k,
    lightness: (random() * 2 - 1) * (explore?.lightness ?? 0.08) * k,
  };
}

/** Shift a hex colour in HSL: hue by degrees, saturation by a fraction of itself, lightness by an amount. */
function shiftHex(hex: string, shift: ColourShift): string {
  if (!isHexColor(hex)) return hex;
  const [r255, g255, b255] = hexChannels(hex);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const hue = (((h * 60 + shift.hue) % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, s * (1 + shift.saturation)));
  const light = Math.max(0, Math.min(1, l + shift.lightness));
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  const sector = Math.floor(hue / 60);
  const [pr, pg, pb] = sector === 0 ? [c, x, 0] : sector === 1 ? [x, c, 0] : sector === 2 ? [0, c, x] : sector === 3 ? [0, x, c] : sector === 4 ? [x, 0, c] : [c, 0, x];
  return `#${channelHex((pr + m) * 255)}${channelHex((pg + m) * 255)}${channelHex((pb + m) * 255)}`;
}

function roundTo(field: RangeParamField | NumberParamField, value: number): number {
  return field.step !== undefined && field.step >= 1 ? Math.round(value) : Math.round(value * 1000) / 1000;
}

/**
 * A `meta` patch that randomizes every field in `groupId` within its bounds — the "randomize" button's
 * behaviour, pure and injectable so it's deterministic in tests. Ranges/numbers land in `[min, max]`
 * (integer-rounded when `step >= 1`), bools/selects pick uniformly, seeds get a fresh token, colours a
 * random mid-tone. Text, weighted lists, curves and gradients are left untouched.
 * @internal
 */
export function randomizeGroupParams(schema: ParamSchema, groupId: string | undefined, random: () => number): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (field.group !== groupId) continue;
    switch (field.type) {
      case "range":
        patch[field.key] = roundTo(field, field.min + random() * (field.max - field.min));
        break;
      case "number":
        if (field.min !== undefined && field.max !== undefined) patch[field.key] = roundTo(field, field.min + random() * (field.max - field.min));
        else patch[field.key] = roundTo(field, field.default * (0.5 + random()));
        break;
      case "bool":
        patch[field.key] = random() < 0.5;
        break;
      case "select": {
        const option = field.options[Math.floor(random() * field.options.length)];
        if (option !== undefined) patch[field.key] = option.value;
        break;
      }
      case "seed":
        patch[field.key] = `r${Math.floor(random() * 1_000_000).toString(36)}`;
        break;
      case "color":
        patch[field.key] = randomHex(random);
        break;
      case "text":
      case "weightedList":
      case "curve":
      case "gradient":
      case "action":
        break;
    }
  }
  return patch;
}

/**
 * A `meta` patch that nudges every variable field of `base` by up to `amount` (0..1) of its range —
 * the variant grid's "explore around this" step. Numbers move within their bounds, colours drift
 * toward a random tone, bools and selects flip with probability `amount / 2`, curves move their
 * points. Fields marked `vary: false`, seeds, text and weighted lists stay as they are.
 * @capability generator-contract seeded, schema-driven procedural generator with variants and editor exposure
 */
export function jitterParams(schema: ParamSchema, base: Readonly<Record<string, unknown>> | undefined, random: () => number, amount: number): Record<string, unknown> {
  const k = Math.max(0, Math.min(1, amount));
  const parsed = parseInto(schema, base);
  const patch: Record<string, unknown> = {};
  if (k === 0) return patch;
  for (const field of schema.fields) {
    if (field.type === "action" || field.vary === false) continue;
    const current = parsed[field.key];
    switch (field.type) {
      case "range": {
        if (typeof current !== "number") break;
        const [low, high] = exploreWindow(field.explore, field.min, field.max, current);
        const step = random() * 2 - 1;
        const next =
          field.exploreScale === "log" && low > 0 && current > 0
            ? current * Math.pow(high / low, step * k * 0.25)
            : current + step * (high - low) * k * 0.5;
        patch[field.key] = roundTo(field, Math.max(low, Math.min(high, next)));
        break;
      }
      case "number": {
        if (typeof current !== "number") break;
        const bounded = field.explore !== undefined || (field.min !== undefined && field.max !== undefined);
        const [low, high] = exploreWindow(field.explore, field.min ?? -Infinity, field.max ?? Infinity, current);
        const span = bounded ? high - low : Math.max(1, Math.abs(current));
        patch[field.key] = roundTo(field, Math.max(low, Math.min(high, current + (random() * 2 - 1) * span * k * 0.5)));
        break;
      }
      case "bool":
        if (typeof current === "boolean" && random() < k / 2) patch[field.key] = !current;
        break;
      case "select": {
        if (random() >= k / 2) break;
        const option = field.options[Math.floor(random() * field.options.length)];
        if (option !== undefined) patch[field.key] = option.value;
        break;
      }
      case "color":
        if (typeof current === "string") patch[field.key] = shiftHex(current, colourShift(field.explore, random, k));
        break;
      case "curve": {
        const min = field.min ?? 0;
        const max = field.max ?? 1;
        patch[field.key] = readCurve(base?.[field.key], field).map((point) => ({ x: point.x, y: num(point.y + (random() * 2 - 1) * (max - min) * k * 0.5, point.y, min, max) }));
        break;
      }
      case "gradient": {
        const shift = colourShift(field.explore, random, k);
        patch[field.key] = readGradient(base?.[field.key], field.default).map((stop) => ({ at: stop.at, color: shiftHex(stop.color, shift) }));
        break;
      }
      case "seed":
      case "text":
      case "weightedList":
        break;
    }
  }
  return patch;
}

function defaultValue(field: Exclude<ParamField, ActionParamField>): unknown {
  switch (field.type) {
    case "weightedList":
    case "curve":
    case "gradient":
      return field.default.map((entry) => ({ ...entry }));
    default:
      return field.default;
  }
}

/** A `meta` patch restoring every field in `groupId` to its schema default — the "reset" button. @internal */
export function resetGroupParams(schema: ParamSchema, groupId: string | undefined): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (field.group !== groupId || field.type === "action") continue;
    patch[field.key] = defaultValue(field);
  }
  return patch;
}

/** The `meta` patch that fills a fresh object with its schema defaults. @internal */
export function defaultParamMeta(schema: ParamSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (field.type === "action") continue;
    out[field.key] = defaultValue(field);
  }
  return out;
}

/** The groups nested directly under `parent` (top-level groups when `parent` is undefined), in declared order. */
export function childParamGroups(schema: ParamSchema, parent: string | undefined): ParamGroup[] {
  const groups = schema.groups ?? [];
  const known = new Set(groups.map((group) => group.id));
  return groups.filter((group) => (parent === undefined ? group.parent === undefined || !known.has(group.parent) : group.parent === parent));
}
