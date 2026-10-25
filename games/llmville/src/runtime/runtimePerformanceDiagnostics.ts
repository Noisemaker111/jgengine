import { useSyncExternalStore } from "react";

import {
  formatPerformanceProfileReport,
  getPerformanceProfileOffenders,
} from "@/runtime/runtimePerformanceProfiler";

export const FPS_HISTORY_SECONDS = 60;
export const FRAME_TIME_RING_SIZE = 300;
const JANK_FRAME_MS_60FPS = 16.7;
const JANK_FRAME_MS_30FPS = 33.3;
const JANK_FRAME_MS_SEVERE = 50;

export interface PerformanceRenderStats {
  triangles: number;
  calls: number;
  points: number;
  lines: number;
  geometries: number;
  textures: number;
}

export interface PerformanceDisplayStats {
  dpr: number;
  width: number;
  height: number;
  pointerLocked: boolean;
  tabVisible: boolean;
}

export interface PerformanceDiagnosticContext {
  gameId: string;
  rackCount: number;
  presenceCount: number;
  playerX: number;
  playerZ: number;
}

export interface PerformanceFrameTimeStats {
  sampleCount: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  worstMs: number;
  over60FpsBudget: number;
  over30FpsBudget: number;
  overSevere: number;
}

export interface PerformanceFpsDip {
  secondsAgo: number;
  fps: number;
}

export interface PerformanceDiagnosticSnapshot {
  fps: number;
  frameMs: number;
  fpsHistory: readonly number[];
  fpsMin: number;
  fpsAvg: number;
  fpsMax: number;
  frameMsMin: number;
  frameMsMax: number;
  frameTimeStats: PerformanceFrameTimeStats;
  worstFpsDips: readonly PerformanceFpsDip[];
  render: PerformanceRenderStats;
  jsHeapMb: number | null;
  jsHeapLimitMb: number | null;
  display: PerformanceDisplayStats;
  context: PerformanceDiagnosticContext | null;
}

interface FpsBucket {
  frameMsTotal: number;
  frameCount: number;
}

const EMPTY_FPS_HISTORY: readonly number[] = [];

const defaultRenderStats: PerformanceRenderStats = {
  triangles: 0,
  calls: 0,
  points: 0,
  lines: 0,
  geometries: 0,
  textures: 0,
};

const defaultDisplayStats: PerformanceDisplayStats = {
  dpr: 1,
  width: 0,
  height: 0,
  pointerLocked: false,
  tabVisible: true,
};

const defaultFrameTimeStats: PerformanceFrameTimeStats = {
  sampleCount: 0,
  p50Ms: 0,
  p95Ms: 0,
  p99Ms: 0,
  worstMs: 0,
  over60FpsBudget: 0,
  over30FpsBudget: 0,
  overSevere: 0,
};

const defaultSnapshot: PerformanceDiagnosticSnapshot = {
  fps: 0,
  frameMs: 0,
  fpsHistory: EMPTY_FPS_HISTORY,
  fpsMin: 0,
  fpsAvg: 0,
  fpsMax: 0,
  frameMsMin: 0,
  frameMsMax: 0,
  frameTimeStats: defaultFrameTimeStats,
  worstFpsDips: [],
  render: defaultRenderStats,
  jsHeapMb: null,
  jsHeapLimitMb: null,
  display: defaultDisplayStats,
  context: null,
};

let snapshot: PerformanceDiagnosticSnapshot = defaultSnapshot;
const listeners = new Set<() => void>();

let visible = false;
const visibilityListeners = new Set<() => void>();

const fpsHistory: number[] = [];
const frameTimeRing: number[] = [];
let activeBucket: FpsBucket = { frameMsTotal: 0, frameCount: 0 };
let bucketStartedAt = 0;
let smoothedFps = 0;
let lastFrameMs = 0;
let framesSinceEmit = 0;
let diagnosticContext: PerformanceDiagnosticContext | null = null;

function emitChange(): void {
  for (const listener of listeners) listener();
}

function emitVisibilityChange(): void {
  for (const listener of visibilityListeners) listener();
}

function readJsHeap(): { usedMb: number | null; limitMb: number | null } {
  const heap = (performance as Performance & {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
  }).memory;
  if (!heap) return { usedMb: null, limitMb: null };
  return {
    usedMb: heap.usedJSHeapSize / (1024 * 1024),
    limitMb: heap.jsHeapSizeLimit / (1024 * 1024),
  };
}

