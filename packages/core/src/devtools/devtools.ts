import { createChangeSignal, type ChangeSignal } from "../store/changeSignal";

export type DevtoolsControlKind = "slider" | "toggle" | "color" | "select" | "text";

export interface TunableOptions<T> {
  min?: number;
  max?: number;
  step?: number;
  options?: readonly T[];
  label?: string;
  group?: string;
  onChange?: (value: T) => void;
}

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
  read(): unknown;
  write(value: unknown): void;
  reset(): void;
}

export interface Tunable<T> {
  readonly name: string;
  readonly kind: DevtoolsControlKind;
  readonly initial: T;
  readonly value: T;
  set(value: T): void;
  reset(): void;
  subscribe(listener: (value: T) => void): () => void;
}

export interface FrameStats {
  fps: number;
  avgFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  avgSimMs: number;
  maxSimMs: number;
  longFrames: number;
  samples: number;
  recentFrameMs: readonly number[];
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

export interface DevtoolsSnapshot {
  at: number;
  frame: FrameStats | null;
  render: RenderSample | null;
  latency: LatencyStats | null;
  logs: readonly DevtoolsLogEntry[];
  probes: Record<string, unknown>;
  controls: readonly { name: string; kind: DevtoolsControlKind; value: unknown; initial: unknown }[];
}

export interface Devtools {
  frame: {
    record(sample: { frameMs: number; simMs: number }): void;
    stats(): FrameStats | null;
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
    resetAll(): void;
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
const LONG_FRAME_MS = 33.4;
const LATENCY_CAPACITY = 120;
const LOG_CAPACITY = 200;
const LOG_MESSAGE_MAX = 400;

const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function nowMs(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf !== undefined ? perf.now() : Date.now();
}

function inferKind(initial: unknown, hasOptions: boolean): DevtoolsControlKind {
  if (hasOptions) return "select";
  if (typeof initial === "number") return "slider";
  if (typeof initial === "boolean") return "toggle";
  if (typeof initial === "string" && COLOR_PATTERN.test(initial)) return "color";
  return "text";
}

function sliderBounds(
  initial: number,
  options: { min?: number; max?: number; step?: number } | undefined,
): { min: number; max: number; step: number } {
  const min = options?.min ?? (initial < 0 ? initial * 2 : 0);
  const max = options?.max ?? (initial > 0 ? initial * 2 : initial < 0 ? 0 : 1);
  const step = options?.step ?? (max - min) / 100;
  return { min, max, step };
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
  listeners: Set<(value: unknown) => void>;
}

export function createDevtools(): Devtools {
  const signal = createChangeSignal();

  const frameMsBuffer = new Float64Array(FRAME_CAPACITY);
  const simMsBuffer = new Float64Array(FRAME_CAPACITY);
  let frameIndex = 0;
  let frameCount = 0;

  let renderSample: RenderSample | null = null;

  const logEntries: DevtoolsLogEntry[] = [];
  let consoleCaptured = false;

  const latencySamples: number[] = [];

  const controlRecords = new Map<string, ControlRecord>();
  const probeReaders = new Map<string, () => unknown>();

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

  const frameStats = (): FrameStats | null => {
    if (frameCount === 0) return null;
    const size = Math.min(frameCount, FRAME_CAPACITY);
    const frames: number[] = [];
    const sims: number[] = [];
    for (let offset = 0; offset < size; offset += 1) {
      const at = (frameIndex - size + offset + FRAME_CAPACITY) % FRAME_CAPACITY;
      frames.push(frameMsBuffer[at]!);
      sims.push(simMsBuffer[at]!);
    }
    const recent = frames.slice(-RECENT_FRAMES);
    const recentAvg = recent.reduce((sum, ms) => sum + ms, 0) / recent.length;
    const sorted = [...frames].sort((a, b) => a - b);
    return {
      fps: recentAvg > 0 ? 1000 / recentAvg : 0,
      avgFrameMs: frames.reduce((sum, ms) => sum + ms, 0) / frames.length,
      p95FrameMs: percentile(sorted, 0.95),
      maxFrameMs: sorted[sorted.length - 1]!,
      avgSimMs: sims.reduce((sum, ms) => sum + ms, 0) / sims.length,
      maxSimMs: sims.reduce((max, ms) => Math.max(max, ms), 0),
      longFrames: frames.filter((ms) => ms > LONG_FRAME_MS).length,
      samples: size,
      recentFrameMs: recent,
    };
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

  const toControl = (record: ControlRecord): DevtoolsControl => ({
    name: record.name,
    kind: record.kind,
    label: record.label,
    group: record.group,
    initial: record.initial,
    min: record.min,
    max: record.max,
    step: record.step,
    options: record.options,
    read: () => record.value,
    write: (value) => writeControl(record, value),
    reset: () => writeControl(record, record.initial),
  });

  const writeControl = (record: ControlRecord, raw: unknown): void => {
    let next = raw;
    if (record.kind === "slider" && typeof next === "number") {
      if (record.min !== undefined) next = Math.max(record.min, next as number);
      if (record.max !== undefined) next = Math.min(record.max, next as number);
    }
    if (Object.is(record.value, next)) return;
    record.value = next;
    for (const listener of record.listeners) listener(next);
    signal.notify();
  };

  const register = <T,>(name: string, initial: T, options?: TunableOptions<T>): Tunable<T> => {
    const kind = inferKind(initial, options?.options !== undefined);
    const existing = controlRecords.get(name);
    const slashIndex = name.indexOf("/");
    const derivedGroup = slashIndex > 0 ? name.slice(0, slashIndex) : "general";
    const derivedLabel = slashIndex > 0 ? name.slice(slashIndex + 1) : name;
    const bounds = kind === "slider" ? sliderBounds(initial as number, options) : undefined;
    const record: ControlRecord =
      existing !== undefined && existing.kind === kind
        ? existing
        : {
            name,
            kind,
            label: "",
            group: "",
            initial,
            value: initial,
            listeners: new Set(),
          };
    record.label = options?.label ?? derivedLabel;
    record.group = options?.group ?? derivedGroup;
    record.initial = initial;
    record.min = bounds?.min;
    record.max = bounds?.max;
    record.step = bounds?.step;
    record.options = options?.options;
    if (options?.onChange !== undefined) record.listeners.add(options.onChange as (value: unknown) => void);
    controlRecords.set(name, record);
    signal.notify();
    return {
      name,
      kind,
      initial,
      get value() {
        return record.value as T;
      },
      set: (value: T) => writeControl(record, value),
      reset: () => writeControl(record, record.initial),
      subscribe: (listener: (value: T) => void) => {
        record.listeners.add(listener as (value: unknown) => void);
        return () => record.listeners.delete(listener as (value: unknown) => void);
      },
    };
  };

  return {
    frame: {
      record({ frameMs, simMs }) {
        frameMsBuffer[frameIndex] = frameMs;
        simMsBuffer[frameIndex] = simMs;
        frameIndex = (frameIndex + 1) % FRAME_CAPACITY;
        frameCount += 1;
      },
      stats: frameStats,
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
      resetAll() {
        for (const record of controlRecords.values()) writeControl(record, record.initial);
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
        logs: [...logEntries],
        probes: readProbes(),
        controls: [...controlRecords.values()].map((record) => ({
          name: record.name,
          kind: record.kind,
          value: record.value,
          initial: record.initial,
        })),
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
