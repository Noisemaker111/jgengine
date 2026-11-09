import { spawn, spawnSync } from "node:child_process";
import { closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CdpSession, PRECISE_HEAP_ARG, removeProfileDir } from "./browser-lib";
import { restoreNormalPriority } from "./machine-priority";
import { withPerfLock } from "./perf-lock";
import { createBrowserFlow } from "./browserFlow";
import { FRAME_GAMES } from "./ci-scope";
import { flowsDirOf, loadFlow } from "./driveFlows";
import { pageFlowDriver, readProbe } from "./drivePage";
import { localGetJson } from "./localhostHttp";
import { readBreakdown, readHitchSession, renderHitchSession, resetBreakdown, startPath } from "./perf-breakdown";
import { describeFirstPaints, endTrace, markTraceAnchor, readTraceEvents, renderTracedHitches, startTrace, traceHitches } from "./perf-trace";
import { createFlowStepper, describeFlowReport, runFlowReport } from "../packages/core/src/play/flowSteps";
import { GATE_SIZE } from "./perf-gate";
import { BACKEND_READING_SCRIPT, gpuErrorLine, gpuErrors, parseSettingSpec, perfSettingsScript, SAMPLE_FRAMES_SCRIPT, summarizeFrameDeltas, type RawProfile } from "./perf-play";
import { renderBreakdownText, type FrameBreakdownSummary } from "../packages/core/src/devtools/frameBreakdown";
import type { FrameWindow } from "../packages/core/src/devtools/report";
import type { ShadowCacheStats } from "../packages/core/src/lighting/shadowCache.draw";
import { readPrivateDesktopMap } from "../packages/jgengine/src/desktopMaps";
import { parseRendererBackend, type RendererBackend } from "../packages/core/src/settings/rendererBackend";
import { foldDesktopCpuLayers, sampleDesktopCpuLayers, type DesktopCpuProfile } from "./perf-desktop-cpu";
import { RENDER_COUNTER_SCRIPT, readRenderCounts, renderRenderCounts, resetRenderCounter, type RunRenderCounts } from "./perf-renders";
import type { ProfileLayer } from "./perf-fps-gap";

interface Target { type?: string; url?: string; webSocketDebuggerUrl?: string }

/** Bound one debugger read; the caller closes its session on timeout. @internal */
export async function desktopDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`desktop report timed out after ${ms}ms`)), ms); })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

/** A local port nothing listens on now, from the OS. @internal */
export function freePort(): number {
  const server = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = server.port;
  server.stop(true);
  return port;
}

/** Whether a debugger already answers on `port`. @internal */
export async function portAnswers(port: number): Promise<boolean> {
  try {
    await localGetJson<unknown>(`http://127.0.0.1:${port}/json/version`, 1_000);
    return true;
  } catch {
    return false;
  }
}

/** Select only an explicitly diagnostic local desktop page. @internal */
export function diagnosticDesktopTarget(targets: readonly Target[]): Target {
  const matching = targets.filter((target) => {
    if (target.type !== "page" || target.webSocketDebuggerUrl === undefined || target.url === undefined) return false;
    try { const url = new URL(target.url); return url.hostname === "tauri.localhost" && url.searchParams.get("telemetry") === "local"; } catch { return false; }
  });
  if (matching.length !== 1 || matching[0] === undefined) throw new Error(`expected one diagnostic desktop page, found ${matching.length}`);
  return matching[0];
}

export interface LaunchArgs {
  exe: string;
  /** Launch with the app's `--uncapped` flag; without it the app keeps the display's vsync. */
  uncapped: boolean;
  seconds: number;
  /** The debugger port `--port` asked for; null picks a free one per launch. */
  port: number | null;
  out: string | null;
  /** The private source maps the build wrote: `<app folder>.private-maps` unless `--maps` names them. */
  maps: string;
  /** The page size; the frame gate's 1600x900 unless `--size WxH` asks for another (a recording's own size). */
  size: { width: number; height: number };
  /** `--flow <game>/<name>`: play that game's flow instead of the walk and report every hitch in it. */
  flow: { game: string; name: string } | null;
  /** The GPU backends to measure, one launch each (`--renderer webgl|webgpu|both`, default webgl). */
  renderers: RendererBackend[];
  /** `--trace`: with `--flow`, record a Chrome trace of every process and name what held each hitch. */
  trace: boolean;
  /** `--returning`: play the flow once first and measure a second session that has its shader caches. */
  returning: boolean;
  /** `--cpu`: sample the page's CPU over a second window and report main-thread share by layer. */
  cpu: boolean;
  /** `--renders`: count React commits and component renders over the measured window or flow. */
  renders: boolean;
}