function readDisplayStats(): PerformanceDisplayStats {
  if (typeof window === "undefined") return defaultDisplayStats;
  return {
    dpr: window.devicePixelRatio,
    width: window.innerWidth,
    height: window.innerHeight,
    pointerLocked: document.pointerLockElement !== null,
    tabVisible: !document.hidden,
  };
}

function commitBucket(now: number): void {
  if (activeBucket.frameCount === 0) {
    bucketStartedAt = now;
    return;
  }

  const avgFrameMs = activeBucket.frameMsTotal / activeBucket.frameCount;
  const bucketFps = clampFps(1000 / avgFrameMs);
  fpsHistory.push(bucketFps);
  while (fpsHistory.length > FPS_HISTORY_SECONDS) {
    fpsHistory.shift();
  }

  activeBucket = { frameMsTotal: 0, frameCount: 0 };
  bucketStartedAt = now;
}

function rebuildSnapshot(render: PerformanceRenderStats): void {
  const stats = computeFpsStats(fpsHistory);
  const heap = readJsHeap();
  snapshot = {
    fps: smoothedFps,
    frameMs: lastFrameMs,
    fpsHistory: fpsHistory.length === 0 ? EMPTY_FPS_HISTORY : [...fpsHistory],
    fpsMin: stats.min,
    fpsAvg: stats.avg,
    fpsMax: stats.max,
    frameMsMin: stats.frameMsMin,
    frameMsMax: stats.frameMsMax,
    frameTimeStats: computeFrameTimeStats(frameTimeRing),
    worstFpsDips: findWorstFpsDips(fpsHistory),
    render,
    jsHeapMb: heap.usedMb,
    jsHeapLimitMb: heap.limitMb,
    display: readDisplayStats(),
    context: diagnosticContext,
  };
}

function clampFps(fps: number): number {
  if (!Number.isFinite(fps) || fps < 0) return 0;
  return Math.min(999, fps);
}

function computeFpsStats(history: readonly number[]): {
  min: number;
  avg: number;
  max: number;
  frameMsMin: number;
  frameMsMax: number;
} {
  if (history.length === 0) {
    return { min: 0, avg: 0, max: 0, frameMsMin: 0, frameMsMax: 0 };
  }

  let min = history[0];
  let max = history[0];
  let sum = 0;
  for (const fps of history) {
    min = Math.min(min, fps);
    max = Math.max(max, fps);
    sum += fps;
  }
  const avg = sum / history.length;
  return {
    min,
    avg,
    max,
    frameMsMin: avg > 0 ? 1000 / max : 0,
    frameMsMax: min > 0 ? 1000 / min : 0,
  };
}

function percentile(sortedValues: readonly number[], ratio: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor(ratio * (sortedValues.length - 1))),
  );
  return sortedValues[index];
}

function computeFrameTimeStats(frameTimes: readonly number[]): PerformanceFrameTimeStats {
  if (frameTimes.length === 0) return defaultFrameTimeStats;

  const sorted = [...frameTimes].sort((left, right) => left - right);
  let over60FpsBudget = 0;
  let over30FpsBudget = 0;
  let overSevere = 0;
  let worstMs = 0;

  for (const frameMs of frameTimes) {
    worstMs = Math.max(worstMs, frameMs);
    if (frameMs > JANK_FRAME_MS_60FPS) over60FpsBudget += 1;
    if (frameMs > JANK_FRAME_MS_30FPS) over30FpsBudget += 1;
    if (frameMs > JANK_FRAME_MS_SEVERE) overSevere += 1;
  }

  return {
    sampleCount: frameTimes.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    worstMs,
    over60FpsBudget,
    over30FpsBudget,
    overSevere,
  };
}

function findWorstFpsDips(history: readonly number[], count = 3): PerformanceFpsDip[] {
  if (history.length === 0 || count <= 0) return [];

  return history
    .map((fps, index) => ({
      secondsAgo: history.length - index,
      fps,
    }))
    .sort((left, right) => left.fps - right.fps)
    .slice(0, count);
}

export function resolveFpsHistoryIndexAtX(
  historyLength: number,
  x: number,
  chartWidth: number,
  historySeconds = FPS_HISTORY_SECONDS,
): number | null {
  if (historyLength <= 0 || chartWidth <= 0) return null;

  const slotWidth = chartWidth / historySeconds;
  const oldestSlotIndex = historySeconds - historyLength;
  const slotIndex = Math.floor(x / slotWidth);
  const historyIndex = slotIndex - oldestSlotIndex;
  if (historyIndex < 0 || historyIndex >= historyLength) return null;
  return historyIndex;
}

export function frameMsToEffectiveFps(frameMs: number): number {
  if (!Number.isFinite(frameMs) || frameMs <= 0) return 0;
  return clampFps(1000 / frameMs);
}

