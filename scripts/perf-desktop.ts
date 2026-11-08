import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { CdpSession } from "./browser-lib";
import { createBrowserFlow } from "./browserFlow";
import { flowsDirOf, loadFlow } from "./driveFlows";
import { pageFlowDriver, readProbe } from "./drivePage";
import { localGetJson } from "./localhostHttp";
import { readBreakdown, readHitchSession, renderHitchSession, resetBreakdown, startPath } from "./perf-breakdown";
import { createFlowStepper, describeFlowReport, runFlowReport } from "../packages/core/src/play/flowSteps";
import { GATE_SIZE } from "./perf-gate";
import { parseSettingSpec, perfSettingsScript, SAMPLE_FRAMES_SCRIPT, summarizeFrameDeltas } from "./perf-play";
import { renderBreakdownText, type FrameBreakdownSummary } from "../packages/core/src/devtools/frameBreakdown";
import type { FrameWindow } from "../packages/core/src/devtools/report";
import { readPrivateDesktopMap } from "../packages/jgengine/src/desktopMaps";

interface Target { type?: string; url?: string; webSocketDebuggerUrl?: string }

/** Bound one debugger read; the caller closes its session on timeout. @internal */
export async function desktopDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`desktop report timed out after ${ms}ms`)), ms); })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
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
  port: number;
  out: string | null;
  /** The private source maps the build wrote: `<app folder>.private-maps` unless `--maps` names them. */
  maps: string;
  /** The page size; the frame gate's 1600x900 unless `--size WxH` asks for another (a recording's own size). */
  size: { width: number; height: number };
  /** `--flow <game>/<name>`: play that game's flow instead of the walk and report every hitch in it. */
  flow: { game: string; name: string } | null;
}

/** Parse `--launch <exe> [--uncapped] [--seconds n] [--port n] [--size WxH] [--out file] [--maps dir] [--flow game/name]`. @internal */
export function parseLaunchArgs(argv: readonly string[]): LaunchArgs {
  let exe: string | undefined;
  let uncapped = false;
  let seconds = 8;
  let port = 9390;
  let out: string | null = null;
  let maps: string | null = null;
  let size: { width: number; height: number } = { width: GATE_SIZE.width, height: GATE_SIZE.height };
  let flow: { game: string; name: string } | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--uncapped") { uncapped = true; continue; }
    if (arg !== "--launch" && arg !== "--seconds" && arg !== "--port" && arg !== "--size" && arg !== "--out" && arg !== "--maps" && arg !== "--flow") throw new Error(`unknown argument ${arg}`);
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
  return { exe, uncapped, seconds, port, out, maps: maps ?? `${dirname(exe)}.private-maps`, size, flow };
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
async function withLaunchedScene<T>(args: LaunchArgs, profile: string | null, work: (session: CdpSession, scene: LaunchedScene) => Promise<T>): Promise<T> {
  if (process.platform !== "win32") throw new Error("--launch measures a Windows (WebView2) desktop build");
  if (!existsSync(args.exe)) throw new Error(`no desktop app at ${args.exe}; build one with: bun run jgengine desktop games/<id> --diagnostics`);
  const env = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${args.port}`, ...(profile === null ? {} : { WEBVIEW2_USER_DATA_FOLDER: profile }) };
  const child = spawn(args.exe, args.uncapped ? ["--uncapped"] : [], { env, stdio: "ignore" });
  try {
    let target: Target | undefined;
    for (let attempt = 0; attempt < 120 && target === undefined; attempt += 1) {
      try { target = diagnosticDesktopTarget(await localGetJson<Target[]>(`http://127.0.0.1:${args.port}/json/list`, 1_000)); } catch { await Bun.sleep(500); }
    }
    if (target?.webSocketDebuggerUrl === undefined) throw new Error(`the app opened no diagnostic page on port ${args.port} within 60 s; build it with --diagnostics`);
    const session = await CdpSession.connect(target.webSocketDebuggerUrl, 10_000);
    try {
      await session.send("Page.enable");
      await session.send("Page.addScriptToEvaluateOnNewDocument", { source: perfSettingsScript([parseSettingSpec("graphics.auto=false")]) });
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
      // out the warmup (its own cap is 2.5 minutes), then the same settle the browser harness gives.
      let warming = true;
      for (let attempt = 0; attempt < 360 && warming; attempt += 1) {
        warming = (await session.evaluate<boolean>(`document.querySelector("[data-shell-warmup]") !== null`).catch(() => true)) ?? true;
        if (warming) await Bun.sleep(500);
      }
      if (warming) throw new Error("the scene's shader warmup did not finish within 3 minutes");
      await Bun.sleep(10_000);
      return await work(session, { tier, start });
    } finally {
      await session.close();
    }
  } finally {
    if (child.pid !== undefined) spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore", windowsHide: true });
  }
}

