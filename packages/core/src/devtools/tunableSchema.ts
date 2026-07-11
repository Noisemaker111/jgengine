export type DevtoolsControlKind =
  | "slider"
  | "toggle"
  | "color"
  | "select"
  | "text"
  | "vec2"
  | "vec3"
  | "vec4"
  | "interval"
  | "angle"
  | "enum";

export type AngleUnit = "rad" | "deg";

export type TunableVec2 = [number, number];
export type TunableVec3 = [number, number, number];
export type TunableVec4 = [number, number, number, number];
export type TunableInterval = { min: number; max: number };

export interface TunableChoice<T = unknown> {
  readonly value: T;
  readonly label?: string;
}

export interface TunableOptions<T = unknown> {
  min?: number;
  max?: number;
  step?: number;
  options?: readonly T[];
  choices?: readonly TunableChoice<T>[];
  label?: string;
  group?: string;
  onChange?: (value: T) => void;
  kind?: DevtoolsControlKind;
  unit?: AngleUnit;
  displayUnit?: AngleUnit;
  wrap?: boolean;
  integer?: boolean;
  axisLabels?: readonly string[];
  axisMin?: number | readonly number[];
  axisMax?: number | readonly number[];
  axisStep?: number | readonly number[];
  alpha?: boolean;
}

export interface DiscoverySkip {
  readonly path: string;
  readonly reason: string;
}

export interface ScanFieldMeta extends TunableOptions {
  kind?: DevtoolsControlKind;
}

export type ScanMeta = Readonly<Record<string, ScanFieldMeta>>;

export const OVERRIDES_FORMAT_VERSION = 1;
export const CONTROL_SCHEMA_VERSION = 1;

export const MAX_TABLE_ENTRIES = 64;
export const MAX_SCAN_DEPTH = 5;
export const MAX_SCAN_TARGETS = 512;

const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const DEFAULT_AXIS = ["x", "y", "z", "w"] as const;

export interface NormalizedColor {
  readonly hex: string;
  readonly rgb: string;
  readonly alpha: number;
  readonly hasAlpha: boolean;
}

