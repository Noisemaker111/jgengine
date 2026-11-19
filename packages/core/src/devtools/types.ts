import type { ChangeSignal } from "../store/changeSignal";
import type {
  AngleUnit,
  DevtoolsControlKind,
  DevtoolsOverrides,
  DiscoverySkip,
  OverrideApplyDiagnostic,
  ScanMeta,
  TunableChoice,
  TunableOptions,
} from "./tunableSchema";

export interface DevtoolsControl {
  readonly name: string;
  readonly kind: DevtoolsControlKind;
  readonly label: string;
  readonly group: string;
  readonly initial: unknown;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
  readonly options?: readonly unknown[] | undefined;
  readonly choices?: readonly TunableChoice[] | undefined;
  readonly unit?: AngleUnit | undefined;
  readonly displayUnit?: AngleUnit | undefined;
  readonly wrap?: boolean | undefined;
  readonly integer?: boolean | undefined;
  readonly axisLabels?: readonly string[] | undefined;
  readonly axisMin?: readonly number[] | undefined;
  readonly axisMax?: readonly number[] | undefined;
  readonly axisStep?: readonly number[] | undefined;
  readonly hasAlpha?: boolean | undefined;
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
  system: string;
  message: string;
}

export interface SystemProbe {
  /** Monotonic or gauge numbers a system already tracks (counts, queue depths, cache hits). */
  counters?(): Record<string, number>;
  /** Named timings in milliseconds the system accumulated (spatial query, path solve, tick). */
  timers?(): Record<string, number>;
  state?(): string;
}

/** One system's probe read out on demand; missing sections stay empty rather than absent. */
export interface SystemProbeReading {
  counters: Record<string, number>;
  timers: Record<string, number>;
  state: string;
}

/** Bounded log ring with per-system tags, a warning/error ring, and lifetime counts. */
export interface DevtoolsLogs {
  write(level: DevtoolsLogLevel, system: string, message: string): void;
  /** Untagged convenience write; `system` defaults to `console`. */
  push(level: DevtoolsLogLevel, message: string, system?: string): void;
  captureConsole(): void;
  list(): readonly DevtoolsLogEntry[];
  severe(): readonly DevtoolsLogEntry[];
  counts(): import("./logBus").LogBusCounts;
  dropped(): number;
  snapshot(): import("./logBus").LogBusSnapshot;
  clear(): void;
}

export interface DevtoolsLatency {
  record(ms: number): void;
  stats(): LatencyStats | null;
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
  systems: Record<string, SystemProbeReading>;
  controls: readonly { name: string; kind: DevtoolsControlKind; value: unknown; initial: unknown }[];
  discovered: readonly { id: string; kind: DevtoolsControlKind; value: unknown; enabled: boolean }[];
  skipped: readonly DiscoverySkip[];
}

/** The last frame `devtools.frame.record` saw: its sim milliseconds and named phases. */
export interface LastFrameSample {
  serial: number;
  simMs: number;
  phases: Readonly<Record<string, number>>;
  ahead?: Readonly<Record<string, number>>;
}

export interface FrameRecordSample {
  frameMs: number;
  simMs: number;
  phases?: Readonly<Record<string, number>>;
  ahead?: Readonly<Record<string, number>>;
}

export interface Devtools {
  frame: {
    record(sample: FrameRecordSample): void;
    stats(): FrameStats | null;
    /** The most recent recorded frame's sim time and phases; `serial` counts records, so a reader can tell a new one. */
    last(): LastFrameSample | null;
    longFrames(): readonly LongFrameEvent[];
    clearLongFrames(): void;
    /** Drop all frame/phase/long-frame history so the next stats() window starts clean — use after load/shader warmup before measuring. */
    reset(): void;
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
  logs: DevtoolsLogs;
  latency: DevtoolsLatency;
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
    /**
     * Register a system's own counters, timers and state line. Returns its dispose; registering the
     * same id again replaces the earlier one (the last live instance wins).
     */
    registerSystem(id: string, probe: SystemProbe): () => void;
    /** Read every registered system probe. Allocates; call on demand, never per frame. */
    systems(): Record<string, SystemProbeReading>;
  };
  signal: ChangeSignal;
  snapshot(): DevtoolsSnapshot;
}
