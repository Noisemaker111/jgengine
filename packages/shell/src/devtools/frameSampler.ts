import { devtools } from "@jgengine/core/devtools/devtools";
import { roundReport, toReportLogs, type GlReport, type PerfQuality, type PerfReport, type ReportLogs } from "@jgengine/core/devtools/report";
import type { FrameStats, RenderSample, SystemProbeReading } from "@jgengine/core/devtools/types";
import { REPORT_ENDPOINT_PATH } from "@jgengine/core/devtools/reportEndpoint";
import { readUrlParam } from "@jgengine/core/devtools/urlFlags";

/**
 * In-page frame telemetry: the game reports on itself instead of needing a second
 * process to attach a profiler. Frame timings come from the devtools frame ring,
 * renderer counts from the live renderer, GPU-object creation from wrapped GL calls,
 * and per-system numbers from `devtools.probes` — all read on demand, so nothing
 * here runs on the hot path.
 */

/** Query flag that turns the sampler off for an A/B frame-time comparison. */
export const TELEMETRY_FLAG = "telemetry";
/** How long after the sampler starts the GL counters get their post-warmup baseline. */
export const TELEMETRY_WARMUP_MS = 5_000;
/** Cadence of the push to the dev server, in milliseconds. */
export const REPORT_PUSH_MS = 1_000;

/** GPU-object creation counts, the fields the budget gate compares. */
export interface GlCounterTotals {
  programsLinked: number;
  framebuffers: number;
  buffers: number;
  textures: number;
  vertexArrays: number;
}

const WATCHED_GL_CALLS: readonly (readonly [string, keyof GlCounterTotals])[] = [
  ["linkProgram", "programsLinked"],
  ["createFramebuffer", "framebuffers"],
  ["createBuffer", "buffers"],
  ["createTexture", "textures"],
  ["createVertexArray", "vertexArrays"],
];

function emptyGlTotals(): GlCounterTotals {
  return { programsLinked: 0, framebuffers: 0, buffers: 0, textures: 0, vertexArrays: 0 };
}

/**
 * Wrap the live context's creation calls so a leak shows up as a non-zero counter.
 * Only object creation is wrapped — never a draw call — so a steady-state frame
 * pays nothing. Returns whether any call was actually wrapped, since a zero is only
 * evidence when it was.
 * @internal
 */
export function attachGlCounters(context: object): { totals: GlCounterTotals; attached: boolean } {
  const totals = emptyGlTotals();
  const target = context as Record<string, unknown>;
  let attached = false;
  for (const [method, key] of WATCHED_GL_CALLS) {
    const original = target[method];
    if (typeof original !== "function") continue;
    attached = true;
    target[method] = (...args: unknown[]) => {
      totals[key] += 1;
      return (original as (...callArgs: unknown[]) => unknown).apply(context, args);
    };
  }
  return { totals, attached };
}

/**
 * Count live three.js nodes from the scene the game is drawing; `null` when it cannot be walked.
 * @internal
 */
export function countSceneNodes(scene: unknown): { nodes: number | null; scenes: number } {
  const candidate = scene as { traverse?: (visit: (node: unknown) => void) => void } | null | undefined;
  if (candidate === null || candidate === undefined || typeof candidate.traverse !== "function") {
    return { nodes: null, scenes: 0 };
  }
  try {
    let nodes = 0;
    candidate.traverse(() => {
      nodes += 1;
    });
    return { nodes, scenes: 1 };
  } catch {
    return { nodes: null, scenes: 0 };
  }
}

/** Everything the report needs, gathered by whichever producer is asking. */
export interface FrameReportInputs {
  game: string;
  gpu: string;
  quality: PerfQuality;
  viewport: string;
  at: number;
  /** Frame stats from the devtools ring; `null` before the first frame. */
  frame: FrameStats | null;
  render: RenderSample | null;
  scene: { nodes: number | null; scenes: number };
  gl: {
    totals: GlCounterTotals;
    since: GlCounterTotals;
    residentPrograms: number | null;
    attached: boolean;
  };
  systems: Record<string, SystemProbeReading>;
  logs: ReportLogs | null;
  heapBytes: number | null;
  ageMs: number;
  warmedUp: boolean;
  buildMs: number;
}

function glReport(inputs: FrameReportInputs["gl"]): GlReport {
  const since = inputs.since;
  return {
    programsLinked: since.programsLinked,
    framebuffers: since.framebuffers,
    buffers: since.buffers,
    textures: since.textures,
    vertexArrays: since.vertexArrays,
    allocations:
      since.programsLinked + since.framebuffers + since.buffers + since.textures + since.vertexArrays,
    residentPrograms: inputs.residentPrograms,
    total: { ...inputs.totals },
    attached: inputs.attached,
  };
}

