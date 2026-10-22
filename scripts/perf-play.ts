import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  CdpSession,
  applyCaptureQuality,
  applyDevice,
  ensureDevServer,
  openPageSession,
  parseQualityArg,
  waitCaptureReady,
  withBrowserSession,
  type CaptureQuality,
} from "./browser-lib";
import {
  summarizeFrameWindow,
  type FrameWindow,
  type PerfReport,
  type ProfileEntry as ReportedProfileEntry,
  type ReportLogs,
  type SceneNodeSource,
  type SystemProbeReading,
} from "../packages/core/src/devtools/report";

/**
 * Frame-time harness for one game: boots the checkout's dev runner, plays the
 * game on a real GPU, and prints one JSON record of frame timings, renderer
 * counts, GL allocations made after warmup, and the hottest self-time
 * functions.
 *
 *   bun run perf <game> [--quality draft|full] [--profile] [--seconds n]
 *
 * The JSON goes to stdout alone so it can be piped and diffed; notes and the
 * `--profile` inclusive table go to stderr. `measureGame` is the same sequence
 * without the boot, so the CI budget gate (`scripts/perf-gate.ts`) reuses one
 * dev server and one browser across every game.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const WARMUP_MS = 5_000;
const DEFAULT_SECONDS = 6;
const PROFILE_SAMPLING_US = 200;
const TOP_SELF = 15;
const TOP_INCLUSIVE = 25;

export interface PerfArgs {
  game: string;
  quality: CaptureQuality;
  profile: boolean;
  seconds: number;
  /** In-page sampler on/off for the A/B frame-time overhead comparison. */
  telemetry: "on" | "off";
}

export type ArgResult = { kind: "run"; args: PerfArgs } | { kind: "help" };

const USAGE = `usage: bun run perf <game> [--quality draft|full] [--profile] [--seconds n] [--telemetry on|off]

  <game>            game id under Games/ (for example harbor-heat)
  --quality         graphics tier: full (default) or draft (?quality=low, half viewport)
  --profile         also print the inclusive-time table to stderr
  --seconds         measured window in seconds (default ${DEFAULT_SECONDS})
  --telemetry       in-page report sampler: on (default) or off (?telemetry=off) for an A/B run`;

