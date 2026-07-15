/**
 * The parametric-studio seam: a registry that maps an editor object `kind` to a typed parameter
 * schema (drives the inspector + `meta` parse/validation), an optional pure-data `resolve` (turns a
 * document object into renderable data), and `+ Add` menu metadata. Registering a kind lets a third
 * party ship a new authorable "studio" (pole line, water, bookcase) — schema + resolver here, a
 * matching renderer in `shell` — without editing editor or engine files. Scatter is the proof adopter.
 */

/** Which document collection a scene kind lives in. Drives placement + which `meta` bag holds params. */
export type SceneKindTarget = "path" | "marker" | "volume";

/** A closed-polygon area vs an open polyline, for path-target kinds. Ignored for marker/volume kinds. */
export type ScenePathShape = "area" | "line";

/** One weighted entry in a `weightedList` param — an item id and its relative spawn weight. */
export interface WeightedParamEntry {
  item: string;
  weight: number;
}

/** A numeric slider row: bounded range with a live readout. */
export interface RangeParamField {
  type: "range";
  key: string;
  label?: string;
  /** Optional group id — the inspector renders fields sharing a group under one collapsible section. */
  group?: string;
  min: number;
  max: number;
  step?: number;
  default: number;
  /** Suffix shown next to the readout, e.g. "m" or "/m²". */
  unit?: string;
}

/** A free numeric input, optionally clamped. */
export interface NumberParamField {
  type: "number";
  key: string;
  label?: string;
  /** Optional group id — the inspector renders fields sharing a group under one collapsible section. */
  group?: string;
  step?: number;
  default: number;
  min?: number;
  max?: number;
}

/** A checkbox. */
export interface BoolParamField {
  type: "bool";
  key: string;
  label?: string;
  /** Optional group id — the inspector renders fields sharing a group under one collapsible section. */
  group?: string;
  default: boolean;
}

/** A dropdown of fixed string options. */
export interface SelectParamField {
  type: "select";
  key: string;
  label?: string;
  /** Optional group id — the inspector renders fields sharing a group under one collapsible section. */
  group?: string;
  options: readonly { value: string; label?: string }[];
  default: string;
}

/** A hex color picker. */
export interface ColorParamField {
  type: "color";
  key: string;
  label?: string;
  /** Optional group id — the inspector renders fields sharing a group under one collapsible section. */
  group?: string;
  default: string;
}

/** A free string input. */
export interface TextParamField {
  type: "text";
  key: string;
  label?: string;
  /** Optional group id — the inspector renders fields sharing a group under one collapsible section. */
  group?: string;
  default: string;
}

/** A seed string with a reroll button — same seed reproduces the same generated result. */
export interface SeedParamField {
  type: "seed";
  key: string;
  label?: string;
  /** Optional group id — the inspector renders fields sharing a group under one collapsible section. */
  group?: string;
  default: string;
}

/** A repeatable list of weighted `{ item, weight }` rows (species palette, book set, …). */
export interface WeightedListParamField {
  type: "weightedList";
  key: string;
  label?: string;
  /** Optional group id — the inspector renders fields sharing a group under one collapsible section. */
  group?: string;
  /** Placeholder for the item id input. */
  itemLabel?: string;
  default: readonly WeightedParamEntry[];
}

/**
 * A button row that runs a built-in inspector action on its group — currently `"randomize"` (reroll
 * the group's numeric/seed/bool/select fields within their bounds) or `"reset"` (restore group
 * defaults). Carries no persisted value; purely a control.
 */
export interface ActionParamField {
  type: "action";
  key: string;
  label?: string;
  group?: string;
  action: "randomize" | "reset";
}

/** One row in a kind's parameter schema — the union the generic inspector knows how to render. */
export type ParamField =
  | RangeParamField
  | NumberParamField
  | BoolParamField
  | SelectParamField
  | ColorParamField
  | TextParamField
  | SeedParamField
  | WeightedListParamField
  | ActionParamField;

/** A named, optionally-collapsed section the inspector groups fields under (by `field.group === id`). */
export interface ParamGroup {
  id: string;
  label: string;
  /** Start collapsed. Default expanded. */
  collapsed?: boolean;
}

/** A kind's full parameter surface: an ordered list of fields the inspector renders top-to-bottom. */
export interface ParamSchema {
  fields: readonly ParamField[];
  /** Optional named sections; fields reference one by `group`. Ungrouped fields render first, headerless. */
  groups?: readonly ParamGroup[];
}

