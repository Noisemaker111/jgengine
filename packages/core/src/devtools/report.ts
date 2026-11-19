import type { LogBusCounts, LogBusSnapshot } from "./logBus";
import type { DevtoolsLogLevel, SystemProbeReading } from "./types";

/**
 * The one perf record shape. `bun run perf` (CDP, out of process) and the in-page
 * telemetry report (`window.__jg.report()`, the dev-server route, `bun run perf live`)
 * both produce exactly this object, so a budget check and a diff read either one.
 */

/** Frame duration above which a frame counts as a spike (~30 fps). */
export const LONG_FRAME_MS = 33.4;

export type PerfQuality = "full" | "draft";

export type SceneNodeSource = "scene-graph" | "heap-object3d" | "unavailable";

export interface FrameWindow {
  fps: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  samples: number;
  longFrames: number;
}

export interface RenderReport {
  draws: number | null;
  /**
   * Every draw issued in a frame, all passes (shadow, main, postfx, AO, DOF), as the 95th percentile
   * of the measured window: the count the budget gate compares. Only the CDP harness can wrap the
   * draw calls, so the in-page sampler reports `null` here.
   */
  drawsFrame: number | null;
  drawsFrames: number;
  triangles: number | null;
  geometries: number | null;
  textures: number | null;
  nodes: number | null;
  nodesSource: SceneNodeSource;
  scenes: number;
}

export interface GlReport {
  programsLinked: number;
  framebuffers: number;
  buffers: number;
  textures: number;
  vertexArrays: number;
  allocations: number;
  residentPrograms: number | null;
  total: Record<string, number>;
  /** True once the counters provably wrapped the WebGL calls; false means a zero is not evidence. */
  attached: boolean;
}

export interface ProfileEntry {
  fn: string;
  at: string;
  selfMs: number;
  selfPct: number;
  via?: string;
}

export interface ProfileReport {
  samplingUs: number;
  seconds: number;
  top: readonly ProfileEntry[];
}

export interface ReportLogLine {
  at: number;
  level: DevtoolsLogLevel;
  system: string;
  message: string;
}

/** Bounded log read-out carried by the report: warn/error lines survive even a flood of info logs. */
export interface ReportLogs {
  counts: LogBusCounts;
  dropped: number;
  severe: readonly ReportLogLine[];
}

export interface ReportTelemetry {
  source: "in-page" | "cdp";
  warmedUp: boolean;
  /** Milliseconds since the sampler started. */
  ageMs: number;
  /** Milliseconds the report itself took to gather. */
  buildMs: number;
  heapBytes: number | null;
}

/** One measured window of one game: the record `bun run perf`, `window.__jg.report()` and `bun run perf live` print. */
export interface PerfReport {
  game: string;
  gpu: string;
  quality: PerfQuality;
  viewport: string;
  /** Length of the measured frame window in seconds. */
  seconds: number;
  at: number;
  frame: FrameWindow;
  render: RenderReport;
  gl: GlReport;
  sim: { avgMs: number; outsideMs: number } | null;
  profile: ProfileReport | null;
  systems: Record<string, SystemProbeReading>;
  logs: ReportLogs | null;
  telemetry: ReportTelemetry | null;
}

/** Round to `digits` decimals so two runs of different lengths print comparably. @internal */
export function roundReport(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/**
 * Reduce raw frame deltas to {@link FrameWindow}. One implementation, so the CDP
 * harness and the in-page sampler cannot disagree about fps or p95.
 * @internal
 */
export function summarizeFrameWindow(samples: ArrayLike<number>): FrameWindow {
  const kept: number[] = [];
  for (let index = 0; index < samples.length; index += 1) {
    const ms = samples[index]!;
    if (Number.isFinite(ms) && ms > 0) kept.push(ms);
  }
  if (kept.length === 0) return { fps: 0, avgMs: 0, p95Ms: 0, maxMs: 0, samples: 0, longFrames: 0 };
  const sorted = [...kept].sort((a, b) => a - b);
  const avgMs = kept.reduce((sum, ms) => sum + ms, 0) / kept.length;
  return {
    fps: roundReport(1000 / avgMs, 1),
    avgMs: roundReport(avgMs),
    p95Ms: roundReport(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!),
    maxMs: roundReport(sorted[sorted.length - 1]!),
    samples: kept.length,
    longFrames: kept.filter((ms) => ms > LONG_FRAME_MS).length,
  };
}

/**
 * Project a log-bus read-out onto the report's compact shape: totals plus the last
 * twelve warning/error lines. A thrown error or a lost GL context therefore survives
 * in the report even when hundreds of info lines followed it.
 * @internal
 */
export function toReportLogs(snapshot: LogBusSnapshot, severeLimit = 12): ReportLogs {
  const severe = snapshot.severe
    .slice(-severeLimit)
    .map((entry) => ({ at: entry.at, level: entry.level, system: entry.system, message: entry.message }));
  return { counts: snapshot.counts, dropped: snapshot.dropped, severe };
}