/** Parse `--launch <exe> [--uncapped] [--renderer webgl|webgpu|both] [--seconds n] [--port n] [--size WxH] [--out file] [--maps dir] [--flow game/name] [--cpu] [--renders]`. @internal */
export function parseLaunchArgs(argv: readonly string[]): LaunchArgs {
  let exe: string | undefined;
  let uncapped = false;
  let seconds = 8;
  let port: number | null = null;
  let out: string | null = null;
  let maps: string | null = null;
  let size: { width: number; height: number } = { width: GATE_SIZE.width, height: GATE_SIZE.height };
  let flow: { game: string; name: string } | null = null;
  let renderers: RendererBackend[] = ["webgl"];
  let returning = false;
  let trace = false;
  let cpu = false;
  let renders = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--uncapped") { uncapped = true; continue; }
    if (arg === "--returning") { returning = true; continue; }
    if (arg === "--trace") { trace = true; continue; }
    if (arg === "--cpu") { cpu = true; continue; }
    if (arg === "--renders") { renders = true; continue; }
    if (arg !== "--launch" && arg !== "--seconds" && arg !== "--port" && arg !== "--size" && arg !== "--out" && arg !== "--maps" && arg !== "--flow" && arg !== "--renderer") throw new Error(`unknown argument ${arg}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
    index += 1;
    if (arg === "--launch") exe = resolve(value);
    else if (arg === "--out") out = resolve(value);
    else if (arg === "--maps") maps = resolve(value);
    else if (arg === "--flow") {
      const match = /^([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(value);
      if (match === null) throw new Error(`--flow takes <game>/<flow> (got ${value})`);
      flow = { game: match[1] ?? "", name: match[2] ?? "" };
    }
    else if (arg === "--renderer") {
      const backend = parseRendererBackend(value);
      if (value !== "both" && backend === null) throw new Error(`--renderer must be webgl, webgpu or both (got ${value})`);
      renderers = backend === null ? ["webgl", "webgpu"] : [backend];
    }
    else if (arg === "--size") {
      const match = /^(\d+)x(\d+)$/.exec(value);
      if (match === null) throw new Error(`--size must be WIDTHxHEIGHT (got ${value})`);
      size = { width: Number(match[1]), height: Number(match[2]) };
    } else {
      const parsed = Number(value);
      if (arg === "--seconds") {
        if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--seconds must be a positive number (got ${value})`);
        seconds = parsed;
      } else {
        if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) throw new Error(`--port must be a local port from 1024 to 65535 (got ${value})`);
        port = parsed;
      }
    }
  }
  if (exe === undefined) throw new Error("--launch needs the desktop app's .exe");
  // `jgengine desktop --out <dir>` writes the app into <dir> and its private maps to <dir>.private-maps.
  if (returning && flow === null) throw new Error("--returning plays a --flow twice; name one");
  return { exe, uncapped, seconds, port, out, maps: maps ?? `${dirname(exe)}.private-maps`, size, flow, renderers, returning, trace, cpu, renders };
}

/**
 * Run the game's `capture.play` through the agent bridge once its context is live, and return what
 * ran. A game with no `capture.play` starts in its scene already; any other refusal fails the run,
 * since its numbers would describe a menu.
 */
async function startCaptureScene(session: CdpSession): Promise<string> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const reply = await session.evaluate<{ ok: boolean; error?: string; ran?: { name: string; status: string; reason?: string }[] } | null>(
      `window.__jgengineAgent?.handle?.({ method: "capture_run", skipUnregistered: true }) ?? null`,
    ).catch(() => null);
    if (reply?.ok === true) {
      const rejected = (reply.ran ?? []).filter((entry) => entry.status === "rejected");
      if (rejected.length > 0) throw new Error(`the game refused its capture.play: ${rejected.map((entry) => `${entry.name} (${entry.reason ?? "rejected"})`).join(", ")}`);
      return `capture.play: ${(reply.ran ?? []).map((entry) => (entry.status === "unregistered" ? `${entry.name} (not in this build, skipped)` : entry.name)).join(", ")}`;
    }
    if (reply?.error === "the game declares no capture.play") return "no capture.play; the game starts in its scene";
    if (reply != null && reply.error !== "no game context yet") throw new Error(`capture_run failed: ${reply.error ?? "unknown"}`);
    await Bun.sleep(500);
  }
  throw new Error("the game context never came up for capture_run within 60 s");
}

/**
 * The running build's manifest and a reader that maps one of its scripts through the private source
 * maps `jgengine desktop --diagnostics` wrote beside the app, so frame callbacks name their source file.
 */
async function privateMapReader(session: CdpSession, mapsDir: string): Promise<{ build: unknown; privateMap: (scriptId: string) => Promise<string> }> {
  const build = await session.evaluate<unknown>(`fetch('./jgengine-build.json').then(r => r.ok ? r.json() : ({ error: 'build manifest HTTP ' + r.status })).catch(e => ({ error: String(e) }))`, { awaitPromise: true });
  const digest = typeof build === "object" && build !== null ? Reflect.get(build, "privateMapsSha256") : undefined;
  if (typeof digest !== "string") throw new Error("desktop build has no private map identity");
  return {
    build,
    privateMap: async (scriptId) => {
      const result = await session.send("Debugger.getScriptSource", { scriptId });
      const source = result["scriptSource"];
      if (typeof source !== "string") throw new Error("running script source unavailable");
      const map = readPrivateDesktopMap(mapsDir, digest, source);
      if (map === null) throw new Error("no private map matches the running script");
      return map;
    },
  };
}

/** Where one backend's record is written: `--out` itself, or beside it as `<name>.webgpu.json` when both run. @internal */
export function desktopOutFor(args: Pick<LaunchArgs, "out" | "renderers">, backend: RendererBackend): string {
  const out = args.out ?? "";
  if (backend === "webgl" || args.renderers.length === 1) return out;
  return out.endsWith(".json") ? `${out.slice(0, -5)}.${backend}.json` : `${out}.${backend}.json`;
}

/** The page a launched app is pointed at: its diagnostic telemetry, at the frame gate's tier. */
const LAUNCH_URL = "index.html?telemetry=local&frameMembers=1&quality=high";

/** What one launched run measured; `rafP50Ms`/`rafP99Ms` are the requestAnimationFrame intervals. */
export interface DesktopRecord {
  at: number;
  exe: string;
  clock: "uncapped" | "vsync";
  tier: string;
  viewport: string;
  start: string;
  frame: FrameWindow;
  rafP50Ms: number;
  rafP99Ms: number;
  breakdown: FrameBreakdownSummary | null;
  /** The backend the run asked for and the one that drew (WebGPU falls back to WebGL where it is missing). */
  backend: { asked: RendererBackend; drawing: RendererBackend; warnings: string[] };
  /** The shadow cache's counters over the measured window (`window.__jgShadowCache`); null when the page has none. */
  shadowCache: ShadowCacheStats | null;
  /** Main-thread share by layer over the `--cpu` profile window; absent when the run did not profile. */
  cpuLayers?: ProfileLayer[];
  /** Share of the `--cpu` window's samples no private map could name. */
  cpuUnmappedPct?: number;
  /** React commits and component renders over the measured window or flow (`--renders`). */
  renderCounts?: RunRenderCounts;
}

