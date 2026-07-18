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
