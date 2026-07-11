import { createChangeSignal, type ChangeSignal } from "../store/changeSignal";
import {
  CONTROL_SCHEMA_VERSION,
  MAX_SCAN_DEPTH,
  MAX_SCAN_TARGETS,
  MAX_TABLE_ENTRIES,
  OVERRIDES_FORMAT_VERSION,
  choiceValues,
  cloneValue,
  discoverableKind,
  expandAxisMeta,
  inferKind,
  isScannableContainer,
  joinTunablePath,
  normalizeColorValue,
  ownWritableDataKeys,
  parseOverridesPayload,
  resolveChoices,
  sliderBounds,
  validateControlValue,
  type AngleUnit,
  type DevtoolsControlKind,
  type DevtoolsOverrides,
  type DiscoverySkip,
  type OverrideApplyDiagnostic,
  type ResolvedAxisBounds,
  type ScanMeta,
  type TunableChoice,
  type TunableOptions,
} from "./tunableSchema";

export type {
  AngleUnit,
  DevtoolsControlKind,
  DevtoolsOverrides,
  DiscoverySkip,
  OverrideApplyDiagnostic,
  TunableChoice,
  TunableInterval,
  TunableOptions,
  TunableVec2,
  TunableVec3,
  TunableVec4,
  ScanMeta,
  ScanFieldMeta,
  NormalizedColor,
} from "./tunableSchema";

export {
  CONTROL_SCHEMA_VERSION,
  OVERRIDES_FORMAT_VERSION,
  convertAngle,
  escapePathSegment,
  formatColor,
  joinTunablePath,
  normalizeAngle,
  normalizeColorValue,
  parseColor,
  parseOverridesPayload,
  splitTunablePath,
  unescapePathSegment,
  validateControlValue,
} from "./tunableSchema";

export interface DevtoolsControl {
  readonly name: string;
  readonly kind: DevtoolsControlKind;
  readonly label: string;
  readonly group: string;
  readonly initial: unknown;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly unknown[];
  readonly choices?: readonly TunableChoice[];
  readonly unit?: AngleUnit;
  readonly displayUnit?: AngleUnit;
  readonly wrap?: boolean;
  readonly integer?: boolean;
  readonly axisLabels?: readonly string[];
  readonly axisMin?: readonly number[];
  readonly axisMax?: readonly number[];
  readonly axisStep?: readonly number[];
  readonly hasAlpha?: boolean;
  readonly schemaVersion: number;
  read(): unknown;
  write(value: unknown): boolean;
  reset(): void;
}

export interface Tunable<T> {
  readonly name: string;
  readonly kind: DevtoolsControlKind;
  readonly initial: T;
  readonly value: T;
  set(value: T): boolean;
  reset(): void;
  subscribe(listener: (value: T) => void): () => void;
}

export interface OverrideApplyResult {
  applied: number;
  skipped: readonly OverrideApplyDiagnostic[];
  diagnostics: readonly string[];
}

export interface FrameStats {
  fps: number;
  avgFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  avgSimMs: number;
  maxSimMs: number;
  avgOutsideMs: number;
  maxOutsideMs: number;
  longFrames: number;
  samples: number;
  recentFrameMs: readonly number[];
  phases: readonly PhaseStats[];
}

export interface PhaseStats {
  name: string;
  avgMs: number;
  maxMs: number;
  lastMs: number;
  samples: number;
  pctOfSim: number;
}

export interface LongFrameEvent {
  at: number;
  frameMs: number;
  simMs: number;
  outsideMs: number;
  phases: readonly { name: string; ms: number; pct: number }[];
  topPhase: string | null;
  culprit: string;
  reason: string;
  probes: Record<string, unknown>;
  render: RenderSample | null;
}