/** How a launched app got into its scene, and the tier it reports. */
interface LaunchedScene { tier: string; start: string }

/**
 * Launch a diagnostic desktop build (`jgengine desktop --diagnostics`), pin the frame gate's
 * conditions (1600x900 unless `size` says otherwise, high tier, automatic quality off), boot into
 * its scene past the shader warmup, run `work`, then close it. WebView2 reads the debugger port from
 * WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS, which adds to the app's own browser arguments, so
 * `--uncapped` still reaches the browser. A `profile` folder gives WebView2 its own user data, so a
 * player's saves in the app's usual profile are never read or touched.
 */
async function withLaunchedScene<T>(args: LaunchArgs, backend: RendererBackend, profile: string | null, work: (session: CdpSession, scene: LaunchedScene) => Promise<T>): Promise<T> {
  if (process.platform !== "win32") throw new Error("--launch measures a Windows (WebView2) desktop build");
  if (!existsSync(args.exe)) throw new Error(`no desktop app at ${args.exe}; build one with: bun run jgengine desktop games/<id> --diagnostics --no-installer`);
  // From launch to close the app is timed; the build before it is not, and never holds the lock.
  return withPerfLock(`perf desktop ${basename(args.exe)} on ${backend}`, () => launchedScene(args, backend, profile, work));
}

async function launchedScene<T>(args: LaunchArgs, backend: RendererBackend, profile: string | null, work: (session: CdpSession, scene: LaunchedScene) => Promise<T>): Promise<T> {
  // A port of its own: on a shared one, a diagnostic app another run left open answered in place of
  // this launch, and the flow played (and failed in) the wrong game.
  const port = args.port ?? freePort();
  if (await portAnswers(port)) throw new Error(`debugger port ${port} already answers (another desktop app is open on it); close it or pass another --port`);
  // Muted: a measurement launch shares the PC with whoever is at it, and plays nothing worth hearing.
  const env = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --mute-audio ${PRECISE_HEAP_ARG}`, ...(profile === null ? {} : { WEBVIEW2_USER_DATA_FOLDER: profile }) };
  const child = spawn(args.exe, args.uncapped ? ["--uncapped"] : [], { env, stdio: "ignore" });
  // The app's frame time is the product: it draws at normal priority while this process stays below (scripts/perf.ts).
  restoreNormalPriority(child.pid);
  try {
    let target: Target | undefined;
    for (let attempt = 0; attempt < 120 && target === undefined; attempt += 1) {
      try { target = diagnosticDesktopTarget(await localGetJson<Target[]>(`http://127.0.0.1:${port}/json/list`, 1_000)); } catch { await Bun.sleep(500); }
    }
    if (target?.webSocketDebuggerUrl === undefined) throw new Error(`the app opened no diagnostic page on port ${port} within 60 s; build it with --diagnostics`);
    const session = await CdpSession.connect(target.webSocketDebuggerUrl, 10_000);
    try {
      await session.send("Page.enable");
      await session.send("Page.addScriptToEvaluateOnNewDocument", { source: perfSettingsScript([parseSettingSpec("graphics.auto=false"), parseSettingSpec(`renderer=${backend}`)]) });
      // Ahead of the page's own scripts, so React picks the counter up as its devtools hook.
      if (args.renders) await session.send("Page.addScriptToEvaluateOnNewDocument", { source: RENDER_COUNTER_SCRIPT });
      await session.send("Emulation.setDeviceMetricsOverride", { width: args.size.width, height: args.size.height, deviceScaleFactor: 1, mobile: false });
      // A navigation from the debugger, not `location.href`: an app still finishing its own first load
      // cancelled the script-set one and kept its menu page.
      await session.send("Page.navigate", { url: new URL(LAUNCH_URL, target.url).toString() });
      let tier: string | null = null;
      // A heavy game on a busy machine has taken just over two minutes to boot; three is the bound.
      for (let attempt = 0; attempt < 360 && tier === null; attempt += 1) {
        await Bun.sleep(500);
        tier = (await session.evaluate<string | null>(`location.search.includes("quality=high") ? (document.documentElement.dataset.jgQuality ?? null) : null`).catch(() => null)) ?? null;
      }
      if (tier === null) {
        const state = await session.evaluate<string>(`location.href + " | readyState " + document.readyState + " | " + (document.body?.innerText ?? "").replace(/\\s+/g, " ").slice(0, 300)`).catch((error: unknown) => String(error));
        throw new Error(`the game never reported a graphics tier after the reload (${state})`);
      }
      // Into the scene the browser harness measures: the dev runner runs the game's `capture.play`
      // (past its menus) itself; a shipped build is asked to through the agent bridge.
      const start = await startCaptureScene(session);
      // The scene's shader warmup covers it ("Preparing scene (90 shaders)") until every program is
      // compiled: Harbor Heat still had 597 to go ten seconds in, and that window drew nothing. Wait
      // out the warmup, then the same settle the browser harness gives. A flow's fresh profile pays a
      // cold compile every launch, and one covered round can overshoot the warmup's own 2-minute
      // plan budget when the GPU is shared: deepward's cover stayed up past five minutes while another
      // timed run held the machine (2026-11). The cover always lifts on the warmup's own deadlines.
      let warming = true;
      for (let attempt = 0; attempt < 900 && warming; attempt += 1) {
        warming = (await session.evaluate<boolean>(`document.querySelector("[data-shell-warmup]") !== null`).catch(() => true)) ?? true;
        if (warming) await Bun.sleep(500);
      }
      if (warming) throw new Error("the scene's shader warmup did not finish within 7.5 minutes");
      await Bun.sleep(10_000);
      return await work(session, { tier, start });
    } finally {
      await session.close();
    }
  } finally {
    if (child.pid !== undefined) spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore", windowsHide: true });
  }
}