export function inferPerformanceDiagnosis(
  snapshot: PerformanceDiagnosticSnapshot,
  topOffenderLabel?: string | null,
): string {
  const { frameTimeStats, render, jsHeapMb } = snapshot;
  if (frameTimeStats.sampleCount === 0) return "Collecting samples…";

  const effectiveFps = frameMsToEffectiveFps(frameTimeStats.p50Ms);
  const offenderHint = topOffenderLabel ? ` Top offender: ${topOffenderLabel}.` : "";
  const gpuLight = render.calls < 150 && render.triangles < 5_000;
  const cpuHeavy = frameTimeStats.p50Ms > JANK_FRAME_MS_60FPS;
  const gcLikely = (jsHeapMb ?? 0) >= 400 && frameTimeStats.overSevere >= 10;

  if (gpuLight && cpuHeavy && gcLikely) {
    return `CPU-bound (~${round(effectiveFps, 0)} fps effective). ${frameTimeStats.overSevere} severe spikes; ${round(jsHeapMb ?? 0, 0)} MB heap.${offenderHint}`;
  }
  if (gpuLight && cpuHeavy) {
    return `CPU-bound (~${round(effectiveFps, 0)} fps effective). GPU load is low (${render.calls} draws, ${render.triangles} tris).${offenderHint}`;
  }
  if (!gpuLight && cpuHeavy) {
    return `Mixed load (~${round(effectiveFps, 0)} fps effective). GPU and CPU stressed (${render.calls} draws, ${render.triangles} tris).${offenderHint}`;
  }
  if (effectiveFps >= 55) return `Healthy — holding near 60 fps.${offenderHint}`;
  return `Mild stutter (~${round(effectiveFps, 0)} fps effective).${offenderHint}`;
}

export function formatPerformanceDiagnosticReport(
  snapshot: PerformanceDiagnosticSnapshot,
  generatedAt = new Date(),
): string {
  const offenderRows = getPerformanceProfileOffenders();
  const offenderReport = formatPerformanceProfileReport(offenderRows);
  const effectiveFps = frameMsToEffectiveFps(snapshot.frameTimeStats.p50Ms);
  const topOffender = offenderRows[0]?.label ?? null;
  const lines: string[] = [
    "LLMville Performance Diagnostic Report",
    `generatedAt: ${generatedAt.toISOString()}`,
    "",
    "[verdict]",
    inferPerformanceDiagnosis(snapshot, topOffender),
    "",
    "[fps]",
    `smoothed: ${round(snapshot.fps, 1)}`,
    `effectiveP50: ${round(effectiveFps, 1)}`,
    `frameMs: ${round(snapshot.frameMs, 2)}`,
    `historySeconds: ${snapshot.fpsHistory.length}/${FPS_HISTORY_SECONDS}`,
    `min: ${round(snapshot.fpsMin, 1)}`,
    `avg: ${round(snapshot.fpsAvg, 1)}`,
    `max: ${round(snapshot.fpsMax, 1)}`,
    `samples: ${snapshot.fpsHistory.map((fps) => round(fps, 1)).join(",")}`,
    "",
    "[frameTime]",
    `windowFrames: ${snapshot.frameTimeStats.sampleCount}/${FRAME_TIME_RING_SIZE}`,
    `p50Ms: ${round(snapshot.frameTimeStats.p50Ms, 2)}`,
    `p95Ms: ${round(snapshot.frameTimeStats.p95Ms, 2)}`,
    `p99Ms: ${round(snapshot.frameTimeStats.p99Ms, 2)}`,
    `worstMs: ${round(snapshot.frameTimeStats.worstMs, 2)}`,
    `over16_7ms: ${snapshot.frameTimeStats.over60FpsBudget}`,
    `over33ms: ${snapshot.frameTimeStats.over30FpsBudget}`,
    `over50ms: ${snapshot.frameTimeStats.overSevere}`,
    "",
    "[worstDips]",
  ];

  if (snapshot.worstFpsDips.length === 0) {
    lines.push("none");
  } else {
    for (const dip of snapshot.worstFpsDips) {
      lines.push(`${dip.secondsAgo}s ago: ${round(dip.fps, 1)} fps`);
    }
  }

  lines.push(
    "",
    "[renderer]",
    `drawCalls: ${snapshot.render.calls}`,
    `triangles: ${snapshot.render.triangles}`,
    `points: ${snapshot.render.points}`,
    `lines: ${snapshot.render.lines}`,
    `geometries: ${snapshot.render.geometries}`,
    `textures: ${snapshot.render.textures}`,
    "",
    "[display]",
    `viewport: ${snapshot.display.width}x${snapshot.display.height}`,
    `dpr: ${round(snapshot.display.dpr, 3)}`,
    `pointerLocked: ${snapshot.display.pointerLocked}`,
    `tabVisible: ${snapshot.display.tabVisible}`,
  );

  if (snapshot.jsHeapMb !== null) {
    lines.push(
      `jsHeapMb: ${round(snapshot.jsHeapMb, 1)}`,
      `jsHeapLimitMb: ${snapshot.jsHeapLimitMb === null ? "unknown" : round(snapshot.jsHeapLimitMb, 1)}`,
    );
  }

  if (snapshot.context) {
    lines.push(
      "",
      "[world]",
      `gameId: ${snapshot.context.gameId}`,
      `rackCount: ${snapshot.context.rackCount}`,
      `presenceCount: ${snapshot.context.presenceCount}`,
      `player: ${round(snapshot.context.playerX, 2)}, ${round(snapshot.context.playerZ, 2)}`,
    );
  }

  if (offenderReport) {
    lines.push("", offenderReport);
  }

  return lines.join("\n");
}