/**
 * Assemble the shared report shape from live sources. Pure: every number arrives as
 * an argument, so a test can assert the shape without a renderer or a browser.
 * @internal
 */
export function buildFrameReport(inputs: FrameReportInputs): PerfReport {
  const frame = inputs.frame;
  const scaled = frame === null
    ? { fps: 0, avgMs: 0, p95Ms: 0, maxMs: 0, samples: 0, longFrames: 0 }
    : {
        fps: roundReport(frame.fps, 1),
        avgMs: roundReport(frame.avgFrameMs),
        p95Ms: roundReport(frame.p95FrameMs),
        maxMs: roundReport(frame.maxFrameMs),
        samples: frame.samples,
        longFrames: frame.longFrames,
      };
  const seconds = scaled.fps > 0 ? roundReport(scaled.samples / scaled.fps, 1) : 0;
  return {
    game: inputs.game,
    gpu: inputs.gpu,
    quality: inputs.quality,
    viewport: inputs.viewport,
    seconds,
    at: inputs.at,
    frame: scaled,
    render: {
      draws: inputs.render?.drawCalls ?? null,
      triangles: inputs.render?.triangles ?? null,
      geometries: inputs.render?.geometries ?? null,
      textures: inputs.render?.textures ?? null,
      nodes: inputs.scene.nodes,
      nodesSource: inputs.scene.nodes === null ? "unavailable" : "scene-graph",
      scenes: inputs.scene.scenes,
    },
    gl: glReport(inputs.gl),
    sim: frame === null ? null : { avgMs: roundReport(frame.avgSimMs), outsideMs: roundReport(frame.avgOutsideMs) },
    profile: null,
    systems: inputs.systems,
    logs: inputs.logs,
    telemetry: {
      source: "in-page",
      warmedUp: inputs.warmedUp,
      ageMs: Math.round(inputs.ageMs),
      buildMs: roundReport(inputs.buildMs),
      heapBytes: inputs.heapBytes,
    },
  };
}

/** What the shell hands the sampler: live getters, called only when a report is built. */
export interface FrameTelemetrySources {
  game: string;
  quality: () => PerfQuality;
  viewport: () => string;
  gpu: () => string;
  render: () => RenderSample | null;
  scene: () => unknown;
  gl: () => { totals: GlCounterTotals; attached: boolean };
  residentPrograms: () => number | null;
  heapBytes?: () => number | null;
  endpoint?: string;
  push?: boolean;
}

/** The installed sampler: ask it for a report, reset its window, or tear it down. */
export interface FrameTelemetry {
  report(): PerfReport;
  resetWindow(): void;
  dispose(): void;
}

function browserNow(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf !== undefined ? perf.now() : Date.now();
}

/**
 * `Harbor Heat` -> `harbor-heat`, unless the dev runner's `?game=` says otherwise. The
 * report is keyed by this, so it matches `bun run perf` and the budget file.
 * @internal
 */