/** Parsed params after `parseParams`: every schema field present with a validated, defaulted value. */
export type ParsedParams = Record<string, number | boolean | string | WeightedParamEntry[]>;

function num(value: unknown, fallback: number, min?: number, max?: number): number {
  let n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  if (min !== undefined) n = Math.max(min, n);
  if (max !== undefined) n = Math.min(max, n);
  return n;
}

function readWeightedList(value: unknown, fallback: readonly WeightedParamEntry[]): WeightedParamEntry[] {
  if (!Array.isArray(value)) return fallback.map((entry) => ({ ...entry }));
  const entries = value
    .filter((entry): entry is { item: unknown; weight?: unknown } => typeof entry === "object" && entry !== null)
    .map((entry) => ({
      item: typeof entry.item === "string" ? entry.item : "",
      weight: num(entry.weight, 1, 0),
    }))
    .filter((entry) => entry.item.length > 0);
  return entries.length > 0 ? entries : fallback.map((entry) => ({ ...entry }));
}

/**
 * Parse a raw `meta` bag against a schema into typed params — every field present, invalid/missing
 * values replaced by the field default, numbers clamped to their range. The single parser every
 * studio shares instead of hand-writing its own `metaNumber`/`metaBool` ladder.
 */
export function parseParams(schema: ParamSchema, meta: Record<string, unknown> | undefined): ParsedParams {
  const out: ParsedParams = {};
  for (const field of schema.fields) {
    const raw = meta?.[field.key];
    switch (field.type) {
      case "range":
        out[field.key] = num(raw, field.default, field.min, field.max);
        break;
      case "number":
        out[field.key] = num(raw, field.default, field.min, field.max);
        break;
      case "bool":
        out[field.key] = typeof raw === "boolean" ? raw : field.default;
        break;
      case "select": {
        const allowed = field.options.some((option) => option.value === raw);
        out[field.key] = allowed ? (raw as string) : field.default;
        break;
      }
      case "color":
      case "text":
      case "seed":
        out[field.key] = typeof raw === "string" ? raw : field.default;
        break;
      case "weightedList":
        out[field.key] = readWeightedList(raw, field.default);
        break;
      case "action":
        break;
    }
  }
  return out;
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
export function validateParams(schema: ParamSchema, meta: Record<string, unknown> | undefined): ParamIssue[] {
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
      case "text":
      case "seed":
        if (typeof raw !== "string") issues.push({ key: field.key, message: "expected a string" });
        break;
      case "weightedList":
        if (!Array.isArray(raw)) issues.push({ key: field.key, message: "expected an array" });
        break;
      case "action":
        break;
    }
  }
  return issues;
}

function randomHex(random: () => number): string {
  const channel = () =>
    Math.floor(60 + random() * 180)
      .toString(16)
      .padStart(2, "0");
  return `#${channel()}${channel()}${channel()}`;
}

/**
 * A `meta` patch that randomizes every field in `groupId` within its bounds — the "randomize" button's
 * behavior, pure and injectable so it's deterministic in tests. Ranges/numbers land in `[min, max]`
 * (integer-rounded when `step >= 1`), bools/selects pick uniformly, seeds get a fresh token, colors a
 * random mid-tone. Text and weighted lists are left untouched.
 * @internal
 */
export function randomizeGroupParams(schema: ParamSchema, groupId: string | undefined, random: () => number): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (field.group !== groupId) continue;
    switch (field.type) {
      case "range": {
        const value = field.min + random() * (field.max - field.min);
        patch[field.key] = field.step !== undefined && field.step >= 1 ? Math.round(value) : Math.round(value * 1000) / 1000;
        break;
      }
      case "number": {
        if (field.min !== undefined && field.max !== undefined) patch[field.key] = Math.round((field.min + random() * (field.max - field.min)) * 1000) / 1000;
        else patch[field.key] = Math.round(field.default * (0.5 + random()) * 1000) / 1000;
        break;
      }
      case "bool":
        patch[field.key] = random() < 0.5;
        break;
      case "select":
        patch[field.key] = field.options[Math.floor(random() * field.options.length)]!.value;
        break;
      case "seed":
        patch[field.key] = `r${Math.floor(random() * 1_000_000).toString(36)}`;
        break;
      case "color":
        patch[field.key] = randomHex(random);
        break;
      case "text":
      case "weightedList":
      case "action":
        break;
    }
  }
  return patch;
}