function round(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "NaN";
}

export function buildFpsChartPath(
  history: readonly number[],
  width: number,
  height: number,
  maxFps = 120,
): string {
  if (history.length === 0 || width <= 0 || height <= 0) return "";

  const slotWidth = width / FPS_HISTORY_SECONDS;
  const points: string[] = [];

  history.forEach((fps, index) => {
    const slotIndex = FPS_HISTORY_SECONDS - history.length + index;
    const x = slotIndex * slotWidth + slotWidth / 2;
    const clamped = Math.min(fps, maxFps);
    const y = height - (clamped / maxFps) * height;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  });

  return points.join(" ");
}

export function recordPerformanceFrame(frameMs: number, now = performance.now()): void {
  if (!Number.isFinite(frameMs) || frameMs <= 0) return;

  frameTimeRing.push(frameMs);
  while (frameTimeRing.length > FRAME_TIME_RING_SIZE) {
    frameTimeRing.shift();
  }

  lastFrameMs = frameMs;
  const instantFps = clampFps(1000 / frameMs);
  smoothedFps = smoothedFps <= 0 ? instantFps : smoothedFps * 0.9 + instantFps * 0.1;

  if (bucketStartedAt === 0) bucketStartedAt = now;
  activeBucket.frameMsTotal += frameMs;
  activeBucket.frameCount += 1;

  framesSinceEmit += 1;
  const shouldCommitBucket = now - bucketStartedAt >= 1000;
  const shouldEmitFrameStats = framesSinceEmit >= 10;
  if (shouldCommitBucket) {
    commitBucket(now);
    framesSinceEmit = 0;
    rebuildSnapshot(snapshot.render);
    emitChange();
    return;
  }
  if (shouldEmitFrameStats) {
    framesSinceEmit = 0;
    rebuildSnapshot(snapshot.render);
    emitChange();
  }
}

export function refreshPerformanceRendererStats(render: PerformanceRenderStats): void {
  rebuildSnapshot(render);
  emitChange();
}

export function setPerformanceDiagnosticContext(context: PerformanceDiagnosticContext | null): void {
  diagnosticContext = context;
  rebuildSnapshot(snapshot.render);
  emitChange();
}

export function subscribeToPerformanceDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getPerformanceDiagnosticSnapshot(): PerformanceDiagnosticSnapshot {
  return snapshot;
}

export function subscribeToPerformanceDiagnosticVisible(listener: () => void): () => void {
  visibilityListeners.add(listener);
  return () => visibilityListeners.delete(listener);
}

export function getPerformanceDiagnosticVisible(): boolean {
  return visible;
}

export function setPerformanceDiagnosticVisible(next: boolean): void {
  if (visible === next) return;
  visible = next;
  emitVisibilityChange();
}

export function togglePerformanceDiagnosticVisible(): void {
  setPerformanceDiagnosticVisible(!visible);
}

export function usePerformanceDiagnosticSnapshot(): PerformanceDiagnosticSnapshot {
  return useSyncExternalStore(
    subscribeToPerformanceDiagnostics,
    getPerformanceDiagnosticSnapshot,
    () => defaultSnapshot,
  );
}

export function usePerformanceDiagnosticVisible(): boolean {
  return useSyncExternalStore(
    subscribeToPerformanceDiagnosticVisible,
    getPerformanceDiagnosticVisible,
    () => false,
  );
}