export function reportGameId(displayName: string): string {
  const fromRunner = readUrlParam("game");
  if (fromRunner !== null && fromRunner.length > 0) return fromRunner;
  return displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Ask the dev server whether its report route exists. This is the sampler's only
 * production guard and it is behaviour, not a build flag: the route is mounted by the
 * dev Vite configs only, so a shipped game answers this one request and installs
 * nothing — no timers, no GL wrapping, no `window.__JG`. The website dev server serves
 * the /play runner as a production build, which is why a build-time `PROD` check would
 * wrongly disable the report there.
 * @internal
 */
export async function probeReportRoute(
  endpoint = REPORT_ENDPOINT_PATH,
  game = "",
  fetchImpl: typeof fetch | null = typeof fetch === "function" ? fetch : null,
  timeoutMs = 1_500,
): Promise<boolean> {
  if (fetchImpl === null) return false;
  try {
    const response = await fetchImpl(`${endpoint}?game=${encodeURIComponent(game)}`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("application/json")) return false;
    const body = (await response.json()) as { error?: unknown; frame?: unknown };
    return typeof body?.error === "string" || body?.frame !== undefined;
  } catch {
    return false;
  }
}

function heapUsedBytes(): number | null {
  const memory = (globalThis as { performance?: { memory?: { usedJSHeapSize?: number } } }).performance?.memory;
  return typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null;
}

function subtract(totals: GlCounterTotals, baseline: GlCounterTotals | null): GlCounterTotals {
  const since = emptyGlTotals();
  for (const key of Object.keys(since) as (keyof GlCounterTotals)[]) {
    since[key] = Math.max(0, totals[key] - (baseline?.[key] ?? 0));
  }
  return since;
}

let installed: FrameTelemetry | null = null;

/**
 * Reset the sampler's warmup baseline, so a fresh measurement starts from zero.
 * @internal
 */
export function resetFrameTelemetry(): void {
  installed?.resetWindow();
}

/**
 * Install the sampler for the page: publishes `window.__JG.report()` and pushes the
 * same record to the dev server's report route every second. Returns `null` when
 * `?telemetry=off` asks for the comparison run; callers gate installation on
 * {@link probeReportRoute}, so a shipped game never starts the sampler.
 * @internal
 */
export function installFrameTelemetry(sources: FrameTelemetrySources): FrameTelemetry | null {
  if ((readUrlParam(TELEMETRY_FLAG) ?? "").toLowerCase() === "off") return null;
  if (typeof window === "undefined") return null;

  const startedAt = browserNow();
  let baseline: GlCounterTotals | null = null;
  let disposed = false;
  let pushFailures = 0;
  let scheduled: number | null = null;
  const gameId = reportGameId(sources.game);
  const endpoint = sources.endpoint ?? REPORT_ENDPOINT_PATH;
  const shouldPush = sources.push !== false && typeof fetch === "function";

  const markWarmup = (): boolean => {
    const ageMs = browserNow() - startedAt;
    if (baseline === null && ageMs >= TELEMETRY_WARMUP_MS) baseline = { ...sources.gl().totals };
    return baseline !== null;
  };

  const buildReport = (): PerfReport => {
    const started = browserNow();
    const warmedUp = markWarmup();
    const gl = sources.gl();
    const report = buildFrameReport({
      game: gameId,
      gpu: sources.gpu(),
      quality: sources.quality(),
      viewport: sources.viewport(),
      at: Date.now(),
      frame: devtools.frame.stats(),
      render: sources.render(),
      scene: countSceneNodes(sources.scene()),
      gl: {
        totals: gl.totals,
        since: subtract(gl.totals, baseline),
        residentPrograms: sources.residentPrograms(),
        attached: gl.attached,
      },
      systems: devtools.probes.systems(),
      logs: toReportLogs(devtools.logs.snapshot()),
      heapBytes: sources.heapBytes?.() ?? heapUsedBytes(),
      ageMs: browserNow() - startedAt,
      warmedUp,
      buildMs: browserNow() - started,
    });
    return report;
  };

  const telemetry: FrameTelemetry = {
    report: buildReport,
    resetWindow() {
      baseline = null;
      devtools.frame.reset();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      if (scheduled !== null) cancelIdle(scheduled);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      document.removeEventListener("webglcontextlost", onContextLost, true);
      const host = window as { __JG?: { report?: () => PerfReport } };
      if (host.__JG?.report === buildReport) delete host.__JG;
      if (installed === telemetry) installed = null;
    },
  };

  const pushOnce = async (): Promise<void> => {
    if (disposed) return;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId, report: buildReport() }),
      });
      if (!response.ok) throw new Error(`report route answered ${response.status}`);
      pushFailures = 0;
    } catch {
      pushFailures += 1;
      if (pushFailures === 3) {
        // A missing route (production build, or a host without the dev plugin) is not worth retrying forever.
        clearInterval(timer);
      }
    }
  };

  // Reports ride an idle callback so a build and its POST never land in a busy frame.
  const run = (): void => {
    scheduled = null;
    void pushOnce();
  };
  const schedulePush = (): void => {
    if (scheduled !== null || disposed) return;
    scheduled = scheduleIdle(run);
  };

  const timer = setInterval(schedulePush, REPORT_PUSH_MS);

  const logError = (system: string, message: string): void => {
    devtools.logs.write("error", system, message);
    // An error is the one line that must not wait for the next tick: a crash can tear
    // the presentation down (or trigger a reload) before an idle callback ever runs.
    if (shouldPush) void pushOnce();
  };

  const onError = (event: ErrorEvent) => {
    logError("runtime", `${event.message} (${event.filename ?? "?"}:${event.lineno ?? 0})`);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
    logError("runtime", `unhandled rejection: ${message}`);
  };
  const onContextLost = (event: Event) => {
    const target = event.target as { id?: string } | null;
    const where = target?.id !== undefined && target.id.length > 0 ? `#${target.id}` : "canvas";
    logError("render", `webgl context lost on ${where}`);
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  document.addEventListener("webglcontextlost", onContextLost, true);

  (window as { __JG?: { report: () => PerfReport } }).__JG = { report: buildReport };
  installed = telemetry;
  if (!shouldPush) clearInterval(timer);
  return telemetry;
}

type IdleWindow = {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function scheduleIdle(run: () => void): number {
  const idle = window as unknown as IdleWindow;
  if (typeof idle.requestIdleCallback === "function") return idle.requestIdleCallback(run, { timeout: REPORT_PUSH_MS });
  return window.setTimeout(run, 0);
}

function cancelIdle(handle: number): void {
  const idle = window as unknown as IdleWindow;
  if (typeof idle.cancelIdleCallback === "function") idle.cancelIdleCallback(handle);
  else window.clearTimeout(handle);
}
