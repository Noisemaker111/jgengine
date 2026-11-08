import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decodePng, encodePng } from "../packages/assets/src/imageCodec";
import { applyDevice, ensureDevServer, navigateCapturePage, openPageSession, withBrowserSession, type CdpSession } from "./browser-lib";
import { GATE_SIZE } from "./perf-gate";
import { perfPageUrl, SAMPLE_FRAMES_SCRIPT } from "./perf-play";
import { diffImages, type ShotDiff } from "./shot-diff";

/**
 * The same frozen moment of a game drawn by WebGL and by WebGPU, compared pixel by pixel.
 *
 *   bun scripts/renderer-diff.ts <game> [<game> ...] [--out <dir>] [--settle <ms>]
 *
 * One page per game: it boots on WebGL at the frame gate's size and tier, freezes game time, shoots
 * twice (the two WebGL shots measure what still moves with time frozen: the noise floor), then
 * switches the renderer setting, which remounts the canvas on WebGPU with the game state kept, waits
 * out its shader warmup and shoots again. Every shot waits for auto-exposure to settle first. Last it switches back to WebGL and shoots once more: a
 * remount changes some things on either backend (streamed content, the exposure meter's history),
 * so `remounted` (WebGPU against that remounted WebGL frame) is the backend's own difference, and
 * `remount` (the two WebGL frames) is what remounting alone changes. Writes webgl.png,
 * webgl-again.png, webgpu.png, webgl-remounted.png, diff.png (WebGPU against the remounted WebGL)
 * and result.json per game under --out (default .scratch/renderer-diff) and prints one JSON line per game.
 * A report, not a gate: exits 1 only when a game could not be compared.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export interface RendererDiffResult {
  game: string;
  /** WebGL against itself, time frozen: what moves anyway (particles, shader time). */
  noise: ShotDiff;
  /** WebGL against WebGPU. */
  diff: ShotDiff;
  /** WebGPU against WebGL after both were remounted by a switch: the backend's own difference. */
  remounted: ShotDiff;
  /** The first WebGL frame against the remounted one: what remounting alone changes. */
  remount: ShotDiff;
  /** The WebGPU context's distinct warnings: what it drew differently from WebGL or not at all. */
  warnings: string[];
  /** Seconds the WebGPU canvas took from the switch to its first warm frame. */
  switchSeconds: number;
  /** The settled auto-exposure each shot was taken at: first WebGL, WebGPU, remounted WebGL. */
  exposure: { webgl: number | null; webgpu: number | null; remounted: number | null };
  /**
   * Frame times right after each shot, on the uncapped clock, with game time still frozen: the same
   * scene drawn by each backend, so the difference is the backend's own cost. A walking run sees a
   * different scene on each backend (Brightway Park's WebGPU walk drew 240k triangles to WebGL's
   * 72k, 2026-11-08), which a speed comparison cannot separate from the renderer. WebGL is timed
   * before and after WebGPU, so drift on a busy PC shows as the two WebGL numbers disagreeing.
   * `null` with `--seconds 0`.
   */
  frames: { webgl: FrameTiming; webgpu: FrameTiming; remounted: FrameTiming } | null;
}

/** One timed window: median and 95th-percentile frame time in ms, and frames per second. */
export interface FrameTiming {
  p50Ms: number;
  p95Ms: number;
  fps: number;
  samples: number;
}

/** Summarize rAF deltas; the first frame after a screenshot is dropped, as it carries the capture. @internal */
export function frameTiming(deltas: readonly number[]): FrameTiming {
  const kept = deltas.slice(1).filter((ms) => Number.isFinite(ms) && ms > 0).sort((a, b) => a - b);
  if (kept.length === 0) return { p50Ms: 0, p95Ms: 0, fps: 0, samples: 0 };
  const at = (q: number) => Math.round(kept[Math.min(kept.length - 1, Math.floor(kept.length * q))]! * 100) / 100;
  const avg = kept.reduce((sum, ms) => sum + ms, 0) / kept.length;
  return { p50Ms: at(0.5), p95Ms: at(0.95), fps: Math.round(10000 / avg) / 10, samples: kept.length };
}

async function timeFrames(session: CdpSession, seconds: number): Promise<FrameTiming> {
  return frameTiming((await session.evaluate<number[]>(SAMPLE_FRAMES_SCRIPT(seconds * 1000), { awaitPromise: true })) ?? []);
}

async function screenshot(session: CdpSession) {
  const shot = (await session.send("Page.captureScreenshot", { format: "png" })) as { data?: string };
  if (typeof shot.data !== "string") throw new Error("the page returned no screenshot");
  const bytes = Buffer.from(shot.data, "base64");
  return { bytes, image: decodePng(bytes) };
}