/**
 * Why a measured window does not show the scene, or null when it does. A window that drew nothing
 * (a reload, a stall back to a blank page) measures an empty frame: Brightway Park once read 365 fps
 * and Odd Orbit 86 fps with zero draws. A window the "Preparing scene" cover was over measures the
 * cover: Harbor Heat on WebGPU read 5.4 ms at 8 draws a frame against 565 on WebGL (2026-11-08).
 */
export function unmeasuredSceneReason(drawsAvg: number | undefined, covered: boolean): string | null {
  if (covered) return `the scene was still preparing shaders behind its cover while it was measured (${drawsAvg ?? "?"} draws a frame)`;
  if (drawsAvg !== undefined && drawsAvg < 1) return `the scene drew nothing while it was measured (${drawsAvg} draws a frame)`;
  return null;
}

/** Launch a diagnostic desktop build, walk at the frame gate's conditions, and print and return the frame rate it reaches. */
export async function launchAndMeasure(args: LaunchArgs, backend: RendererBackend): Promise<DesktopRecord> {
  return withLaunchedScene(args, backend, null, async (session, { tier, start }) => {
    const release = await startPath(session, "walk");
    await Bun.sleep(2_000);
    if (!(await resetBreakdown(session))) throw new Error("the page has no frame breakdown; build it with --diagnostics");
    await session.evaluate<void>("window.__jgShadowCache?.resetStats()");
    if (args.renders && !(await resetRenderCounter(session))) {
      throw new Error("the page has no render counter; the counter script did not reach it before React loaded");
    }
    const deltas = (await session.evaluate<number[]>(SAMPLE_FRAMES_SCRIPT(args.seconds * 1000), { awaitPromise: true })) ?? [];
    const shadowCache = (await session.evaluate<ShadowCacheStats | null>("window.__jgShadowCache?.stats() ?? null")) ?? null;
    // Frame callbacks name their source through the private maps the build wrote beside the app.
    const { privateMap } = await privateMapReader(session, args.maps);
    const breakdown = await readBreakdown(session, privateMap);
    // A second window, still walking: the CPU profile and the render count cover play, not the readback.
    const cpu: DesktopCpuProfile | null = args.cpu ? await sampleDesktopCpuLayers(session, async (scriptId) => {
      try { return await privateMap(scriptId); } catch { return null; }
    }, args.seconds) : null;
    const renderCounts = args.renders ? await readRenderCounts(session) : null;
    await release();
    const viewport = await session.evaluate<string>(`innerWidth + "x" + innerHeight`);
    // The app presents the way the player saved it unless --uncapped forces it: a vsync run on an
    // app whose saved choice is Uncapped would be labelled vsync and measure uncapped frames.
    const presenting = await session.evaluate<string | null>(`window.__JG_DESKTOP__?.frameRate?.running ?? null`).catch(() => null);
    if (presenting !== null && presenting !== (args.uncapped ? "uncapped" : "vsync")) {
      throw new Error(`asked for a ${args.uncapped ? "uncapped" : "vsync"} run but the app presents ${presenting} (its saved Frame rate setting); set it back in the game's Graphics settings`);
    }
    const drew = (await session.evaluate<{ drawing: RendererBackend; warnings: string[] }>(BACKEND_READING_SCRIPT)) ?? { drawing: "webgl", warnings: [] };
    if (drew.drawing !== backend) console.error(`degraded: asked for the ${backend} backend but ${drew.drawing} drew the page`);
    const dropped = gpuErrorLine(drew);
    if (dropped !== null) console.error(dropped);
    const frame = summarizeFrameDeltas(deltas);
    const covered = (await session.evaluate<boolean>(`document.querySelector("[data-shell-warmup]") !== null`).catch(() => false)) ?? false;
    const unmeasured = unmeasuredSceneReason(breakdown?.counts.drawsAvg, covered);
    if (unmeasured !== null) {
      const page = await session.evaluate<string>(`location.href + " | " + document.querySelectorAll("canvas").length + " canvas, visibility " + document.visibilityState + ", focus " + document.hasFocus() + " | " + (document.body?.innerText ?? "").replace(/\\s+/g, " ").slice(0, 200)`).catch((error: unknown) => String(error));
      throw new Error(`${unmeasured} (longest frame ${frame.maxMs} ms, ${start}; page: ${page}); measure it again`);
    }
    const sorted = [...deltas].sort((a, b) => a - b);
    const quantile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? Number.NaN;
    const record: DesktopRecord = {
      at: Date.now(), exe: args.exe, clock: args.uncapped ? "uncapped" : "vsync", tier, viewport: viewport ?? "unknown", start, frame, rafP50Ms: quantile(0.5), rafP99Ms: quantile(0.99), breakdown, backend: { asked: backend, ...drew }, shadowCache,
      ...(cpu === null ? {} : { cpuLayers: cpu.layers, cpuUnmappedPct: cpu.unmappedPct }),
      ...(renderCounts === null ? {} : { renderCounts }),
    };
    if (args.out !== null) {
      const out = desktopOutFor(args, backend);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
    }
    const b = breakdown ?? null;
    console.log(`desktop ${record.clock} ${drew.drawing}: ${frame.fps} fps, frame avg ${frame.avgMs} ms, p95 ${frame.p95Ms} ms, frame p50 ${b?.frame.p50 ?? "?"} ms, CPU p50 ${b?.work.p50 ?? "?"} ms, GPU p50 ${b?.gpu?.p50 ?? "?"} ms, ${tier} tier, ${viewport}, walking; ${start}`);
    if (shadowCache !== null) {
      const { passes } = shadowCache;
      console.log(`shadow cache: ${shadowCache.cpuMs.toFixed(1)} ms in the shadow step over ${deltas.length} frames, ${shadowCache.checks} caster checks, passes full ${passes.full} rebuild ${passes.rebuild} reuse ${passes.reuse} hold ${passes.hold}`);
    }
    if (cpu !== null) {
      const ui = cpu.layers.filter((layer) => layer.layer === "React" || layer.layer === "react-three-fiber").reduce((sum, layer) => sum + layer.pct, 0);
      console.log(`cpu layers (${args.seconds}s sampled while walking, mapped through private maps): ${cpu.layers.slice(0, 8).map((layer) => `${layer.layer} ${layer.pct}%`).join("; ")}${cpu.unmappedPct > 0 ? `; unmapped ${cpu.unmappedPct}%` : ""}`);
      console.log(`React + react-three-fiber: ${ui.toFixed(1)}% of the main thread`);
    }
    if (renderCounts !== null) console.log(renderRenderCounts(renderCounts, "renders walk"));
    return record;
  });
}

