import type { ChangeSignal } from "../store/changeSignal";
import {
  CONTROL_SCHEMA_VERSION,
  choiceValues,
  cloneValue,
  expandAxisMeta,
  inferKind,
  normalizeColorValue,
  resolveChoices,
  sliderBounds,
  validateControlValue,
  type AngleUnit,
  type DevtoolsControlKind,
  type ResolvedAxisBounds,
  type TunableChoice,
  type TunableOptions,
} from "./tunableSchema";
import type { Devtools, DevtoolsControl, Tunable } from "./types";

/** Internal mutable record backing a registered control: schema metadata, current value, and change listeners. */
export interface ControlRecord {
  name: string;
  kind: DevtoolsControlKind;
  label: string;
  group: string;
  initial: unknown;
  value: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly unknown[];
  choices?: readonly TunableChoice[];
  unit?: AngleUnit;
  displayUnit?: AngleUnit;
  wrap?: boolean;
  integer?: boolean;
  axisBounds?: ResolvedAxisBounds;
  hasAlpha?: boolean;
  schemaVersion: number;
  listeners: Set<(value: unknown) => void>;
}

/** @internal */
export function isStructuralKind(kind: DevtoolsControlKind): boolean {
  return kind === "vec2" || kind === "vec3" || kind === "vec4" || kind === "interval";
}

/** Controls subsystem: the public controls facade plus internal register/write helpers and the record map. */
export interface ControlsModule {
  controls: Devtools["controls"];
  register: <T>(name: string, initial: T, options?: TunableOptions<T>) => Tunable<T>;
  writeControl: (record: ControlRecord, raw: unknown) => boolean;
  controlRecords: Map<string, ControlRecord>;
}