/** A `meta` patch restoring every field in `groupId` to its schema default — the "reset" button. @internal */
export function resetGroupParams(schema: ParamSchema, groupId: string | undefined): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (field.group !== groupId || field.type === "action") continue;
    patch[field.key] = field.type === "weightedList" ? field.default.map((entry) => ({ ...entry })) : field.default;
  }
  return patch;
}

/** The `meta` patch that fills a fresh object of a kind with its schema defaults. @internal */
export function defaultParamMeta(schema: ParamSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (field.type === "action") continue;
    out[field.key] = field.type === "weightedList" ? field.default.map((entry) => ({ ...entry })) : field.default;
  }
  return out;
}

/**
 * A registered scene kind — everything the editor/engine need to author and render a studio without
 * bespoke code. `schema` drives the inspector + parse; `resolve` (optional) turns one document object
 * into pure renderable data a matching `shell` renderer consumes; `add*` fields build the `+ Add` menu.
 * @typeParam TResolved — the kind's renderable payload (scatter instances, pole+cable set, …).
 */
export interface SceneKindDefinition<TResolved = unknown> {
  kind: string;
  target: SceneKindTarget;
  /** Human label for the inspector header and `+ Add` entry. */
  label: string;
  schema: ParamSchema;
  /** For path kinds: closed area (default) or open line. Ignored for markers/volumes. */
  pathShape?: ScenePathShape;
  /** `+ Add` menu section this kind lists under (e.g. "Studios"). Omit to hide from the menu. */
  addCategory?: string;
  /** Accent color for the inspector panel + `+ Add` entry, as a hex string. */
  accent?: string;
  /**
   * Turn one document object (its geometry + parsed params) into pure renderable data. Pure — no
   * three.js/DOM. Omitted for kinds whose renderer reads the object directly. `object` is the raw
   * marker/volume/path; `params` is `parseParams(schema, object.meta)`.
   */
  resolve?: (object: SceneKindObject, params: ParsedParams, context: SceneKindResolveContext) => TResolved;
  /** Optional one-line readout under the inspector fields (estimate, dimensions) — owned by the studio. */
  note?: (object: SceneKindObject, params: ParsedParams) => string;
}

/** The raw document object a resolver receives — shape shared by markers, volumes, and paths. */
export interface SceneKindObject {
  id: string;
  kind: string;
  meta?: Record<string, unknown>;
  /** Present for path targets: the polyline/polygon points (XZ used). */
  points?: readonly { x: number; y: number; z: number }[];
  /** Present for marker targets: the placed position. */
  position?: { x: number; y: number; z: number };
  /** Present for volume targets: the region center. */
  center?: { x: number; y: number; z: number };
  /** Present for volume targets: box half-extents. */
  halfExtents?: { x: number; y: number; z: number };
  /** Present for volume targets: sphere/cylinder radius. */
  radius?: number;
  rotationY?: number;
}

/** Ground sampler + options a resolver may read (terrain height/normal snap). */
export interface SceneKindResolveContext {
  sampleHeight?: (x: number, z: number) => number;
  sampleNormal?: (x: number, z: number) => readonly [number, number, number];
}

const registry = new Map<string, SceneKindDefinition>();

/**
 * Register a scene kind — the plug-in point for a new parametric studio. Idempotent per `kind` (last
 * registration wins), so a game's registration overrides a default. Call at module load; the editor
 * inspector, `+ Add` menu, and `AuthoredScene` renderer lookup all read this registry.
 */
export function registerSceneKind<TResolved>(definition: SceneKindDefinition<TResolved>): void {
  registry.set(definition.kind, definition as SceneKindDefinition);
}

/** The registered definition for a kind, or undefined if the kind is a plain (non-studio) kind. @internal */
export function getSceneKind(kind: string): SceneKindDefinition | undefined {
  return registry.get(kind);
}

/** True when a kind has a registered studio definition (schema/inspector/renderer). @internal */
export function isSceneKind(kind: string): boolean {
  return registry.has(kind);
}

/** Every registered kind, optionally filtered by target, in registration order. @internal */
export function listSceneKinds(target?: SceneKindTarget): SceneKindDefinition[] {
  const all = [...registry.values()];
  return target === undefined ? all : all.filter((definition) => definition.target === target);
}

/** Parse a document object's `meta` against its registered kind schema, or `null` if unregistered. @internal */
export function parseSceneKindParams(object: SceneKindObject): ParsedParams | null {
  const definition = registry.get(object.kind);
  return definition === undefined ? null : parseParams(definition.schema, object.meta);
}