export interface RenderSample {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export interface LatencyStats {
  lastMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  samples: number;
}

export type DevtoolsLogLevel = "log" | "info" | "warn" | "error";

export interface DevtoolsLogEntry {
  at: number;
  level: DevtoolsLogLevel;
  message: string;
}

export interface DiscoveredEntry {
  readonly id: string;
  readonly table: string;
  readonly key: string;
  readonly kind: DevtoolsControlKind;
  readonly initial: unknown;
  readonly enabled: boolean;
  read(): unknown;
}

export interface TunableAccessor {
  initial: unknown;
  get(): unknown;
  set(value: unknown): void;
}

export interface DevtoolsSnapshot {
  at: number;
  frame: FrameStats | null;
  render: RenderSample | null;
  latency: LatencyStats | null;
  longFrames: readonly LongFrameEvent[];
  logs: readonly DevtoolsLogEntry[];
  probes: Record<string, unknown>;
  controls: readonly { name: string; kind: DevtoolsControlKind; value: unknown; initial: unknown }[];
  discovered: readonly { id: string; kind: DevtoolsControlKind; value: unknown; enabled: boolean }[];
  skipped: readonly DiscoverySkip[];
}

export interface FrameRecordSample {
  frameMs: number;
  simMs: number;
  phases?: Readonly<Record<string, number>>;
}

export interface Devtools {
  frame: {
    record(sample: FrameRecordSample): void;
    stats(): FrameStats | null;
    longFrames(): readonly LongFrameEvent[];
    clearLongFrames(): void;
  };
  profile: {
    begin(name: string): () => void;
    measure<T>(name: string, fn: () => T): T;
    add(name: string, ms: number): void;
    current(): Record<string, number>;
    reset(): void;
  };
  render: {
    record(sample: RenderSample): void;
    latest(): RenderSample | null;
  };
  logs: {
    push(level: DevtoolsLogLevel, message: string): void;
    captureConsole(): void;
    list(): readonly DevtoolsLogEntry[];
    clear(): void;
  };
  latency: {
    record(ms: number): void;
    stats(): LatencyStats | null;
  };
  controls: {
    register<T>(name: string, initial: T, options?: TunableOptions<T>): Tunable<T>;
    list(): readonly DevtoolsControl[];
    get(name: string): DevtoolsControl | null;
    remove(name: string): void;
    resetAll(): void;
  };
  discover: {
    bind(table: string, key: string, accessor: TunableAccessor, options?: TunableOptions): void;
    scanTable(table: string, candidate: unknown, meta?: ScanMeta): number;
    scanModule(exports: Record<string, unknown>, meta?: ScanMeta): number;
    list(): readonly DiscoveredEntry[];
    skipped(): readonly DiscoverySkip[];
    enable(id: string): void;
    disable(id: string): void;
    clear(): void;
  };
  overrides: {
    export(): DevtoolsOverrides;
    apply(overrides: DevtoolsOverrides | unknown): OverrideApplyResult;
  };
  probes: {
    register(name: string, read: () => unknown): () => void;
    read(): Record<string, unknown>;
  };
  signal: ChangeSignal;
  snapshot(): DevtoolsSnapshot;
}

const FRAME_CAPACITY = 240;
const RECENT_FRAMES = 60;
export const LONG_FRAME_MS = 33.4;
const LATENCY_CAPACITY = 120;
const LOG_CAPACITY = 200;
const LOG_MESSAGE_MAX = 400;
const LONG_FRAME_CAPACITY = 40;
const MAX_PHASES_PER_FRAME = 24;
const MAX_LONG_FRAME_PHASES = 8;
const PHASE_HOT_MS = 2;

function nowMs(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf !== undefined ? perf.now() : Date.now();
}

function formatLogArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

export function formatLogMessage(args: readonly unknown[]): string {
  const message = args.map(formatLogArg).join(" ");
  return message.length > LOG_MESSAGE_MAX ? `${message.slice(0, LOG_MESSAGE_MAX)}…` : message;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index]!;
}

function clampMs(value: number): number {
  return value > 0 && Number.isFinite(value) ? value : 0;
}