/** Create the controls subsystem that registers, validates, and mutates tunable controls, notifying on change. */
export const createControlsModule = (deps: { signal: ChangeSignal }): ControlsModule => {
  const { signal } = deps;

  const controlRecords = new Map<string, ControlRecord>();

  const validationContext = (record: ControlRecord) => ({
    min: record.min,
    max: record.max,
    step: record.step,
    integer: record.integer,
    unit: record.unit,
    wrap: record.wrap,
    choices: record.choices,
    options: record.options,
    axisBounds: record.axisBounds,
    alpha: record.hasAlpha,
  });

  const toControl = (record: ControlRecord): DevtoolsControl => ({
    name: record.name,
    kind: record.kind,
    label: record.label,
    group: record.group,
    initial: record.initial,
    min: record.min,
    max: record.max,
    step: record.step,
    options: record.options ?? choiceValues(record.choices),
    choices: record.choices,
    unit: record.unit,
    displayUnit: record.displayUnit,
    wrap: record.wrap,
    integer: record.integer,
    axisLabels: record.axisBounds?.labels,
    axisMin: record.axisBounds?.min,
    axisMax: record.axisBounds?.max,
    axisStep: record.axisBounds?.step,
    hasAlpha: record.hasAlpha,
    schemaVersion: record.schemaVersion,
    read: () => record.value,
    write: (value) => writeControl(record, value),
    reset: () => {
      writeControl(record, cloneValue(record.initial));
    },
  });

  const writeControl = (record: ControlRecord, raw: unknown): boolean => {
    const validated = validateControlValue(record.kind, raw, validationContext(record));
    if (!validated.ok) return false;
    const next = validated.value;
    if (isStructuralKind(record.kind)) {
      if (JSON.stringify(record.value) === JSON.stringify(next)) return true;
      record.value = cloneValue(next);
    } else {
      if (Object.is(record.value, next)) return true;
      record.value = next;
    }
    for (const listener of record.listeners) listener(record.value);
    signal.notify();
    return true;
  };

  const hydrateRecord = (
    record: ControlRecord,
    initial: unknown,
    options: TunableOptions | undefined,
    kind: DevtoolsControlKind,
  ): void => {
    record.kind = kind;
    record.initial = cloneValue(initial);
    record.min = undefined;
    record.max = undefined;
    record.step = undefined;
    record.options = options?.options;
    record.choices = resolveChoices(options?.options, options?.choices);
    record.unit = options?.unit;
    record.displayUnit = options?.displayUnit ?? options?.unit;
    record.wrap = options?.wrap;
    record.integer = options?.integer;
    record.axisBounds = undefined;
    record.hasAlpha = undefined;
    record.schemaVersion = CONTROL_SCHEMA_VERSION;

    if (kind === "slider" || kind === "angle") {
      const bounds = sliderBounds(initial as number, options);
      record.min = bounds.min;
      record.max = bounds.max;
      record.step = bounds.step;
      if (kind === "angle") {
        record.unit = options?.unit ?? "rad";
        record.displayUnit = options?.displayUnit ?? "deg";
      }
    } else if (kind === "vec2" || kind === "vec3" || kind === "vec4") {
      const sample = Array.isArray(initial) ? (initial as number[]) : [];
      record.axisBounds = expandAxisMeta(
        sample.length,
        options?.axisLabels,
        options?.axisMin ?? options?.min,
        options?.axisMax ?? options?.max,
        options?.axisStep ?? options?.step,
        sample,
      );
    } else if (kind === "interval") {
      record.min = options?.min;
      record.max = options?.max;
      record.step = options?.step;
      record.integer = options?.integer;
    } else if (kind === "color") {
      const normalized = normalizeColorValue(initial, options?.alpha);
      if (normalized !== null) {
        record.initial = normalized;
        if (Object.is(record.value, initial) || record.value === initial) {
          record.value = normalized;
        }
        record.hasAlpha = options?.alpha === true || normalized.length === 9;
      }
    }
  };

  const register = <T,>(name: string, initial: T, options?: TunableOptions<T>): Tunable<T> => {
    const kind = inferKind(initial, options as TunableOptions | undefined);
    const existing = controlRecords.get(name);
    const slashIndex = name.indexOf("/");
    const derivedGroup = slashIndex > 0 ? name.slice(0, slashIndex) : "general";
    const derivedLabel = slashIndex > 0 ? name.slice(slashIndex + 1) : name;
    const record: ControlRecord =
      existing !== undefined && existing.kind === kind
        ? existing
        : {
            name,
            kind,
            label: "",
            group: "",
            initial: cloneValue(initial),
            value: cloneValue(initial),
            schemaVersion: CONTROL_SCHEMA_VERSION,
            listeners: new Set(),
          };
    if (existing === undefined || existing.kind !== kind) {
      record.value = cloneValue(initial);
    }
    record.label = options?.label ?? derivedLabel;
    record.group = options?.group ?? derivedGroup;
    hydrateRecord(record, initial, options as TunableOptions | undefined, kind);
    if (options?.onChange !== undefined) record.listeners.add(options.onChange as (value: unknown) => void);
    controlRecords.set(name, record);
    signal.notify();
    return {
      name,
      kind,
      initial: record.initial as T,
      get value() {
        return record.value as T;
      },
      set: (value: T) => writeControl(record, value),
      reset: () => {
        writeControl(record, cloneValue(record.initial));
      },
      subscribe: (listener: (value: T) => void) => {
        record.listeners.add(listener as (value: unknown) => void);
        return () => record.listeners.delete(listener as (value: unknown) => void);
      },
    };
  };

  return {
    controls: {
      register,
      list: () => [...controlRecords.values()].map(toControl),
      get: (name) => {
        const record = controlRecords.get(name);
        return record === undefined ? null : toControl(record);
      },
      remove(name) {
        if (controlRecords.delete(name)) signal.notify();
      },
      resetAll() {
        for (const record of controlRecords.values()) writeControl(record, cloneValue(record.initial));
      },
    },
    register,
    writeControl,
    controlRecords,
  };
};
