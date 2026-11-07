import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CdpSession } from "./browser-lib";
import { localGetJson } from "./localhostHttp";
import { readBreakdown, resetBreakdown, startPath } from "./perf-breakdown";
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
}

/** Parse `--launch <exe> [--uncapped] [--seconds n] [--port n] [--size WxH] [--out file] [--maps dir]`. @internal */
export function parseLaunchArgs(argv: readonly string[]): LaunchArgs {
  let exe: string | undefined;
  let uncapped = false;
  let seconds = 8;
  let port = 9390;
  let out: string | null = null;
  let maps: string | null = null;
  let size: { width: number; height: number } = { width: GATE_SIZE.width, height: GATE_SIZE.height };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--uncapped") { uncapped = true; continue; }
    if (arg !== "--launch" && arg !== "--seconds" && arg !== "--port" && arg !== "--size" && arg !== "--out" && arg !== "--maps") throw new Error(`unknown argument ${arg}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
    index += 1;
    if (arg === "--launch") exe = resolve(value);
    else if (arg === "--out") out = resolve(value);
    else if (arg === "--maps") maps = resolve(value);
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
  return { exe, uncapped, seconds, port, out, maps: maps ?? `${dirname(exe)}.private-maps`, size };
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

/**
 * Launch a diagnostic desktop build (`jgengine desktop --diagnostics`), pin the frame gate's
 * conditions (1600x900 unless `size` says otherwise, high tier, automatic quality off), walk, and
 * print and return the frame rate it reaches, then close it. WebView2 reads the debugger port from WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS,
 * which adds to the app's own browser arguments, so `--uncapped` still reaches the browser.
 */
export async function launchAndMeasure(args: LaunchArgs): Promise<DesktopRecord> {
  if (process.platform !== "win32") throw new Error("--launch measures a Windows (WebView2) desktop build");
  if (!existsSync(args.exe)) throw new Error(`no desktop app at ${args.exe}; build one with: bun run jgengine desktop games/<id> --diagnostics`);
  const child = spawn(args.exe, args.uncapped ? ["--uncapped"] : [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${args.port}` }, stdio: "ignore" });
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
      // The same settle the browser harness gives a game: shader warmup and streaming finish first.
      await Bun.sleep(10_000);
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
      if (breakdown !== null && breakdown.counts.drawsAvg < 1) throw new Error(`the scene drew nothing while it was measured (${breakdown.counts.drawsAvg} draws a frame, longest frame ${frame.maxMs} ms); measure it again`);
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
    } finally {
      await session.close();
    }
  } finally {
    if (child.pid !== undefined) spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore", windowsHide: true });
  }
}

async function main(argv: string[]): Promise<void> {
  if (argv[0] === "--launch") { await launchAndMeasure(parseLaunchArgs(argv)); return; }
  const port = Number(argv[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || argv[1] !== "--out" || argv[2] === undefined || argv[3] !== "--maps" || argv[4] === undefined || argv.length !== 5) throw new Error("usage: bun run perf desktop <debug-port> --out <file.json> --maps <private-maps-directory>\n       bun run perf desktop --launch <app.exe> [--uncapped] [--seconds n] [--port n] [--size WxH] [--out <file.json>] [--maps <private-maps-directory>]");
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