function rankPhases(phases: Readonly<Record<string, number>>): { name: string; ms: number; pct: number }[] {
  const entries = Object.entries(phases)
    .filter(([, ms]) => Number.isFinite(ms) && ms > 0)
    .map(([name, ms]) => ({ name, ms }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, MAX_LONG_FRAME_PHASES);
  const total = entries.reduce((sum, entry) => sum + entry.ms, 0);
  return entries.map((entry) => ({
    name: entry.name,
    ms: entry.ms,
    pct: total > 0 ? (entry.ms / total) * 100 : 0,
  }));
}

function explainLongFrame(
  frameMs: number,
  simMs: number,
  outsideMs: number,
  ranked: readonly { name: string; ms: number; pct: number }[],
): { topPhase: string | null; culprit: string; reason: string } {
  const top = ranked[0] ?? null;
  const topPhaseMs = top?.ms ?? 0;
  const phaseBits = ranked
    .filter((entry) => entry.ms >= PHASE_HOT_MS)
    .slice(0, 3)
    .map((entry) => `${entry.name} ${entry.ms.toFixed(1)}ms`);

  const outsideDominates =
    outsideMs > topPhaseMs && outsideMs >= simMs * 0.55 && outsideMs >= frameMs * 0.4;

  if (outsideDominates) {
    const detail = phaseBits.length > 0 ? ` · sim was ${phaseBits.join(", ")}` : simMs > 1 ? ` · sim ${simMs.toFixed(1)}ms` : "";
    return {
      topPhase: top?.name ?? null,
      culprit: "outside-sim",
      reason: `display/render/browser hitch ${outsideMs.toFixed(1)}ms outside sim${detail}`,
    };
  }

  if (top !== null && top.ms >= PHASE_HOT_MS) {
    const rest = phaseBits.slice(1);
    const restText = rest.length > 0 ? ` · also ${rest.join(", ")}` : "";
    const outsideText = outsideMs >= PHASE_HOT_MS ? ` · +${outsideMs.toFixed(1)}ms outside sim` : "";
    return {
      topPhase: top.name,
      culprit: top.name,
      reason: `${top.name} ${top.ms.toFixed(1)}ms (${top.pct.toFixed(0)}% of timed sim)${restText}${outsideText}`,
    };
  }

  if (simMs >= frameMs * 0.5) {
    return {
      topPhase: null,
      culprit: "sim",
      reason: `sim ${simMs.toFixed(1)}ms with no named phase ≥${PHASE_HOT_MS}ms — wrap hot work in measure("name", fn)`,
    };
  }

  return {
    topPhase: null,
    culprit: "outside-sim",
    reason: `frame ${frameMs.toFixed(1)}ms · sim ${simMs.toFixed(1)}ms · outside ${outsideMs.toFixed(1)}ms (render/React/GC/tab throttle)`,
  };
}

interface PhaseAccumulator {
  sumMs: number;
  maxMs: number;
  lastMs: number;
  samples: number;
}

interface ControlRecord {
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

interface DiscoveredRecord {
  id: string;
  table: string;
  key: string;
  kind: DevtoolsControlKind;
  initial: unknown;
  enabled: boolean;
  source: object | null;
  options?: TunableOptions;
  get(): unknown;
  set(value: unknown): void;
}

interface ScanTarget {
  path: string;
  target: Record<string, unknown>;
  key: string;
  kind: DevtoolsControlKind;
  options?: TunableOptions;
}

interface ScanCollection {
  targets: ScanTarget[];
  skipped: DiscoverySkip[];
}

function collectScanTargets(root: unknown, meta?: ScanMeta): ScanCollection {
  const skipped: DiscoverySkip[] = [];
  if (!isScannableContainer(root)) {
    if (root !== null && typeof root === "object") {
      skipped.push({ path: "", reason: "not a plain object or array" });
    }
    return { targets: [], skipped };
  }
  const out: ScanTarget[] = [];
  const visited = new Set<object>([root]);
  let frontier: { path: string; target: Record<string, unknown> }[] = [{ path: "", target: root }];
  for (let depth = 0; depth <= MAX_SCAN_DEPTH && frontier.length > 0; depth += 1) {
    const next: typeof frontier = [];
    for (const { path, target } of frontier) {
      const keys = ownWritableDataKeys(target);
      let scalarCount = 0;
      for (const key of keys) {
        const value = target[key];
        const childPath = joinTunablePath(path, key);
        const fieldMeta = meta?.[childPath];
        const kind = discoverableKind(value, fieldMeta);
        if (kind !== null) {
          scalarCount += 1;
          if (scalarCount > MAX_TABLE_ENTRIES) {
            skipped.push({ path: path === "" ? "*" : path, reason: `more than ${MAX_TABLE_ENTRIES} scalar entries` });
            scalarCount = -1;
            break;
          }
        }
      }
      if (scalarCount < 0) continue;
      for (const key of keys) {
        const value = target[key];
        const childPath = joinTunablePath(path, key);
        const fieldMeta = meta?.[childPath];
        const kind = discoverableKind(value, fieldMeta);
        if (kind !== null) {
          if (out.length >= MAX_SCAN_TARGETS) {
            skipped.push({ path: childPath, reason: `scan cap ${MAX_SCAN_TARGETS}` });
            return { targets: out, skipped };
          }
          out.push({ path: childPath, target, key, kind, options: fieldMeta });
          continue;
        }
        if (value !== null && typeof value === "object") {
          if (!isScannableContainer(value)) {
            skipped.push({ path: childPath, reason: "unsupported structure" });
            continue;
          }
          if (visited.has(value)) {
            skipped.push({ path: childPath, reason: "cycle" });
            continue;
          }
          if (depth === MAX_SCAN_DEPTH) {
            skipped.push({ path: childPath, reason: `depth > ${MAX_SCAN_DEPTH}` });
            continue;
          }
          visited.add(value);
          next.push({ path: childPath, target: value });
        }
      }
    }
    frontier = next;
  }
  return { targets: out, skipped };
}

export function createDevtools(): Devtools {
  const signal = createChangeSignal();

  const frameMsBuffer = new Float64Array(FRAME_CAPACITY);
  const simMsBuffer = new Float64Array(FRAME_CAPACITY);
  const outsideMsBuffer = new Float64Array(FRAME_CAPACITY);
  let frameIndex = 0;
  let frameCount = 0;

  let renderSample: RenderSample | null = null;

  const logEntries: DevtoolsLogEntry[] = [];
  let consoleCaptured = false;

  const latencySamples: number[] = [];
  const longFrameEvents: LongFrameEvent[] = [];
  const phaseAccumulators = new Map<string, PhaseAccumulator>();
  let currentPhases: Record<string, number> = {};
  let currentPhaseCount = 0;

  const controlRecords = new Map<string, ControlRecord>();
  const discoveredRecords = new Map<string, DiscoveredRecord>();
  const probeReaders = new Map<string, () => unknown>();
  let boundProps = new WeakMap<object, Set<string>>();
  let discoverySkips: DiscoverySkip[] = [];

  const readProbes = (): Record<string, unknown> => {
    const values: Record<string, unknown> = {};
    for (const [name, read] of probeReaders) {
      try {
        values[name] = read();
      } catch (error) {
        values[name] = `probe failed: ${formatLogArg(error)}`;
      }
    }
    return values;
  };

  const pushLog = (level: DevtoolsLogLevel, message: string): void => {
    logEntries.push({ at: Date.now(), level, message });
    if (logEntries.length > LOG_CAPACITY) logEntries.splice(0, logEntries.length - LOG_CAPACITY);
  };

  const addPhaseMs = (name: string, ms: number): void => {
    const elapsed = clampMs(ms);
    if (elapsed === 0 || name.length === 0) return;
    if (currentPhases[name] === undefined) {
      if (currentPhaseCount >= MAX_PHASES_PER_FRAME) return;
      currentPhaseCount += 1;
      currentPhases[name] = elapsed;
      return;
    }
    currentPhases[name] = currentPhases[name]! + elapsed;
  };

  const resetCurrentPhases = (): void => {
    currentPhases = {};
    currentPhaseCount = 0;
  };

  const recordPhaseStats = (phases: Readonly<Record<string, number>>): void => {
    for (const [name, ms] of Object.entries(phases)) {
      const elapsed = clampMs(ms);
      if (elapsed === 0) continue;
      const existing = phaseAccumulators.get(name);
      if (existing === undefined) {
        phaseAccumulators.set(name, { sumMs: elapsed, maxMs: elapsed, lastMs: elapsed, samples: 1 });
      } else {
        existing.sumMs += elapsed;
        existing.maxMs = Math.max(existing.maxMs, elapsed);
        existing.lastMs = elapsed;
        existing.samples += 1;
      }
    }
  };

  const phaseStatsList = (avgSimMs: number): PhaseStats[] => {
    const list: PhaseStats[] = [];
    for (const [name, acc] of phaseAccumulators) {
      const avgMs = acc.sumMs / acc.samples;
      list.push({
        name,
        avgMs,
        maxMs: acc.maxMs,
        lastMs: acc.lastMs,
        samples: acc.samples,
        pctOfSim: avgSimMs > 0 ? (avgMs / avgSimMs) * 100 : 0,
      });
    }
    list.sort((a, b) => b.avgMs - a.avgMs);
    return list;
  };

  const frameStats = (): FrameStats | null => {
    if (frameCount === 0) return null;
    const size = Math.min(frameCount, FRAME_CAPACITY);
    const frames: number[] = [];
    const sims: number[] = [];
    const outsides: number[] = [];
    for (let offset = 0; offset < size; offset += 1) {
      const at = (frameIndex - size + offset + FRAME_CAPACITY) % FRAME_CAPACITY;
      frames.push(frameMsBuffer[at]!);
      sims.push(simMsBuffer[at]!);
      outsides.push(outsideMsBuffer[at]!);
    }
    const recent = frames.slice(-RECENT_FRAMES);
    const recentAvg = recent.reduce((sum, ms) => sum + ms, 0) / recent.length;
    const sorted = [...frames].sort((a, b) => a - b);
    const avgSimMs = sims.reduce((sum, ms) => sum + ms, 0) / sims.length;
    return {
      fps: recentAvg > 0 ? 1000 / recentAvg : 0,
      avgFrameMs: frames.reduce((sum, ms) => sum + ms, 0) / frames.length,
      p95FrameMs: percentile(sorted, 0.95),
      maxFrameMs: sorted[sorted.length - 1]!,
      avgSimMs,
      maxSimMs: sims.reduce((max, ms) => Math.max(max, ms), 0),
      avgOutsideMs: outsides.reduce((sum, ms) => sum + ms, 0) / outsides.length,
      maxOutsideMs: outsides.reduce((max, ms) => Math.max(max, ms), 0),
      longFrames: frames.filter((ms) => ms > LONG_FRAME_MS).length,
      samples: size,
      recentFrameMs: recent,
      phases: phaseStatsList(avgSimMs),
    };
  };

  const recordFrame = (sample: FrameRecordSample): void => {
    const frameMs = clampMs(sample.frameMs);
    const simMs = clampMs(sample.simMs);
    const outsideMs = clampMs(frameMs - simMs);
    const phases =
      sample.phases !== undefined
        ? Object.fromEntries(
            Object.entries(sample.phases)
              .filter(([, ms]) => Number.isFinite(ms) && ms > 0)
              .slice(0, MAX_PHASES_PER_FRAME),
          )
        : { ...currentPhases };

    frameMsBuffer[frameIndex] = frameMs;
    simMsBuffer[frameIndex] = simMs;
    outsideMsBuffer[frameIndex] = outsideMs;
    frameIndex = (frameIndex + 1) % FRAME_CAPACITY;
    frameCount += 1;

    recordPhaseStats(phases);

    if (frameMs > LONG_FRAME_MS) {
      const ranked = rankPhases(phases);
      const explained = explainLongFrame(frameMs, simMs, outsideMs, ranked);
      longFrameEvents.push({
        at: Date.now(),
        frameMs,
        simMs,
        outsideMs,
        phases: ranked,
        topPhase: explained.topPhase,
        culprit: explained.culprit,
        reason: explained.reason,
        probes: readProbes(),
        render: renderSample,
      });
      if (longFrameEvents.length > LONG_FRAME_CAPACITY) {
        longFrameEvents.splice(0, longFrameEvents.length - LONG_FRAME_CAPACITY);
      }
    }

    resetCurrentPhases();
  };

  const latencyStats = (): LatencyStats | null => {
    if (latencySamples.length === 0) return null;
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    let sum = 0;
    for (const ms of latencySamples) {
      min = Math.min(min, ms);
      max = Math.max(max, ms);
      sum += ms;
    }
    return {
      lastMs: latencySamples[latencySamples.length - 1]!,
      avgMs: sum / latencySamples.length,
      minMs: min,
      maxMs: max,
      samples: latencySamples.length,
    };
  };

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
    if (record.kind === "vec2" || record.kind === "vec3" || record.kind === "vec4" || record.kind === "interval") {
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

  const bindDiscovered = (
    table: string,
    key: string,
    kind: DevtoolsControlKind,
    accessor: TunableAccessor,
    source: object | null,
    options?: TunableOptions,
  ): boolean => {
    const id = `${table}/${key}`;
    const existing = discoveredRecords.get(id);
    if (existing === undefined) {
      discoveredRecords.set(id, {
        id,
        table,
        key,
        kind,
        initial: cloneValue(accessor.initial),
        enabled: false,
        source,
        options,
        get: accessor.get,
        set: accessor.set,
      });
      return true;
    }
    if (source !== null && existing.source === source) return false;
    existing.source = source;
    existing.get = accessor.get;
    existing.set = accessor.set;
    existing.kind = kind;
    existing.options = options ?? existing.options;
    const control = controlRecords.get(id);
    if (existing.enabled && control !== undefined) accessor.set(cloneValue(control.value));
    return true;
  };

  const scanTable = (table: string, candidate: unknown, meta?: ScanMeta): number => {
    const { targets, skipped } = collectScanTargets(candidate, meta);
    discoverySkips = [
      ...discoverySkips.filter((entry) => entry.path !== table && !entry.path.startsWith(`${table}/`)),
      ...skipped.map((entry) => ({
        path: entry.path === "" ? table : `${table}/${entry.path}`,
        reason: entry.reason,
      })),
    ];
    if (targets.length === 0) return 0;
    let changed = false;
    let bound = 0;
    for (const { path, target, key, kind, options } of targets) {
      const boundKeys = boundProps.get(target);
      if (boundKeys?.has(key) === true && !discoveredRecords.has(`${table}/${path}`)) continue;
      const accessor: TunableAccessor = {
        initial: cloneValue(target[key]),
        get: () => target[key],
        set: (value) => {
          target[key] = value;
        },
      };
      if (bindDiscovered(table, path, kind, accessor, target, options)) changed = true;
      bound += 1;
      if (boundKeys === undefined) boundProps.set(target, new Set([key]));
      else boundKeys.add(key);
    }
    if (changed) signal.notify();
    return bound;
  };

  const enableDiscovered = (id: string): void => {
    const record = discoveredRecords.get(id);
    if (record === undefined || record.enabled) return;
    record.enabled = true;
    const current = record.get();
    const handle = register<unknown>(id, record.initial, {
      ...(record.options ?? {}),
      group: record.options?.group ?? record.table,
      label: record.options?.label ?? record.key,
      kind: record.kind,
    });
    handle.subscribe((value) => record.set(cloneValue(value)));
    if (JSON.stringify(current) !== JSON.stringify(record.initial)) handle.set(current);
  };

  return {
    frame: {
      record: recordFrame,
      stats: frameStats,
      longFrames: () => longFrameEvents,
      clearLongFrames() {
        longFrameEvents.length = 0;
      },
    },
    profile: {
      begin(name) {
        const start = nowMs();
        return () => addPhaseMs(name, nowMs() - start);
      },
      measure(name, fn) {
        const start = nowMs();
        try {
          return fn();
        } finally {
          addPhaseMs(name, nowMs() - start);
        }
      },
      add: addPhaseMs,
      current: () => ({ ...currentPhases }),
      reset: resetCurrentPhases,
    },
    render: {
      record(sample) {
        renderSample = sample;
      },
      latest: () => renderSample,
    },
    logs: {
      push: pushLog,
      captureConsole() {
        if (consoleCaptured) return;
        const globalConsole = (globalThis as { console?: Console }).console;
        if (globalConsole === undefined) return;
        consoleCaptured = true;
        const levels: DevtoolsLogLevel[] = ["log", "info", "warn", "error"];
        for (const level of levels) {
          const original = globalConsole[level].bind(globalConsole);
          globalConsole[level] = (...args: unknown[]) => {
            pushLog(level, formatLogMessage(args));
            original(...args);
          };
        }
      },
      list: () => logEntries,
      clear() {
        logEntries.length = 0;
        signal.notify();
      },
    },
    latency: {
      record(ms) {
        latencySamples.push(ms);
        if (latencySamples.length > LATENCY_CAPACITY) latencySamples.splice(0, latencySamples.length - LATENCY_CAPACITY);
      },
      stats: latencyStats,
    },
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
    discover: {
      bind(table, key, accessor, options) {
        const kind = discoverableKind(accessor.initial, options);
        if (kind === null) return;
        if (bindDiscovered(table, key, kind, accessor, null, options)) signal.notify();
      },
      scanTable,
      scanModule(exports, meta) {
        let total = 0;
        for (const [name, value] of Object.entries(exports)) {
          total += scanTable(name, value, meta);
        }
        return total;
      },
      list: () =>
        [...discoveredRecords.values()].map((record) => ({
          id: record.id,
          table: record.table,
          key: record.key,
          kind: record.kind,
          initial: record.initial,
          enabled: record.enabled,
          read: () => record.get(),
        })),
      skipped: () => discoverySkips,
      enable(id) {
        enableDiscovered(id);
        signal.notify();
      },
      disable(id) {
        const record = discoveredRecords.get(id);
        if (record === undefined || !record.enabled) return;
        record.enabled = false;
        record.set(cloneValue(record.initial));
        controlRecords.delete(id);
        signal.notify();
      },
      clear() {
        for (const record of discoveredRecords.values()) {
          if (record.enabled) {
            record.set(cloneValue(record.initial));
            controlRecords.delete(record.id);
          }
        }
        discoveredRecords.clear();
        discoverySkips = [];
        boundProps = new WeakMap();
        signal.notify();
      },
    },
    overrides: {
      export() {
        const enabled = [...discoveredRecords.values()].filter((r) => r.enabled).map((r) => r.id);
        const values: Record<string, unknown> = {};
        const schemas: NonNullable<DevtoolsOverrides["schemas"]> = {};
        for (const record of controlRecords.values()) {
          schemas[record.name] = { kind: record.kind, schemaVersion: record.schemaVersion };
          const same =
            record.kind === "vec2" ||
            record.kind === "vec3" ||
            record.kind === "vec4" ||
            record.kind === "interval"
              ? JSON.stringify(record.value) === JSON.stringify(record.initial)
              : Object.is(record.value, record.initial);
          if (!same) values[record.name] = cloneValue(record.value);
        }
        return {
          version: OVERRIDES_FORMAT_VERSION,
          enabled,
          values,
          schemas,
        };
      },
      apply(raw) {
        const parsed = parseOverridesPayload(raw);
        const diagnostics = [...parsed.diagnostics];
        const skipped: OverrideApplyDiagnostic[] = [];
        if (parsed.overrides === null) {
          return { applied: 0, skipped, diagnostics };
        }
        const overrides = parsed.overrides;
        let applied = 0;
        for (const id of overrides.enabled) {
          if (!discoveredRecords.has(id) && !controlRecords.has(id)) {
            skipped.push({ id, reason: "unknown control id" });
            continue;
          }
          enableDiscovered(id);
          applied += 1;
        }
        for (const [name, value] of Object.entries(overrides.values)) {
          const record = controlRecords.get(name);
          if (record === undefined) {
            skipped.push({ id: name, reason: "control not registered" });
            continue;
          }
          const schema = overrides.schemas?.[name];
          if (schema !== undefined && schema.kind !== record.kind) {
            skipped.push({ id: name, reason: `kind mismatch stored=${schema.kind} current=${record.kind}` });
            continue;
          }
          if (!writeControl(record, value)) {
            skipped.push({ id: name, reason: "value failed validation" });
            continue;
          }
          applied += 1;
        }
        signal.notify();
        return { applied, skipped, diagnostics };
      },
    },
    probes: {
      register(name, read) {
        probeReaders.set(name, read);
        signal.notify();
        return () => {
          probeReaders.delete(name);
          signal.notify();
        };
      },
      read: readProbes,
    },
    signal,
    snapshot() {
      return {
        at: Date.now(),
        frame: frameStats(),
        render: renderSample,
        latency: latencyStats(),
        longFrames: [...longFrameEvents],
        logs: [...logEntries],
        probes: readProbes(),
        controls: [...controlRecords.values()].map((record) => ({
          name: record.name,
          kind: record.kind,
          value: record.value,
          initial: record.initial,
        })),
        discovered: [...discoveredRecords.values()].map((record) => ({
          id: record.id,
          kind: record.kind,
          value: record.get(),
          enabled: record.enabled,
        })),
        skipped: [...discoverySkips],
      };
    },
  };
}

export const devtools: Devtools = createDevtools();

export function tunable<T>(name: string, initial: T, options?: TunableOptions<T>): Tunable<T> {
  return devtools.controls.register(name, initial, options);
}

export function snapshotDevtools(): DevtoolsSnapshot {
  return devtools.snapshot();
}

export function measureProfile<T>(name: string, fn: () => T): T {
  return devtools.profile.measure(name, fn);
}

export function instrumentLatency<T extends object>(target: T, methods: readonly (keyof T)[], record: (ms: number) => void = devtools.latency.record): T {
  const wrapped: T = { ...target };
  for (const method of methods) {
    const fn = target[method] as unknown as ((...args: unknown[]) => unknown) | undefined;
    if (typeof fn !== "function") continue;
    wrapped[method] = ((...args: unknown[]) => {
      const start = nowMs();
      const result = fn.call(target, ...args);
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            record(nowMs() - start);
            return value;
          },
          (error) => {
            record(nowMs() - start);
            throw error;
          },
        );
      }
      return result;
    }) as T[typeof method];
  }
  return wrapped;
}