export interface ResolvedAxisBounds {
  readonly labels: readonly string[];
  readonly min: readonly number[];
  readonly max: readonly number[];
  readonly step: readonly number[];
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function escapePathSegment(segment: string): string {
  return segment.replace(/\\/g, "\\\\").replace(/\./g, "\\.");
}

export function unescapePathSegment(segment: string): string {
  let out = "";
  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i]!;
    if (ch === "\\" && i + 1 < segment.length) {
      out += segment[i + 1]!;
      i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

export function joinTunablePath(parent: string, segment: string): string {
  const escaped = escapePathSegment(segment);
  return parent === "" ? escaped : `${parent}.${escaped}`;
}

export function splitTunablePath(path: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < path.length; i += 1) {
    const ch = path[i]!;
    if (ch === "\\" && i + 1 < path.length) {
      current += ch + path[i + 1]!;
      i += 1;
      continue;
    }
    if (ch === ".") {
      parts.push(unescapePathSegment(current));
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(unescapePathSegment(current));
  return parts;
}

export function parseColor(input: unknown): NormalizedColor | null {
  if (typeof input !== "string" || !COLOR_PATTERN.test(input)) return null;
  const raw = input.slice(1);
  let r: string;
  let g: string;
  let b: string;
  let a: string | null = null;
  if (raw.length === 3) {
    r = raw[0]! + raw[0]!;
    g = raw[1]! + raw[1]!;
    b = raw[2]! + raw[2]!;
  } else if (raw.length === 6) {
    r = raw.slice(0, 2);
    g = raw.slice(2, 4);
    b = raw.slice(4, 6);
  } else {
    r = raw.slice(0, 2);
    g = raw.slice(2, 4);
    b = raw.slice(4, 6);
    a = raw.slice(6, 8);
  }
  const rgb = `#${r.toLowerCase()}${g.toLowerCase()}${b.toLowerCase()}`;
  if (a === null) {
    return { hex: rgb, rgb, alpha: 1, hasAlpha: false };
  }
  const alpha = Number.parseInt(a, 16) / 255;
  const hex = `${rgb}${a.toLowerCase()}`;
  return { hex, rgb, alpha, hasAlpha: true };
}

export function formatColor(rgb: string, alpha: number, withAlpha: boolean): string | null {
  const parsed = parseColor(rgb);
  const rgbHex = parsed?.rgb ?? (/^#[0-9a-fA-F]{6}$/.test(rgb) ? rgb.toLowerCase() : null);
  if (rgbHex === null) return null;
  if (!withAlpha) return rgbHex;
  const clamped = Math.min(1, Math.max(0, alpha));
  const a = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
  return `${rgbHex}${a}`;
}

export function normalizeColorValue(input: unknown, forceAlpha?: boolean): string | null {
  const parsed = parseColor(input);
  if (parsed === null) return null;
  if (forceAlpha === true || parsed.hasAlpha) {
    return formatColor(parsed.rgb, parsed.alpha, true);
  }
  return parsed.rgb;
}

export function isColorString(value: unknown): value is string {
  return typeof value === "string" && COLOR_PATTERN.test(value);
}

export function vecLength(kind: "vec2" | "vec3" | "vec4"): number {
  if (kind === "vec2") return 2;
  if (kind === "vec3") return 3;
  return 4;
}

export function isNumericTuple(value: unknown, length: number): value is number[] {
  if (!Array.isArray(value) || value.length !== length) return false;
  return value.every(isFiniteNumber);
}

export function isIntervalShape(value: unknown): value is TunableInterval {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes("min") || !keys.includes("max")) return false;
  return isFiniteNumber(record.min) && isFiniteNumber(record.max);
}

export function expandAxisMeta(
  length: number,
  labels: readonly string[] | undefined,
  min: number | readonly number[] | undefined,
  max: number | readonly number[] | undefined,
  step: number | readonly number[] | undefined,
  sample: readonly number[],
): ResolvedAxisBounds {
  const resolvedLabels = Array.from({ length }, (_, i) => labels?.[i] ?? DEFAULT_AXIS[i] ?? `a${i}`);
  const resolvedMin = Array.from({ length }, (_, i) => {
    if (Array.isArray(min)) return min[i] ?? sample[i]! * 2;
    if (typeof min === "number") return min;
    const v = sample[i]!;
    return v < 0 ? v * 2 : 0;
  });
  const resolvedMax = Array.from({ length }, (_, i) => {
    if (Array.isArray(max)) return max[i] ?? (sample[i]! > 0 ? sample[i]! * 2 : 1);
    if (typeof max === "number") return max;
    const v = sample[i]!;
    return v > 0 ? v * 2 : v < 0 ? 0 : 1;
  });
  const resolvedStep = Array.from({ length }, (_, i) => {
    if (Array.isArray(step)) return step[i] ?? (resolvedMax[i]! - resolvedMin[i]!) / 100;
    if (typeof step === "number") return step;
    return (resolvedMax[i]! - resolvedMin[i]!) / 100;
  });
  return { labels: resolvedLabels, min: resolvedMin, max: resolvedMax, step: resolvedStep };
}

export function clampAxisValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseVec(
  kind: "vec2" | "vec3" | "vec4",
  raw: unknown,
  bounds: ResolvedAxisBounds,
): number[] | null {
  const length = vecLength(kind);
  if (!isNumericTuple(raw, length)) return null;
  return raw.map((value, i) => clampAxisValue(value, bounds.min[i]!, bounds.max[i]!));
}

export function parseInterval(
  raw: unknown,
  options: { min?: number; max?: number; step?: number; integer?: boolean },
): TunableInterval | null {
  if (!isIntervalShape(raw)) return null;
  let lo = raw.min;
  let hi = raw.max;
  if (options.integer === true) {
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) return null;
  }
  if (options.step !== undefined && options.step > 0) {
    const step = options.step;
    const base = options.min ?? 0;
    const onStep = (n: number) => Math.abs((n - base) / step - Math.round((n - base) / step)) < 1e-9;
    if (!onStep(lo) || !onStep(hi)) return null;
  }
  if (lo > hi) {
    const tmp = lo;
    lo = hi;
    hi = tmp;
  }
  if (options.min !== undefined) {
    lo = Math.max(options.min, lo);
    hi = Math.max(options.min, hi);
  }
  if (options.max !== undefined) {
    lo = Math.min(options.max, lo);
    hi = Math.min(options.max, hi);
  }
  if (lo > hi) {
    lo = options.min ?? lo;
    hi = options.max ?? hi;
    if (lo > hi) return null;
  }
  return { min: lo, max: hi };
}

export function convertAngle(value: number, from: AngleUnit, to: AngleUnit): number {
  if (from === to) return value;
  if (from === "deg" && to === "rad") return (value * Math.PI) / 180;
  return (value * 180) / Math.PI;
}

export function normalizeAngle(
  value: number,
  unit: AngleUnit,
  options: { min?: number; max?: number; wrap?: boolean },
): number {
  let next = value;
  if (options.wrap === true) {
    const min = options.min ?? (unit === "deg" ? 0 : -Math.PI);
    const max = options.max ?? (unit === "deg" ? 360 : Math.PI);
    const span = max - min;
    if (span > 0) {
      next = ((((next - min) % span) + span) % span) + min;
    }
  } else {
    if (options.min !== undefined) next = Math.max(options.min, next);
    if (options.max !== undefined) next = Math.min(options.max, next);
  }
  return next;
}

export function resolveChoices<T>(
  options: readonly T[] | undefined,
  choices: readonly TunableChoice<T>[] | undefined,
): readonly TunableChoice<T>[] | undefined {
  if (choices !== undefined) return choices;
  if (options !== undefined) return options.map((value) => ({ value }));
  return undefined;
}

export function choiceValues(choices: readonly TunableChoice[] | undefined): readonly unknown[] | undefined {
  if (choices === undefined) return undefined;
  return choices.map((choice) => choice.value);
}

export function findChoice(
  choices: readonly TunableChoice[] | undefined,
  raw: unknown,
): TunableChoice | undefined {
  if (choices === undefined) return undefined;
  return choices.find((choice) => Object.is(choice.value, raw));
}

export function parseEnumValue(raw: unknown, choices: readonly TunableChoice[] | undefined): unknown | null {
  if (choices === undefined) return null;
  const match = findChoice(choices, raw);
  return match === undefined ? null : match.value;
}

export function coerceSelectWrite(
  raw: unknown,
  choices: readonly TunableChoice[] | undefined,
  options: readonly unknown[] | undefined,
): unknown | null {
  if (choices !== undefined) {
    const byValue = findChoice(choices, raw);
    if (byValue !== undefined) return byValue.value;
    if (typeof raw === "string") {
      const byLabel = choices.find((choice) => choice.label === raw);
      if (byLabel !== undefined) return byLabel.value;
      const byString = choices.find((choice) => String(choice.value) === raw);
      if (byString !== undefined) return byString.value;
    }
    return null;
  }
  if (options !== undefined) {
    if (options.some((option) => Object.is(option, raw))) return raw;
    if (typeof raw === "string") {
      const match = options.find((option) => String(option) === raw);
      if (match !== undefined) return match;
    }
    return null;
  }
  return raw;
}

export function inferKind(initial: unknown, options?: TunableOptions): DevtoolsControlKind {
  if (options?.kind !== undefined) return options.kind;
  if (options?.choices !== undefined || options?.options !== undefined) {
    return options.choices !== undefined ? "enum" : "select";
  }
  if (typeof initial === "number") return "slider";
  if (typeof initial === "boolean") return "toggle";
  if (isColorString(initial)) return "color";
  return "text";
}

export function discoverableKind(value: unknown, meta?: ScanFieldMeta): DevtoolsControlKind | null {
  if (meta?.kind !== undefined) {
    if (meta.kind === "vec2" || meta.kind === "vec3" || meta.kind === "vec4") {
      return isNumericTuple(value, vecLength(meta.kind)) ? meta.kind : null;
    }
    if (meta.kind === "interval") return isIntervalShape(value) ? "interval" : null;
    if (meta.kind === "angle") return isFiniteNumber(value) ? "angle" : null;
    if (meta.kind === "enum" || meta.kind === "select") {
      const choices = resolveChoices(meta.options, meta.choices);
      return choices !== undefined ? meta.kind : null;
    }
    if (meta.kind === "color") return isColorString(value) ? "color" : null;
    if (meta.kind === "slider") return isFiniteNumber(value) ? "slider" : null;
    if (meta.kind === "toggle") return typeof value === "boolean" ? "toggle" : null;
    if (meta.kind === "text") return typeof value === "string" ? "text" : null;
    return meta.kind;
  }
  if (typeof value === "number" && Number.isFinite(value)) return "slider";
  if (typeof value === "boolean") return "toggle";
  if (isColorString(value)) return "color";
  return null;
}

export function isScannableContainer(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.length <= MAX_TABLE_ENTRIES;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function ownWritableDataKeys(target: Record<string, unknown>): string[] {
  return Object.keys(target).filter((key) => {
    if (UNSAFE_KEYS.has(key)) return false;
    const desc = Object.getOwnPropertyDescriptor(target, key);
    if (desc === undefined) return false;
    if (!("value" in desc)) return false;
    if (desc.writable === false) return false;
    return true;
  });
}

export function sliderBounds(
  initial: number,
  options: { min?: number; max?: number; step?: number } | undefined,
): { min: number; max: number; step: number } {
  const min = options?.min ?? (initial < 0 ? initial * 2 : 0);
  const max = options?.max ?? (initial > 0 ? initial * 2 : initial < 0 ? 0 : 1);
  const step = options?.step ?? (max - min) / 100;
  return { min, max, step };
}

export function validateControlValue(
  kind: DevtoolsControlKind,
  raw: unknown,
  context: {
    min?: number;
    max?: number;
    step?: number;
    integer?: boolean;
    unit?: AngleUnit;
    wrap?: boolean;
    choices?: readonly TunableChoice[];
    options?: readonly unknown[];
    axisBounds?: ResolvedAxisBounds;
    alpha?: boolean;
  },
): { ok: true; value: unknown } | { ok: false; reason: string } {
  switch (kind) {
    case "slider": {
      if (!isFiniteNumber(raw)) return { ok: false, reason: "slider requires finite number" };
      let next = raw;
      if (context.min !== undefined) next = Math.max(context.min, next);
      if (context.max !== undefined) next = Math.min(context.max, next);
      return { ok: true, value: next };
    }
    case "angle": {
      if (!isFiniteNumber(raw)) return { ok: false, reason: "angle requires finite number" };
      const unit = context.unit ?? "rad";
      return {
        ok: true,
        value: normalizeAngle(raw, unit, { min: context.min, max: context.max, wrap: context.wrap }),
      };
    }
    case "toggle":
      if (typeof raw !== "boolean") return { ok: false, reason: "toggle requires boolean" };
      return { ok: true, value: raw };
    case "color": {
      const normalized = normalizeColorValue(raw, context.alpha);
      if (normalized === null) return { ok: false, reason: "invalid color" };
      return { ok: true, value: normalized };
    }
    case "text":
      if (typeof raw !== "string") return { ok: false, reason: "text requires string" };
      return { ok: true, value: raw };
    case "select": {
      const parsed = coerceSelectWrite(raw, context.choices, context.options);
      if (parsed === null) return { ok: false, reason: "value not in options" };
      return { ok: true, value: parsed };
    }
    case "enum": {
      const parsed = coerceSelectWrite(raw, context.choices, context.options);
      if (parsed === null) return { ok: false, reason: "value not in enum choices" };
      return { ok: true, value: parsed };
    }
    case "vec2":
    case "vec3":
    case "vec4": {
      if (context.axisBounds === undefined) return { ok: false, reason: "missing axis bounds" };
      const parsed = parseVec(kind, raw, context.axisBounds);
      if (parsed === null) return { ok: false, reason: `${kind} requires finite numeric tuple` };
      return { ok: true, value: parsed };
    }
    case "interval": {
      const parsed = parseInterval(raw, {
        min: context.min,
        max: context.max,
        step: context.step,
        integer: context.integer,
      });
      if (parsed === null) return { ok: false, reason: "invalid interval" };
      return { ok: true, value: parsed };
    }
    default:
      return { ok: false, reason: "unknown kind" };
  }
}

export interface DevtoolsOverrides {
  version: number;
  enabled: string[];
  values: Record<string, unknown>;
  schemas?: Record<string, { kind: DevtoolsControlKind; schemaVersion?: number }>;
}

export interface OverrideApplyDiagnostic {
  readonly id: string;
  readonly reason: string;
}

export interface OverrideParseResult {
  readonly overrides: DevtoolsOverrides | null;
  readonly diagnostics: readonly string[];
}

export function parseOverridesPayload(raw: unknown): OverrideParseResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { overrides: null, diagnostics: ["overrides payload is not an object"] };
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.enabled) || typeof record.values !== "object" || record.values === null || Array.isArray(record.values)) {
    return { overrides: null, diagnostics: ["overrides missing enabled[] or values{}"] };
  }
  const version = typeof record.version === "number" ? record.version : 0;
  if (version > OVERRIDES_FORMAT_VERSION) {
    return {
      overrides: null,
      diagnostics: [`overrides version ${version} is newer than supported ${OVERRIDES_FORMAT_VERSION}`],
    };
  }
  const enabled = record.enabled.filter((id): id is string => typeof id === "string");
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record.values as Record<string, unknown>)) {
    values[key] = value;
  }
  let schemas: DevtoolsOverrides["schemas"];
  if (typeof record.schemas === "object" && record.schemas !== null && !Array.isArray(record.schemas)) {
    schemas = {};
    for (const [key, entry] of Object.entries(record.schemas as Record<string, unknown>)) {
      if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
        const kind = (entry as { kind?: unknown }).kind;
        if (typeof kind === "string") {
          schemas[key] = {
            kind: kind as DevtoolsControlKind,
            schemaVersion:
              typeof (entry as { schemaVersion?: unknown }).schemaVersion === "number"
                ? ((entry as { schemaVersion: number }).schemaVersion)
                : undefined,
          };
        }
      }
    }
  }
  return {
    overrides: {
      version: OVERRIDES_FORMAT_VERSION,
      enabled,
      values,
      schemas,
    },
    diagnostics: version === 0 ? ["migrated unversioned overrides to v1"] : [],
  };
}

export function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.slice() as T;
  if (value !== null && typeof value === "object") return { ...(value as object) } as T;
  return value;
}