/**
 * The WebView2 profile folders that hold compiled shaders and code, and nothing of a save: Skia's
 * programs, ANGLE's program binaries, Dawn's pipelines and V8's code cache. A returning player
 * has these from the last session, so a stall that only a first session pays is told apart.
 * @internal
 */
export const SHADER_CACHE_DIRS = ["EBWebView/GrShaderCache", "EBWebView/ShaderCache", "EBWebView/GPUPersistentCache", "EBWebView/GraphiteDawnCache", "EBWebView/Default/GPUCache", "EBWebView/Default/DawnGraphiteCache", "EBWebView/Default/DawnWebGPUCache", "EBWebView/Default/Code Cache"];

/** Copy the shader caches of one profile into a new one; how many folders it found. @internal */
export function carryShaderCaches(from: string, to: string): number {
  let carried = 0;
  for (const dir of SHADER_CACHE_DIRS) {
    if (!existsSync(join(from, dir))) continue;
    cpSync(join(from, dir), join(to, dir), { recursive: true });
    carried += 1;
  }
  return carried;
}

/**
 * Launch a diagnostic desktop build on a fresh WebView2 profile (a first play, and a player's saves
 * stay untouched), play one of the game's flows with real input, and print and write every frame of
 * 33 ms or more in it with its cause and the scripts that ran in it. False when the flow failed.
 * With `--returning` the flow plays once unmeasured first, and the measured play starts from a new
 * profile holding only that session's shader caches: the stalls a player sees on a second launch.
 */