/** Launch a diagnostic desktop build, walk at the frame gate's conditions, and print and return the frame rate it reaches. */
export async function launchAndMeasure(args: LaunchArgs): Promise<DesktopRecord> {
  return withLaunchedScene(args, null, async (session, { tier, start }) => {
    const release = await startPath(session, "walk");
    await Bun.sleep(2_000);
    if (!(await resetBreakdown(session))) throw new Error("the page has no frame breakdown; build it with --diagnostics");
    const deltas = (await session.evaluate<number[]>(SAMPLE_FRAMES_SCRIPT(args.seconds * 1000), { awaitPromise: true })) ?? [];
    // Frame callbacks name their source through the private maps the build wrote beside the app.
    const { privateMap } = await privateMapReader(session, args.maps);
    const breakdown = await readBreakdown(session, privateMap);
    await release();
    const viewport = await session.evaluate<string>(`innerWidth + "x" + innerHeight`);
    const frame = summarizeFrameDeltas(deltas);
    // A window that drew nothing (a reload, a stall back to a blank page) measures an empty frame:
    // Brightway Park once read 365 fps and Odd Orbit 86 fps with zero draws.
    if (breakdown !== null && breakdown.counts.drawsAvg < 1) {
      const page = await session.evaluate<string>(`location.href + " | " + document.querySelectorAll("canvas").length + " canvas, visibility " + document.visibilityState + ", focus " + document.hasFocus() + " | " + (document.body?.innerText ?? "").replace(/\\s+/g, " ").slice(0, 200)`).catch((error: unknown) => String(error));
      throw new Error(`the scene drew nothing while it was measured (${breakdown.counts.drawsAvg} draws a frame, longest frame ${frame.maxMs} ms, ${start}; page: ${page}); measure it again`);
    }
    const sorted = [...deltas].sort((a, b) => a - b);
    const quantile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? Number.NaN;
    const record: DesktopRecord = { at: Date.now(), exe: args.exe, clock: args.uncapped ? "uncapped" : "vsync", tier, viewport: viewport ?? "unknown", start, frame, rafP50Ms: quantile(0.5), rafP99Ms: quantile(0.99), breakdown };
    if (args.out !== null) {
      mkdirSync(dirname(args.out), { recursive: true });
      writeFileSync(args.out, `${JSON.stringify(record, null, 2)}\n`);
    }
    const b = breakdown ?? null;
    console.log(`desktop ${record.clock}: ${frame.fps} fps, frame avg ${frame.avgMs} ms, p95 ${frame.p95Ms} ms, frame p50 ${b?.frame.p50 ?? "?"} ms, CPU p50 ${b?.work.p50 ?? "?"} ms, GPU p50 ${b?.gpu?.p50 ?? "?"} ms, ${tier} tier, ${viewport}, walking; ${start}`);
    return record;
  });
}

/**
 * Launch a diagnostic desktop build on a fresh WebView2 profile (a first play, and a player's saves
 * stay untouched), play one of the game's flows with real input, and print and write every frame of
 * 33 ms or more in it with its cause and the scripts that ran in it. False when the flow failed.
 */
export async function launchAndPlayFlow(args: LaunchArgs, flow: { game: string; name: string }): Promise<boolean> {
  const proof = await loadFlow(flowsDirOf(resolve(import.meta.dir, "..", "games", flow.game)), flow.name);
  const profile = mkdtempSync(join(tmpdir(), "jg-desktop-flow-"));
  try {
    return await withLaunchedScene(args, profile, async (session, { tier, start }) => {
      if (!(await resetBreakdown(session))) throw new Error("the page has no frame breakdown; build it with --diagnostics");
      const driver = pageFlowDriver(session, {
        clock: null,
        reload: async () => { throw new Error("a desktop flow cannot reload the app"); },
        shot: async () => {},
      });
      const stepper = createFlowStepper(() => readProbe(session));
      const reports: { label: string; probe: unknown }[] = [];
      const name = `${flow.game}/${flow.name}`;
      const report = await runFlowReport(stepper, reports, () => proof.run(createBrowserFlow(driver, stepper, reports)));
      for (const line of describeFlowReport(name, report)) (report.ok ? console.log : console.error)(line);
      const { privateMap } = await privateMapReader(session, args.maps);
      const hitches = await readHitchSession(session, privateMap);
      if (hitches === null) throw new Error("the page lost its frame breakdown during the flow");
      const clock = args.uncapped ? "uncapped" : "vsync";
      const out = args.out ?? resolve(import.meta.dir, "..", ".scratch", "perf", "hitches", `${flow.game}-${flow.name}-desktop.json`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify({ at: Date.now(), exe: args.exe, clock, tier, start, flow: name, ok: report.ok, hitches }, null, 2)}\n`);
      console.log(renderHitchSession(hitches, `desktop ${clock} ${name}`));
      console.log(`hitch record: ${out}`);
      return report.ok;
    });
  } finally {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

async function main(argv: string[]): Promise<void> {
  if (argv[0] === "--launch") {
    const args = parseLaunchArgs(argv);
    if (args.flow === null) await launchAndMeasure(args);
    else if (!(await launchAndPlayFlow(args, args.flow))) process.exitCode = 1;
    return;
  }
  const port = Number(argv[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || argv[1] !== "--out" || argv[2] === undefined || argv[3] !== "--maps" || argv[4] === undefined || argv.length !== 5) throw new Error("usage: bun run perf desktop <debug-port> --out <file.json> --maps <private-maps-directory>\n       bun run perf desktop --launch <app.exe> [--uncapped] [--seconds n] [--port n] [--size WxH] [--out <file.json>] [--maps <private-maps-directory>] [--flow <game>/<flow>]");
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