export function parsePerfArgs(argv: readonly string[]): ArgResult {
  if (argv.includes("--help") || argv.includes("-h")) return { kind: "help" };
  let game: string | undefined;
  let quality: CaptureQuality = "full";
  let profile = false;
  let seconds = DEFAULT_SECONDS;
  let telemetry: "on" | "off" = "on";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--profile") {
      profile = true;
      continue;
    }
    if (arg === "--quality" || arg === "--seconds" || arg === "--telemetry") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      index += 1;
      if (arg === "--quality") quality = parseQualityArg(value);
      else if (arg === "--telemetry") {
        if (value !== "on" && value !== "off") throw new Error(`--telemetry must be on or off (got ${value})`);
        telemetry = value;
      } else {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--seconds must be a positive number (got ${value})`);
        seconds = parsed;
      }
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`unknown flag ${arg}`);
    if (game !== undefined) throw new Error(`one game per run (got ${game} and ${arg})`);
    game = arg;
  }
  if (game === undefined) throw new Error("a game id is required");
  return { kind: "run", args: { game, quality, profile, seconds, telemetry } };
}

/** One sampled stack frame reduced to a readable key and its self time. */
export type ProfileEntry = ReportedProfileEntry;


interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
  children?: number[];
}

/**
 * Reduce a CDP CPU profile to self-time per function. Dev-runner URLs identify
 * the real source file, so names stay readable instead of minified.
 */
export function aggregateSelfTime(
  profile: { nodes: readonly ProfileNode[]; samples: readonly number[]; timeDeltas: readonly number[] },
  windowMs: number,
  top = TOP_SELF,
): ProfileEntry[] {
  const byId = new Map<number, ProfileNode>(profile.nodes.map((node) => [node.id, node]));
  const self = new Map<string, number>();
  profile.samples.forEach((id, index) => {
    const key = frameKey(byId.get(id));
    if (key === null) return;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0));
  });
  return rank(self, windowMs, top);
}

/** Inclusive (self + callees) time per function, used by `--profile`. */
export function aggregateInclusiveTime(
  profile: { nodes: readonly ProfileNode[]; samples: readonly number[]; timeDeltas: readonly number[] },
  windowMs: number,
  top = TOP_INCLUSIVE,
): ProfileEntry[] {
  const byId = new Map<number, ProfileNode>(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const inclusive = new Map<string, number>();
  profile.samples.forEach((id, index) => {
    const us = profile.timeDeltas[index] ?? 0;
    const seen = new Set<string>();
    let current: number | undefined = id;
    while (current !== undefined) {
      const key = frameKey(byId.get(current));
      if (key !== null && !seen.has(key)) {
        seen.add(key);
        inclusive.set(key, (inclusive.get(key) ?? 0) + us);
      }
      current = parent.get(current);
    }
  });
  return rank(inclusive, windowMs, top);
}

function frameKey(node: ProfileNode | undefined): string | null {
  if (node === undefined) return null;
  const name = node.callFrame.functionName.length > 0 ? node.callFrame.functionName : "(anonymous)";
  const file = node.callFrame.url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "");
  if (file.length === 0) return name;
  const parts = file.split("/").filter((part) => part.length > 0);
  const tail = parts.slice(-3).join("/");
  return `${name}\t${tail}:${node.callFrame.lineNumber + 1}:${node.callFrame.columnNumber + 1}`;
}

function rank(totals: ReadonlyMap<string, number>, windowMs: number, top: number): ProfileEntry[] {
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([key, us]) => {
      const [fn = "(anonymous)", at = ""] = key.split("\t");
      return {
        fn,
        at,
        selfMs: Math.round((us / 1000) * 10) / 10,
        selfPct: windowMs > 0 ? Math.round((us / (windowMs * 1000)) * 1000) / 10 : 0,
      };
    });
}

export type { FrameWindow } from "../packages/core/src/devtools/report";

/** Frame timings from requestAnimationFrame deltas, the interval a player sees. */
export function summarizeFrameDeltas(deltas: readonly number[]): FrameWindow {
  return summarizeFrameWindow(deltas);
}

/**
 * Counts GL objects created after warmup, so a leak shows up as non-zero
 * programs/framebuffers/allocations on a steady-state frame loop.
 */
const GL_COUNTERS_SCRIPT = `(() => {
  if (globalThis.__jgPerfGl !== undefined) return;
  const since = { programsLinked: 0, framebuffers: 0, buffers: 0, textures: 0, vertexArrays: 0 };
  const counts = { programsLinked: 0, framebuffers: 0, buffers: 0, textures: 0, vertexArrays: 0 };
  const wrap = (proto, method, key) => {
    const original = proto[method];
    if (typeof original !== "function") return;
    proto[method] = function (...args) {
      counts[key] += 1;
      since[key] += 1;
      return original.apply(this, args);
    };
  };
  for (const name of ["WebGLRenderingContext", "WebGL2RenderingContext"]) {
    const proto = globalThis[name]?.prototype;
    if (proto === undefined) continue;
    wrap(proto, "linkProgram", "programsLinked");
    wrap(proto, "createFramebuffer", "framebuffers");
    wrap(proto, "createBuffer", "buffers");
    wrap(proto, "createTexture", "textures");
    wrap(proto, "createVertexArray", "vertexArrays");
  }
  globalThis.__jgPerfGl = {
    counts,
    since,
    reset() {
      for (const key of Object.keys(since)) since[key] = 0;
    },
  };
})();`;

const SAMPLE_FRAMES_SCRIPT = (windowMs: number): string => `new Promise((resolve) => {
  const deltas = [];
  let last = performance.now();
  const startedAt = last;
  const tick = (now) => {
    deltas.push(now - last);
    last = now;
    if (now - startedAt >= ${windowMs}) resolve(deltas);
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})`;

interface GlCounts {
  counts: Record<string, number>;
  since: Record<string, number>;
}

interface SceneNodeCount {
  nodes: number | null;
  source: SceneNodeSource;
  scenes: number;
}

function remoteObjectId(result: Record<string, unknown>): string | undefined {
  return (result.result as { objectId?: string } | undefined)?.objectId;
}

/**
 * Count live three.js scene-graph nodes. The dev runner's three module is
 * already loaded, so importing its served URL yields the same constructor the
 * game uses; queryObjects then hands back every live instance.
 */
async function measureSceneNodes(session: CdpSession): Promise<SceneNodeCount> {
  try {
    await session.send("Runtime.enable");
    const namespace = await session.send("Runtime.evaluate", {
      expression: `(async () => {
        const urls = performance.getEntriesByType("resource").map((entry) => entry.name);
        const url = urls.find((name) => /\\/deps\\/three(\\.module)?\\.js(\\?|$)/.test(name))
          ?? urls.find((name) => /node_modules\\/three\\//.test(name));
        if (url === undefined) return null;
        return await import(url);
      })()`,
      awaitPromise: true,
    });
    const namespaceId = remoteObjectId(namespace);
    if (namespaceId === undefined) return { nodes: null, source: "unavailable", scenes: 0 };

    const counted = await countInstances(session, namespaceId, "Scene", "isScene");
    if (counted.scenes > 0) return { nodes: counted.nodes, source: "scene-graph", scenes: counted.scenes };

    const fallback = await countInstances(session, namespaceId, "Object3D", "isObject3D");
    if (fallback.nodes > 0) return { nodes: fallback.nodes, source: "heap-object3d", scenes: counted.scenes };
    return { nodes: null, source: "unavailable", scenes: counted.scenes };
  } catch {
    return { nodes: null, source: "unavailable", scenes: 0 };
  }
}

async function countInstances(
  session: CdpSession,
  namespaceId: string,
  className: string,
  brand: string,
): Promise<{ nodes: number; scenes: number }> {
  const prototype = await session.send("Runtime.callFunctionOn", {
    objectId: namespaceId,
    functionDeclaration: `function () { return this.${className} === undefined ? null : this.${className}.prototype }`,
  });
  const prototypeId = remoteObjectId(prototype);
  if (prototypeId === undefined) return { nodes: 0, scenes: 0 };

  const found = await session.send("Runtime.queryObjects", { prototypeObjectId: prototypeId });
  const arrayId = ((found.objects ?? {}) as { objectId?: string }).objectId;
  if (arrayId === undefined) return { nodes: 0, scenes: 0 };

  const counted = await session.send("Runtime.callFunctionOn", {
    objectId: arrayId,
    functionDeclaration: `function () {
      let scenes = 0, nodes = 0;
      for (const value of this) {
        if (value === null || typeof value !== "object" || value.${brand} !== true) continue;
        scenes += 1;
        if (typeof value.traverse === "function") value.traverse(() => { nodes += 1 });
        else nodes += 1;
      }
      return { scenes, nodes };
    }`,
    returnByValue: true,
  });
  const value = (counted.result as { value?: { scenes?: number; nodes?: number } } | undefined)?.value;
  return { nodes: value?.nodes ?? 0, scenes: value?.scenes ?? 0 };
}

/** Everything one measured window says about a game, as printed by `bun run perf`. */
export type PerfRecord = PerfReport;
export type { PerfReport };

interface RawProfile {
  nodes: ProfileNode[];
  samples: number[];
  timeDeltas: number[];
}

export interface MeasureOptions {
  /** Page target to measure; the caller owns opening and closing it. */
  session: CdpSession;
  /** Dev-server base URL, e.g. `http://127.0.0.1:4601`. */
  base: string;
  game: string;
  quality?: CaptureQuality;
  seconds?: number;
  warmupMs?: number;
  /** Run the CPU profiler pass afterwards; the budget gate does not need it. */
  profile?: boolean;
  /** In-page report sampler: `off` loads the same build with `?telemetry=off` for an A/B run. */
  telemetry?: "on" | "off";
}

export interface PerfMeasure {
  record: PerfRecord;
  /** Raw profile for the inclusive table (`--profile`); null when profiling was skipped. */
  profile: RawProfile | null;
  /** Wall-clock length of the profile window in ms, for percentages. */
  profileMs: number;
}

function readGpu(session: CdpSession): Promise<string | undefined> {
  return session.evaluate<string>(`(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (gl === null) return "no webgl2";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = info === null ? "" : String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL));
    const renderer = info === null ? String(gl.getParameter(gl.RENDERER)) : String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    return vendor.length > 0 ? vendor + " " + renderer : renderer;
  })()`);
}

function printInclusive(entries: readonly ProfileEntry[]): void {
  console.error("perf: inclusive time (self + callees)");
  for (const entry of entries) {
    console.error(`${entry.selfMs.toFixed(1).padStart(8)} ms  ${entry.selfPct.toFixed(1).padStart(5)}%  ${entry.fn}  ${entry.at}`);
  }
}

/**
 * Play one game and measure it: warm up, sample frame deltas, snapshot renderer
 * and scene counts, and read the GL objects created after warmup.
 */
export async function measureGame(options: MeasureOptions): Promise<PerfMeasure> {
  const { session, base, game, quality = "full", seconds = DEFAULT_SECONDS, warmupMs = WARMUP_MS } = options;
  const profileRun = options.profile ?? true;

  await session.send("Page.enable");
  await session.send("Page.addScriptToEvaluateOnNewDocument", { source: GL_COUNTERS_SCRIPT });
  await applyDevice(session, "desktop", quality === "draft" ? "half" : "full");
  const url = new URL(base);
  url.searchParams.set("game", game);
  url.searchParams.set("mode", "play");
  url.searchParams.set("device", "desktop");
  url.searchParams.set("capture", "1");
  if (options.telemetry === "off") url.searchParams.set("telemetry", "off");
  applyCaptureQuality(url, quality);
  await session.send("Page.navigate", { url: url.toString() });
  await waitCaptureReady(session, 90_000);
  await session.evaluate(`window.__jgengineAgent?.handle?.({ method: "debug_perf_reset" })`);

  const gpu = (await readGpu(session)) ?? "unknown";
  if (/swiftshader|llvmpipe|software/i.test(gpu)) {
    console.error(`perf: software rasterizer (${gpu}) — frame times are not a GPU measurement`);
  }

  await session.evaluate(`new Promise((r) => setTimeout(r, ${warmupMs}))`, { awaitPromise: true });
  await session.evaluate(`window.__jgPerfGl?.reset?.()`);
  await session.evaluate(`window.__jgengineAgent?.handle?.({ method: "debug_perf_reset" })`);

  // Frame timings are sampled without the profiler running, so the fps and
  // percentiles are the loop the player gets; the profile window is separate.
  const startedAt = Date.now();
  const deltas = (await session.evaluate<number[]>(SAMPLE_FRAMES_SCRIPT(seconds * 1000), { awaitPromise: true })) ?? [];
  const windowMs = Date.now() - startedAt;

  const snapshot = await session.evaluate<{
    frame: { avgSimMs?: number; avgOutsideMs?: number; phases?: unknown[] } | null;
    render: { drawCalls: number; triangles: number; geometries: number; textures: number } | null;
    probes?: Record<string, unknown>;
    systems?: Record<string, SystemProbeReading>;
    logSummary?: ReportLogs;
    longFrames?: unknown[];
  }>(`window.__jgengineAgent?.handle?.({ method: "debug_snapshot" })?.snapshot ?? null`);
  const gl = (await session.evaluate<GlCounts | null>(`globalThis.__jgPerfGl ?? null`)) ?? { counts: {}, since: {} };
  const sceneNodes = await measureSceneNodes(session);
  const size = await session.evaluate<{ w: number; h: number }>(`({ w: innerWidth, h: innerHeight })`);

  const frame = summarizeFrameDeltas(deltas);
  const since = gl.since;
  const allocations =
    (since.buffers ?? 0) +
    (since.textures ?? 0) +
    (since.vertexArrays ?? 0) +
    (since.programsLinked ?? 0) +
    (since.framebuffers ?? 0);
  const residentPrograms = snapshot?.probes?.shaderPrograms;

  let raw: RawProfile | null = null;
  let profiledMs = 0;
  if (profileRun) {
    await session.send("Profiler.enable");
    await session.send("Profiler.setSamplingInterval", { interval: PROFILE_SAMPLING_US });
    await session.send("Profiler.start");
    const profiledAt = Date.now();
    await session.evaluate(`new Promise((r) => setTimeout(r, ${seconds * 1000}))`, { awaitPromise: true });
    profiledMs = Date.now() - profiledAt;
    const stopped = await session.send("Profiler.stop");
    raw = (stopped.profile ?? { nodes: [], samples: [], timeDeltas: [] }) as RawProfile;
  }

  const top = raw === null ? [] : aggregateSelfTime(raw, profiledMs);

  const record: PerfRecord = {
    game,
    gpu,
    quality,
    viewport: `${size?.w ?? 0}x${size?.h ?? 0}`,
    seconds: Math.round((windowMs / 1000) * 10) / 10,
    at: Date.now(),
    frame,
    render: {
      draws: snapshot?.render?.drawCalls ?? null,
      triangles: snapshot?.render?.triangles ?? null,
      geometries: snapshot?.render?.geometries ?? null,
      textures: snapshot?.render?.textures ?? null,
      nodes: sceneNodes.nodes,
      nodesSource: sceneNodes.source,
      scenes: sceneNodes.scenes,
    },
    gl: {
      programsLinked: since.programsLinked ?? 0,
      framebuffers: since.framebuffers ?? 0,
      buffers: since.buffers ?? 0,
      textures: since.textures ?? 0,
      vertexArrays: since.vertexArrays ?? 0,
      allocations,
      residentPrograms: typeof residentPrograms === "number" ? residentPrograms : null,
      total: gl.counts,
      attached: (gl.counts.buffers ?? 0) + (gl.counts.textures ?? 0) > 0,
    },
    sim:
      snapshot?.frame === null || snapshot?.frame === undefined
        ? null
        : {
            avgMs: Math.round((snapshot.frame.avgSimMs ?? 0) * 100) / 100,
            outsideMs: Math.round((snapshot.frame.avgOutsideMs ?? 0) * 100) / 100,
          },
    profile: raw === null ? null : { samplingUs: PROFILE_SAMPLING_US, seconds: Math.round((profiledMs / 1000) * 10) / 10, top },
    systems: snapshot?.systems ?? {},
    logs: snapshot?.logSummary ?? null,
    telemetry: null,
  };

  return { record, profile: raw, profileMs: profiledMs };
}

async function main(): Promise<void> {
  const parsed = parsePerfArgs(process.argv.slice(2));
  if (parsed.kind === "help") {
    console.log(USAGE);
    return;
  }
  const { game, quality, profile, seconds, telemetry } = parsed.args;

  if (!existsSync(join(repoRoot, "Games", game, "src", "index.tsx"))) {
    throw new Error(`no game "${game}" in Games/ — run \`bun run games:clone\` first, then retry`);
  }

  const server = await ensureDevServer(repoRoot);
  const exitCode = await withBrowserSession(
    { keep: false, timeoutMs: 120_000, server: server.child, serverPid: server.pid },
    async ({ debugPort }) => {
      const session = await openPageSession(debugPort);
      try {
        const measured = await measureGame({ session, base: server.base, game, quality, seconds, telemetry });
        console.log(JSON.stringify(measured.record, null, 2));
        if (profile && measured.profile !== null) {
          printInclusive(aggregateInclusiveTime(measured.profile, measured.profileMs));
        }
        if (measured.record.profile?.top.length === 0) console.error("perf: the CPU profile produced no samples");
        if (measured.record.gl.attached !== true) {
          console.error("perf: GL allocation counters saw no activity — the WebGL hooks did not attach");
        }
        if (measured.record.render.nodes === null) console.error("perf: could not count scene nodes on this page");
      } finally {
        await session.close();
      }
    },
  );
  if (exitCode !== 0) process.exit(exitCode);
}

if (import.meta.main) {
  await main();
}