export async function launchAndPlayFlow(args: LaunchArgs, flow: { game: string; name: string }, backend: RendererBackend): Promise<boolean> {
  const proof = await loadFlow(flowsDirOf(resolve(import.meta.dir, "..", "games", flow.game)), flow.name);
  const profile = mkdtempSync(join(tmpdir(), "jg-desktop-flow-"));
  try {
    if (args.returning) {
      const first = mkdtempSync(join(tmpdir(), "jg-desktop-flow-"));
      try {
        console.log(`${flow.game}/${flow.name}: first session, to fill the shader caches (not measured)`);
        await withLaunchedScene(args, backend, first, async (session) => {
          const stepper = createFlowStepper(() => readProbe(session));
          const reports: { label: string; probe: unknown }[] = [];
          const driver = pageFlowDriver(session, { clock: null, reload: async () => { throw new Error("a desktop flow cannot reload the app"); }, shot: async () => {} });
          const report = await runFlowReport(stepper, reports, () => proof.run(createBrowserFlow(driver, stepper, reports)));
          if (!report.ok) for (const line of describeFlowReport(`${flow.game}/${flow.name} (first session)`, report)) console.error(line);
        });
        // WebView2 writes its caches as it exits; a moment for the last of them to land.
        await Bun.sleep(2_000);
        const carried = carryShaderCaches(first, profile);
        if (carried === 0) throw new Error("the first session left no shader caches to carry; the returning play would measure a first play again");
        console.log(`${flow.game}/${flow.name}: returning session with ${carried} shader cache folder(s) from the first`);
      } finally {
        removeProfileDir(first);
      }
    }
    return await withLaunchedScene(args, backend, profile, async (session, { tier, start }) => {
      if (!(await resetBreakdown(session))) throw new Error("the page has no frame breakdown; build it with --diagnostics");
      if (args.renders && !(await resetRenderCounter(session))) {
        throw new Error("the page has no render counter; the counter script did not reach it before React loaded");
      }
      const { privateMap } = await privateMapReader(session, args.maps);
      if (args.trace) {
        await startTrace(session);
        await markTraceAnchor(session);
      }
      // The whole flow is one CPU window: a HUD that only exists mid-dive still shows in the layers.
      if (args.cpu) {
        await session.send("Profiler.enable");
        await session.send("Profiler.setSamplingInterval", { interval: 200 });
        await session.send("Profiler.start");
      }
      const driver = pageFlowDriver(session, {
        clock: null,
        reload: async () => { throw new Error("a desktop flow cannot reload the app"); },
        shot: async () => {},
      });
      const stepper = createFlowStepper(() => readProbe(session));
      const reports: { label: string; probe: unknown }[] = [];
      const name = `${flow.game}/${flow.name}`;
      // Commits and frames sampled through the run, so a HUD that re-renders per tick shows as a
      // commits/frame rate in the windows where it was up, not only as a whole-run average.
      const renderWindows: { atMs: number; counts: RunRenderCounts }[] = [];
      let samplingRenders = args.renders;
      const renderSampler = args.renders
        ? (async () => {
            while (samplingRenders) {
              const counts = await readRenderCounts(session).catch(() => null);
              if (counts !== null) renderWindows.push({ atMs: Date.now(), counts });
              await Bun.sleep(5_000);
            }
          })()
        : Promise.resolve();
      const report = await runFlowReport(stepper, reports, () => proof.run(createBrowserFlow(driver, stepper, reports)));
      samplingRenders = false;
      await renderSampler;
      for (const line of describeFlowReport(name, report)) (report.ok ? console.log : console.error)(line);
      const cpu: DesktopCpuProfile | null = args.cpu
        ? await session.send("Profiler.stop").then((stopped) => foldDesktopCpuLayers(session, stopped["profile"] as RawProfile, async (scriptId) => {
            try { return await privateMap(scriptId); } catch { return null; }
          }))
        : null;
      const renderCounts = args.renders ? await readRenderCounts(session) : null;
      if (renderCounts !== null) {
        console.log(renderRenderCounts(renderCounts, `renders ${name}`));
        for (let index = 1; index < renderWindows.length; index += 1) {
          const before = renderWindows[index - 1]!;
          const after = renderWindows[index]!;
          const commits = after.counts.commits - before.counts.commits;
          const frames = after.counts.frames - before.counts.frames;
          if (frames > 0) console.log(`  renders window ${((after.atMs - before.atMs) / 1000).toFixed(0)}s: ${commits} commits / ${frames} frames = ${(commits / frames).toFixed(2)} commits/frame`);
        }
      }
      if (cpu !== null) {
        const ui = cpu.layers.filter((layer) => layer.layer === "React" || layer.layer === "react-three-fiber").reduce((sum, layer) => sum + layer.pct, 0);
        console.log(`cpu layers (whole flow, mapped through private maps): ${cpu.layers.slice(0, 8).map((layer) => `${layer.layer} ${layer.pct}%`).join("; ")}${cpu.unmappedPct > 0 ? `; unmapped ${cpu.unmappedPct}%` : ""}`);
        console.log(`React + react-three-fiber: ${ui.toFixed(1)}% of the main thread`);
      }
      const hitches = await readHitchSession(session, privateMap);
      if (hitches === null) throw new Error("the page lost its frame breakdown during the flow");
      const clock = args.uncapped ? "uncapped" : "vsync";
      const out = args.out ?? resolve(import.meta.dir, "..", ".scratch", "perf", "hitches", `${flow.game}-${flow.name}-desktop.json`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify({ at: Date.now(), exe: args.exe, clock, tier, start, flow: name, session: args.returning ? "returning" : "first", ok: report.ok, hitches, ...(cpu === null ? {} : { cpuLayers: cpu.layers, cpuUnmappedPct: cpu.unmappedPct }), ...(renderCounts === null ? {} : { renderCounts, renderWindows }) }, null, 2)}\n`);
      console.log(renderHitchSession(hitches, `desktop ${clock} ${name}`));
      console.log(`hitch record: ${out}`);
      if (args.trace) {
        const tracePath = out.replace(/\.json$/, "") + ".trace.json";
        await endTrace(session, tracePath);
        console.log(`trace: ${tracePath}`);
        const traced = traceHitches(await readTraceEvents(tracePath), hitches.hitches);
        console.log(renderTracedHitches(traced, await describeFirstPaints(session, traced)));
      }
      return report.ok;
    });
  } finally {
    // WebView2 lets go of its files a moment after the app exits; a profile still locked is left to the sweep, not a failed run.
    removeProfileDir(profile);
  }
}

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
/** One frame at 360 Hz, in ms. */
const BUDGET_360_MS = 1000 / 360;
const DEFAULT_ALL_RECORDS = join(repoRoot, ".scratch", "perf-desktop");

export interface AllArgs {
  games: string[];
  uncapped: boolean;
  seconds: number;
  /** Each game's build, build log and record go in `<records>/<game>/`. */
  records: string;
  /** Measure the apps already built in `records` instead of building each game first. */
  skipBuild: boolean;
  /** Reprint the table from the records already saved, measuring nothing. */
  reuse: boolean;
  markdown: boolean;
  /** The GPU backends each game is measured on, one launch each (`--renderer`, default webgl). */
  renderers: RendererBackend[];
  /** `--cpu`: profile each game's main thread by layer over a second window. */
  cpu: boolean;
  /** `--renders`: count React commits and renders over each game's measured window. */
  renders: boolean;
}

/** Parse `--all [--games a,b] [--uncapped] [--renderer webgl|webgpu|both] [--seconds n] [--records dir] [--skip-build] [--reuse] [--markdown] [--cpu] [--renders]`. @internal */
export function parseAllArgs(argv: readonly string[]): AllArgs {
  const args: AllArgs = { games: [...FRAME_GAMES], uncapped: false, seconds: 8, records: DEFAULT_ALL_RECORDS, skipBuild: false, reuse: false, markdown: false, renderers: ["webgl"], cpu: false, renders: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--all") continue;
    if (arg === "--uncapped") { args.uncapped = true; continue; }
    if (arg === "--skip-build") { args.skipBuild = true; continue; }
    if (arg === "--reuse") { args.reuse = true; continue; }
    if (arg === "--markdown") { args.markdown = true; continue; }
    if (arg === "--cpu") { args.cpu = true; continue; }
    if (arg === "--renders") { args.renders = true; continue; }
    if (arg !== "--games" && arg !== "--seconds" && arg !== "--records" && arg !== "--renderer") throw new Error(`unknown argument ${arg}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
    index += 1;
    if (arg === "--renderer") {
      const backend = parseRendererBackend(value);
      if (value !== "both" && backend === null) throw new Error(`--renderer must be webgl, webgpu or both (got ${value})`);
      args.renderers = backend === null ? ["webgl", "webgpu"] : [backend];
    } else if (arg === "--games") args.games = value.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
    else if (arg === "--records") args.records = resolve(value);
    else {
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`--seconds must be a positive number (got ${value})`);
      args.seconds = seconds;
    }
  }
  if (args.games.length === 0) throw new Error("--games needs at least one game id");
  return args;
}

/** One game's row in the all-games report on one backend: its record, or why it has none. */
export interface AllRow { game: string; backend: RendererBackend; record: DesktopRecord | null; error: string | null }

const ms = (value: number | undefined): string => (value === undefined || !Number.isFinite(value) ? "?" : value.toFixed(2));

/** React plus react-three-fiber's share of the profiled main thread, or null when the run did not profile. */
function uiShare(record: DesktopRecord): number | null {
  const layers = record.cpuLayers;
  if (layers === undefined) return null;
  return layers.filter((layer) => layer.layer === "React" || layer.layer === "react-three-fiber").reduce((sum, layer) => sum + layer.pct, 0);
}

/** The all-games desktop table against 360 fps. A report, not a gate. @internal */
export function renderAllTable(rows: readonly AllRow[], markdown: boolean): string {
  const withCpu = rows.some((row) => row.record?.cpuLayers !== undefined);
  const withRenders = rows.some((row) => row.record?.renderCounts !== undefined);
  const header = ["game", "renderer", "clock", "fps", "frame p50 ms", "frame p95 ms", "CPU p50 ms", "GPU p50 ms", "draws", ...(withCpu ? ["React+r3f %"] : []), ...(withRenders ? ["commits/frame"] : []), "at 360 fps"];
  const body = rows.map((row) => {
    if (row.record === null) return [row.game, row.backend, "-", "-", "-", "-", "-", "-", "-", ...(withCpu ? ["-"] : []), ...(withRenders ? ["-"] : []), `no run: ${row.error ?? "unknown"}`];
    const { record } = row;
    const b = record.breakdown;
    const frameP50 = b?.frame.p50 ?? record.rafP50Ms;
    const errors = gpuErrors(record.backend).length;
    const verdict = errors > 0 ? `not comparable: ${errors} WebGPU errors dropped GPU work` : record.frame.fps >= 360 ? "yes" : `${(Math.max(frameP50, BUDGET_360_MS) / BUDGET_360_MS).toFixed(1)}x short`;
    const drawn = record.backend?.drawing ?? row.backend;
    const commits = record.renderCounts;
    const share = uiShare(record);
    return [row.game, drawn === row.backend ? drawn : `${row.backend} (drew ${drawn})`, record.clock, String(Math.round(record.frame.fps)), ms(frameP50), ms(record.frame.p95Ms), ms(b?.work.p50), ms(b?.gpu?.p50), b === null ? "?" : String(Math.round(b.counts.drawsAvg)), ...(withCpu ? [share === null ? "-" : share.toFixed(1)] : []), ...(withRenders ? [commits === undefined || commits.frames === 0 ? "-" : (commits.commits / commits.frames).toFixed(2)] : []), verdict];
  });
  const backends = [...new Set(rows.map((row) => row.backend))];
  const counts = backends.map((backend) => {
    const mine = rows.filter((row) => row.backend === backend);
    // A run whose GPU work was dropped measured less than the game; it counts as not measured.
    const valid = mine.filter((row) => row.record !== null && gpuErrors(row.record.backend).length === 0);
    const holding = valid.filter((row) => row.record!.frame.fps >= 360).length;
    const invalid = mine.filter((row) => row.record !== null).length - valid.length;
    return `${backend}: ${holding} of ${valid.length} measured games hold 360 fps (${mine.length - valid.length} not measured${invalid > 0 ? `, ${invalid} with dropped GPU work` : ""})`;
  });
  const summary = `${counts.join("; ")}. Production desktop builds (WebView2), --diagnostics, ${GATE_SIZE.width}x${GATE_SIZE.height}, high tier, automatic quality off, walking.`;
  if (markdown) {
    const line = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;
    return [line(header), line(header.map((_, index) => (index >= 3 && index <= 8 ? "---:" : "---"))), ...body.map(line), "", summary].join("\n");
  }
  const widths = header.map((cell, index) => Math.max(cell.length, ...body.map((cells) => (cells[index] ?? "").length)));
  const pad = (cells: readonly string[]) => cells.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ").trimEnd();
  return [pad(header), ...body.map(pad), "", summary].join("\n");
}

/** The game executable `jgengine desktop --out <dir>` wrote: the one .exe that is not an installer. */
function builtApp(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const apps = readdirSync(dir).filter((name) => name.toLowerCase().endsWith(".exe") && !name.toLowerCase().endsWith("-setup.exe"));
  return apps.length === 1 && apps[0] !== undefined ? join(dir, apps[0]) : null;
}

/** Build one game's diagnostic desktop app (no installer) into `<records>/<game>/app`, logging to build.log. */
function buildDesktopApp(game: string, records: string): string {
  const dir = join(records, game);
  mkdirSync(dir, { recursive: true });
  const log = join(dir, "build.log");
  const fd = openSync(log, "w");
  try {
    const result = spawnSync("bun", [join(repoRoot, "packages", "jgengine", "src", "cli", "index.ts"), "desktop", join(repoRoot, "games", game), "--diagnostics", "--no-installer", "--out", join(dir, "app")], { cwd: repoRoot, stdio: ["ignore", fd, fd], windowsHide: true, timeout: 20 * 60_000 });
    if (result.status !== 0) {
      const tail = readFileSync(log, "utf8").trim().split("\n").slice(-6).join(" | ");
      throw new Error(`desktop build failed (${result.error?.message ?? `exit ${result.status}`}); ${log}: ${tail}`);
    }
  } finally { closeSync(fd); }
  const app = builtApp(join(dir, "app"));
  if (app === null) throw new Error(`the build left no app in ${join(dir, "app")}`);
  return app;
}

/**
 * Build every game's production desktop app and measure it in turn (one at a time: each run
 * owns the GPU), then print each against 360 fps. A failed game is a row saying why, not a stop.
 */
export async function measureAll(args: AllArgs): Promise<AllRow[]> {
  const rows: AllRow[] = [];
  for (const game of args.games) {
    const clock = args.uncapped ? "uncapped" : "vsync";
    const recordPath = (backend: RendererBackend) => join(args.records, game, backend === "webgl" ? `${clock}.json` : `${clock}.${backend}.json`);
    if (args.reuse) {
      for (const backend of args.renderers) {
        const path = recordPath(backend);
        rows.push(existsSync(path) ? { game, backend, record: JSON.parse(readFileSync(path, "utf8")) as DesktopRecord, error: null } : { game, backend, record: null, error: `no saved record at ${path}` });
      }
      continue;
    }
    let app: string | null;
    try {
      app = args.skipBuild ? builtApp(join(args.records, game, "app")) : (console.error(`perf desktop: building ${game}`), buildDesktopApp(game, args.records));
      if (app === null) throw new Error(`no built app in ${join(args.records, game, "app")}; drop --skip-build`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`perf desktop: ${game}: ${message}`);
      for (const backend of args.renderers) rows.push({ game, backend, record: null, error: message.slice(0, 160) });
      continue;
    }
    for (const backend of args.renderers) {
      try {
        const launch: LaunchArgs = { exe: app, uncapped: args.uncapped, seconds: args.seconds, port: null, out: recordPath(backend), maps: `${dirname(app)}.private-maps`, size: { width: GATE_SIZE.width, height: GATE_SIZE.height }, flow: null, renderers: [backend], returning: false, trace: false, cpu: args.cpu, renders: args.renders };
        let record: DesktopRecord;
        try {
          record = await launchAndMeasure(launch, backend);
        } catch (first) {
          // One more launch for a run a busy machine spoiled (a blank window, a slow boot); a second failure is the answer.
          console.error(`perf desktop: ${game} on ${backend} failed (${first instanceof Error ? first.message : String(first)}); launching once more`);
          record = await launchAndMeasure(launch, backend);
        }
        rows.push({ game, backend, record, error: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`perf desktop: ${game} on ${backend}: ${message}`);
        rows.push({ game, backend, record: null, error: message.slice(0, 160) });
      }
    }
  }
  return rows;
}

/**
 * The failure line for an `--all` run that left games unmeasured, or null when every run measured. The run
 * still prints every row, but it exits 1: eight of nine builds failed on a full disk and the run exited 0
 * (2026-11-09), so a caller reading only the exit took one game for all nine.
 */
export function unmeasuredFailure(rows: readonly Pick<AllRow, "game" | "backend" | "record">[]): string | null {
  const missing = rows.filter((row) => row.record === null);
  if (missing.length === 0) return null;
  return `perf desktop: ${missing.length} of ${rows.length} game runs not measured: ${missing.map((row) => `${row.game} (${row.backend})`).join(", ")}`;
}

async function main(argv: string[]): Promise<void> {
  if (argv[0] === "--launch") {
    const args = parseLaunchArgs(argv);
    for (const backend of args.renderers) {
      if (args.flow === null) await launchAndMeasure(args, backend);
      else if (!(await launchAndPlayFlow(args, args.flow, backend))) process.exitCode = 1;
    }
    return;
  }
  if (argv.includes("--all")) {
    const args = parseAllArgs(argv);
    const rows = await measureAll(args);
    console.log(renderAllTable(rows, args.markdown));
    const failed = unmeasuredFailure(rows);
    if (failed !== null) {
      console.error(failed);
      process.exitCode = 1;
    }
    return;
  }
  const port = Number(argv[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || argv[1] !== "--out" || argv[2] === undefined || argv[3] !== "--maps" || argv[4] === undefined || argv.length !== 5) throw new Error("usage: bun run perf desktop <debug-port> --out <file.json> --maps <private-maps-directory>\n       bun run perf desktop --launch <app.exe> [--uncapped] [--renderer webgl|webgpu|both] [--seconds n] [--port n] [--size WxH] [--out <file.json>] [--maps <private-maps-directory>] [--flow <game>/<flow>] [--cpu] [--renders]\n       bun run perf desktop --all [--uncapped] [--renderer webgl|webgpu|both] [--games a,b] [--seconds n] [--records dir] [--skip-build] [--reuse] [--markdown] [--cpu] [--renders]");
  const targets = await localGetJson<Target[]>(`http://127.0.0.1:${port}/json/list`, 5_000);
  const target = diagnosticDesktopTarget(targets);
  if (target.webSocketDebuggerUrl === undefined) throw new Error("desktop debugger URL unavailable");
  const debuggerUrl = new URL(target.webSocketDebuggerUrl);
  if (debuggerUrl.protocol !== "ws:" || debuggerUrl.hostname !== "127.0.0.1" || Number(debuggerUrl.port) !== port) throw new Error("desktop debugger URL is not on the requested local port");
  const session = await CdpSession.connect(target.webSocketDebuggerUrl, 10_000);
  try {
    const { breakdown, report, build } = await desktopDeadline((async () => {
      const { build, privateMap } = await privateMapReader(session, resolve(argv[4] ?? ""));
      const breakdown = await readBreakdown(session, privateMap);
      if (breakdown === null) throw new Error("desktop frame report unavailable; diagnostic telemetry has not started");
      const report = await session.evaluate<unknown>("globalThis.__JG?.report?.() ?? null");
      return { breakdown, report, build };
    })(), 30_000);
    const out = resolve(argv[2]);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify({ at: Date.now(), target: target.url, build: build ?? { error: "build manifest unavailable" }, report: report ?? null, breakdown }, null, 2)}\n`);
    console.log(renderBreakdownText(breakdown, "desktop"));
    console.error(`perf: desktop report written to ${out}`);
    if (breakdown.sources?.error !== undefined) throw new Error(`desktop source mapping incomplete: ${breakdown.sources.error}`);
  } finally { await session.close(); }
}

if (import.meta.main) await main(process.argv.slice(2)).catch((error: unknown) => { console.error(`perf desktop: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