async function bridge(session: CdpSession, request: Record<string, unknown>): Promise<{ ok: boolean; error?: string } & Record<string, unknown>> {
  const reply = await session.evaluate<{ ok: boolean; error?: string }>(`window.__jgengineAgent?.handle?.(${JSON.stringify(request)}) ?? { ok: false, error: "no agent bridge on the page" }`, { awaitPromise: true });
  return reply ?? { ok: false, error: "the agent bridge returned nothing" };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Collects every renderer the page makes through three's devtools hook, so the live one's exposure can be read. */
const RENDERER_HOOK = `window.__THREE_DEVTOOLS__ ??= new EventTarget(); window.__jgDiffRenderers = []; window.__THREE_DEVTOOLS__.addEventListener("observe", (e) => { if (e.detail && typeof e.detail.getContext === "function" && "toneMappingExposure" in e.detail) window.__jgDiffRenderers.push(new WeakRef(e.detail)); });`;
const LIVE_EXPOSURE = `(() => { const live = (window.__jgDiffRenderers ?? []).map((r) => r.deref()).filter((r) => r && !r.getContext().isContextLost()); return live.length === 0 ? null : live[live.length - 1].toneMappingExposure; })()`;

/**
 * Waits until auto-exposure stops moving: three readings a second apart that agree. A remounted
 * canvas meters its first frames afresh and adapts over seconds, slower where the backend's
 * readbacks land later, so a shot taken mid-adaptation charged a brightness drift to the backend
 * (Harbor Heat's WebGPU frame was shot at exposure 1.81 on its way to 1.03).
 */
async function settleExposure(session: CdpSession, label: string): Promise<number | null> {
  const readings: (number | null)[] = [];
  for (let i = 0; i < 60; i += 1) {
    readings.push((await session.evaluate<number | null>(LIVE_EXPOSURE).catch(() => null)) ?? null);
    const last = readings.slice(-3);
    const first = last[0] ?? null;
    if (last.length === 3 && first !== null && last.every((value) => value === first)) return first;
    await sleep(1000);
  }
  console.error(`degraded: ${label} exposure still moving after 60 s (${readings.slice(-3).join(", ")}); shot taken anyway`);
  return readings.at(-1) ?? null;
}

async function switchTo(session: CdpSession, backend: "webgl" | "webgpu"): Promise<number> {
  const switched = await bridge(session, { method: "setting_set", id: "graphics.renderer", value: backend });
  if (!switched.ok || switched["value"] !== backend) throw new Error(`could not switch the renderer: ${switched.error ?? JSON.stringify(switched)}`);
  const started = Date.now();
  // The old canvas leaves first; the new one is warm once its warmup cover is gone and it has drawn.
  const warmCheck = backend === "webgpu"
    ? `!!globalThis.__jgWebGpu && !globalThis.__jgWebGpu.isContextLost() && document.querySelector("[data-shell-warmup]") === null && globalThis.__jgWebGpu.stats.frames > 2`
    : `(!globalThis.__jgWebGpu || globalThis.__jgWebGpu.isContextLost()) && document.querySelector("canvas") !== null && document.querySelector("[data-shell-warmup]") === null`;
  let warm = false;
  // The remount and its warmup cover take a moment to start; checking at once would see the old canvas.
  await sleep(2000);
  for (let i = 0; i < 480 && !warm; i += 1) {
    await sleep(500);
    warm = (await session.evaluate<boolean>(warmCheck).catch(() => false)) ?? false;
  }
  if (!warm) throw new Error(`the ${backend} canvas did not finish its warmup within 4 minutes of the switch`);
  return Math.round((Date.now() - started) / 100) / 10;
}

async function compareGame(session: CdpSession, base: string, game: string, outDir: string, settleMs: number, seconds: number): Promise<RendererDiffResult> {
  const timed = async () => (seconds > 0 ? await timeFrames(session, seconds) : null);
  await applyDevice(session, "desktop", "full", { width: GATE_SIZE.width, height: GATE_SIZE.height });
  const url = perfPageUrl({ base, game, quality: "high", params: [["renderer", "webgl"]] });
  await navigateCapturePage(session, url.toString(), 240_000);
  const frozen = await bridge(session, { method: "time_scale", scale: 0 });
  if (!frozen.ok) throw new Error(`could not freeze game time: ${frozen.error}`);
  await sleep(settleMs);
  const webglExposure = await settleExposure(session, "webgl");
  const webgl = await screenshot(session);
  await sleep(1000);
  const webglAgain = await screenshot(session);
  const webglFrames = await timed();

  const switchSeconds = await switchTo(session, "webgpu");
  // Time stays frozen across the remount; the settle lets streamed content and the exposure meter land.
  await bridge(session, { method: "time_scale", scale: 0 });
  await sleep(settleMs);
  const webgpuExposure = await settleExposure(session, "webgpu");
  const webgpu = await screenshot(session);
  const webgpuFrames = await timed();
  const warnings = (await session.evaluate<string[]>(`[...(globalThis.__jgWebGpu?.warnings?.keys() ?? [])].map((w) => w.slice(0, 300))`)) ?? [];
  await switchTo(session, "webgl");
  await bridge(session, { method: "time_scale", scale: 0 });
  await sleep(settleMs);
  const remountedExposure = await settleExposure(session, "remounted webgl");
  const webglRemounted = await screenshot(session);
  const remountedFrames = await timed();

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "webgl.png"), webgl.bytes);
  writeFileSync(join(outDir, "webgl-again.png"), webglAgain.bytes);
  writeFileSync(join(outDir, "webgpu.png"), webgpu.bytes);
  writeFileSync(join(outDir, "webgl-remounted.png"), webglRemounted.bytes);
  const heat = new Uint8Array(webgl.image.width * webgl.image.height * 4);
  const noise = diffImages(webgl.image, webglAgain.image);
  const diff = diffImages(webgl.image, webgpu.image);
  const remounted = diffImages(webglRemounted.image, webgpu.image, [], heat);
  const remount = diffImages(webgl.image, webglRemounted.image);
  writeFileSync(join(outDir, "diff.png"), encodePng({ width: webgl.image.width, height: webgl.image.height, data: heat }));
  const exposure = { webgl: webglExposure, webgpu: webgpuExposure, remounted: remountedExposure };
  const frames = webglFrames !== null && webgpuFrames !== null && remountedFrames !== null ? { webgl: webglFrames, webgpu: webgpuFrames, remounted: remountedFrames } : null;
  const result: RendererDiffResult = { game, noise, diff, remounted, remount, warnings, switchSeconds, exposure, frames };
  writeFileSync(join(outDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export function parseRendererDiffArgs(argv: readonly string[]): { games: string[]; out: string; settleMs: number; seconds: number } {
  const games: string[] = [];
  let out = join(repoRoot, ".scratch", "renderer-diff");
  let settleMs = 4000;
  let seconds = 5;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--out" || arg === "--settle" || arg === "--seconds") {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      i += 1;
      if (arg === "--out") out = resolve(value);
      else if (arg === "--settle") {
        settleMs = Number(value);
        if (!Number.isFinite(settleMs) || settleMs < 0) throw new Error(`--settle must be milliseconds (got ${value})`);
      } else {
        seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`--seconds must be a number of seconds, 0 to skip timing (got ${value})`);
      }
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`unknown argument ${arg}`);
    games.push(arg);
  }
  if (games.length === 0) throw new Error("usage: bun scripts/renderer-diff.ts <game> [<game> ...] [--out <dir>] [--settle <ms>] [--seconds <n>]");
  return { games, out, settleMs, seconds };
}

/** The table a run ends with: each game's frame p50 on WebGL (before / after) and WebGPU, and WebGPU's share. @internal */
export function frameTable(results: readonly RendererDiffResult[]): string {
  const rows = results.flatMap((r) => {
    const f = r.frames;
    if (f === null) return [];
    const gl = (f.webgl.p50Ms + f.remounted.p50Ms) / 2;
    const ratio = gl > 0 ? f.webgpu.p50Ms / gl : 0;
    return `| ${r.game} | ${f.webgl.p50Ms} / ${f.remounted.p50Ms} | ${f.webgpu.p50Ms} | ${ratio.toFixed(2)}x | ${ratio > 0 && ratio < 1 ? "webgpu" : "webgl"} |`;
  });
  if (rows.length === 0) return "";
  return ["| game | WebGL p50 ms (before / after) | WebGPU p50 ms | WebGPU / WebGL | faster |", "| --- | --- | ---: | ---: | --- |", ...rows].join("\n");
}

async function main(): Promise<void> {
  const args = parseRendererDiffArgs(process.argv.slice(2));
  const failed: string[] = [];
  const results: RendererDiffResult[] = [];
  for (const game of args.games) {
    try {
      const server = await ensureDevServer(repoRoot);
      // Uncapped so the timed windows measure each backend's cost rather than the display's refresh.
      await withBrowserSession({ keep: false, timeoutMs: 600_000, ...(args.seconds > 0 ? { frameClock: "uncapped" as const } : {}) }, async ({ debugPort }) => {
        const session = await openPageSession(debugPort);
        await session.send("Page.enable", {});
        await session.send("Page.addScriptToEvaluateOnNewDocument", { source: RENDERER_HOOK });
        try {
          const result = await compareGame(session, server.base, game, join(args.out, game), args.settleMs, args.seconds);
          results.push(result);
          console.log(JSON.stringify(result));
        } finally {
          await session.close();
        }
      });
    } catch (error) {
      console.error(`renderer-diff: ${game} could not be compared: ${error instanceof Error ? error.message : String(error)}`);
      failed.push(game);
    }
  }
  const table = frameTable(results);
  if (table !== "") console.error(`\nSame frozen moment on each backend, uncapped:\n${table}`);
  if (failed.length > 0) process.exitCode = 1;
}

if (import.meta.main) await main();
