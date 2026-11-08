import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import { ensureDevServer, killPid, killProcessTree, openPageSession, withBrowserSession } from "./browser-lib";
import { FRAME_GAMES } from "./ci-scope";
import { engineRecord, resolveEngineIdentity } from "./engineIdentity";
import { GATE_SIZE } from "./perf-gate";
import { acquirePerfLock } from "./perf-lock";
import { gameSessionDeadlineMs, GPU_WORK_SECONDS, gpuErrors, machineClause, measureGame, parseSettingSpec, type AllocationEntry, type PerfRecord, type ProfileNode, type RawProfile } from "./perf-play";
import type { FrameBreakdownSummary, NamedCost } from "../packages/core/src/devtools/frameBreakdown";
import { parseRendererBackend, type RendererBackend } from "../packages/core/src/settings/rendererBackend";

/**
 * How far each game is from 360 fps, and what stands in the way, grouped into engine-level work.
 *
 *   bun run perf fps-gap [--games a,b] [--renderer webgl|webgpu|both] [--seconds n] [--records <dir>] [--markdown]
 *
 * Every game is measured the way the frame gate measures it (1600x900, high tier, automatic
 * quality off, walking, uncapped clock), with a CPU and allocation profile after the frame window.
 * The report is a table, not a gate: it never fails a game for being slow.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/** One frame at 360 Hz, in ms: the budget every cost here is held against. */
export const FPS_GAP_BUDGET_MS = 1000 / 360;
/** A cost at or above this share of the budget (0.28 ms) counts as blocking that game. */
export const BLOCKING_SHARE = 0.1;
const DEFAULT_SECONDS = 8;
const WARMUP_MS = 5_000;
/** CPU rows kept per game, so the groups add up to the measured work rather than its top 15. */
const BREAKDOWN_TOP = 80;
export const DEFAULT_RECORDS = join(repoRoot, ".scratch", "perf-fps-gap");

/** Where sampled main-thread time went by layer, as a share of the profiled wall clock. */
export interface ProfileLayer {
  layer: string;
  pct: number;
}

/** One game's saved measurement: the perf record plus what only this report reads. */
export interface FpsGapEntry {
  record: PerfRecord;
  layers: ProfileLayer[];
  allocators: AllocationEntry[];
}

export interface FpsGapArgs {
  games: string[];
  seconds: number;
  records: string;
  /** Read saved entries from `records` instead of measuring. */
  reuse: boolean;
  markdown: boolean;
  /** The backends each game is measured on, in order; `both` compares them side by side. */
  renderers: RendererBackend[];
}

const USAGE = `usage: bun run perf fps-gap [--games a,b] [--renderer webgl|webgpu|both] [--seconds n] [--records <dir>] [--markdown]

  Measures every playable game at the frame gate's conditions (${GATE_SIZE.width}x${GATE_SIZE.height}, high tier,
  automatic quality off, walking, uncapped clock) and prints each against the ${FPS_GAP_BUDGET_MS.toFixed(2)} ms
  frame of 360 fps: frame p50/p95/p99, main-thread CPU and GPU ms, the costliest CPU systems and GPU
  passes, draws, triangles, scene nodes, garbage per 8 s and hitches. Then the costs grouped into
  engine-level work, ranked by how many games each blocks (>= ${(FPS_GAP_BUDGET_MS * BLOCKING_SHARE).toFixed(2)} ms) and its total ms.
  A report, not a gate: nothing fails for being slow.

  --games      comma-separated game ids (default: every game under games/ with a web entry)
  --renderer   the GPU backend to draw with (default webgl); both measures each game on WebGL then
               WebGPU and adds a table comparing their frame times. WebGPU records go in <records>/webgpu
  --seconds    measured window per game (default ${DEFAULT_SECONDS}); the profile window is as long again
  --records    directory each game's entry is written to (default .scratch/perf-fps-gap)
  --reuse      print the report from the entries already in --records instead of measuring
  --markdown   print the tables as Markdown, for a pull request or issue`;

export function parseFpsGapArgs(argv: readonly string[]): FpsGapArgs | "help" {
  let games: string[] | undefined;
  let seconds = DEFAULT_SECONDS;
  let records = DEFAULT_RECORDS;
  let reuse = false;
  let markdown = false;
  let renderers: RendererBackend[] = ["webgl"];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--help" || arg === "-h") return "help";
    if (arg === "--markdown") { markdown = true; continue; }
    if (arg === "--reuse") { reuse = true; continue; }
    if (arg === "--games" || arg === "--seconds" || arg === "--records" || arg === "--renderer") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      index += 1;
      if (arg === "--games") games = value.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
      else if (arg === "--renderer") {
        const backend = parseRendererBackend(value);
        if (value !== "both" && backend === null) throw new Error(`--renderer must be webgl, webgpu or both (got ${value})`);
        renderers = backend === null ? ["webgl", "webgpu"] : [backend];
      }
      else if (arg === "--records") records = resolve(value);
      else {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--seconds must be a positive number (got ${value})`);
        seconds = parsed;
      }
      continue;
    }
    throw new Error(`unknown argument ${arg}`);
  }
  if (games !== undefined && games.length === 0) throw new Error("--games needs at least one game id");
  return { games: games ?? [...FRAME_GAMES], seconds, records, reuse, markdown, renderers };
}

/** The layer a sampled function belongs to, from its script URL. */
export function profileLayerOf(node: Pick<ProfileNode, "callFrame">): string {
  const { functionName, url } = node.callFrame;
  if (url === "") {
    if (functionName === "(garbage collector)") return "garbage collection";
    if (functionName === "(idle)") return "idle";
    if (functionName === "(program)") return "browser (layout, paint, compositing, GPU process)";
    if (functionName === "(root)" || functionName === "") return "idle";
    return "native calls (WebGL, WebGPU and DOM)";
  }
  if (/three\.module|\/three\/|three-stdlib|postprocessing/.test(url)) return "three.js";
  if (/react-three|@react-three/.test(url)) return "react-three-fiber";
  if (/react-dom|react_dom|scheduler|\/react\b|react\.js|react_jsx/.test(url)) return "React";
  if (/\/games\/[^/]+\/src\//.test(url)) return "game code";
  // The engine's WebGL-shaped WebGPU context, apart: its JS is what the WebGPU backend adds over WebGL.
  if (/\/packages\/core\/src\/webgpu\//.test(url)) return "WebGPU context";
  if (/\/packages\/[^/]+\/src\//.test(url) || /\/src\//.test(url)) return "engine code";
  if (/\/node_modules\/|\/\.vite\/deps\//.test(url)) return "other dependencies";
  return "other scripts";
}

/** Self time per layer over a CPU profile, biggest first. */
export function profileLayers(profile: Pick<RawProfile, "nodes" | "samples" | "timeDeltas">): ProfileLayer[] {
  const layerById = new Map<number, string>(profile.nodes.map((node) => [node.id, profileLayerOf(node)]));
  const totals = new Map<string, number>();
  let all = 0;
  profile.samples.forEach((id, index) => {
    const us = profile.timeDeltas[index] ?? 0;
    all += us;
    const layer = layerById.get(id) ?? "other scripts";
    totals.set(layer, (totals.get(layer) ?? 0) + us);
  });
  if (all <= 0) return [];
  return [...totals]
    .map(([layer, us]) => ({ layer, pct: Math.round((us / all) * 1000) / 10 }))
    .sort((a, b) => b.pct - a.pct);
}

/** The engine-level work a breakdown CPU row belongs to. */
export function cpuGroupOf(name: string): string {
  if (name === "render:main" || name === "render:post:BeautyPass" || name === "render:post:RenderPass") return "scene submission (three.js traversal, sort, draw calls)";
  if (name === "render:shadow") return "shadow map submission";
  if (name.startsWith("render:post:") || name.startsWith("post:")) return "post-processing CPU";
  if (name.startsWith("render:")) return "scene submission (three.js traversal, sort, draw calls)";
  if (name.startsWith("sim:")) return "60 Hz sim tick";
  if (!name.startsWith("frame#")) return `other: ${name}`;
  const path = name.split(" | ")[0]?.split(" ")[1] ?? "";
  if (path === "") return "frame callbacks (source unresolved)";
  if (/^games\//.test(path)) return "game frame callbacks";
  const folder = /packages\/[^/]+\/src\/([^/]+)\//.exec(path)?.[1] ?? "";
  if (/useSharedFrame/.test(path)) return "shared frame tasks (useSharedFrame members)";
  if (/^(visibility|instancing|lod)$/.test(folder)) return "culling, instancing and LOD";
  if (/^(anim|character|model|skeleton|creature|rig)$/.test(folder)) return "skinned animation and foot IK";
  if (/^(hud|ui|menu|minimap|nameplate)$/.test(folder)) return "HUD and world-anchored UI";
  if (/^(postfx)$/.test(folder)) return "post-processing CPU";
  if (/^(camera)$/.test(folder)) return "camera rigs";
  if (/^(weather|lighting|sky|water|grass|foliage|plants|terrain|atmosphere)$/.test(folder)) return "environment updates (weather, water, grass, lighting)";
  if (/^(devtools)$/.test(folder)) return "frame diagnostics (dev only)";
  return folder === "" ? "frame callbacks (other)" : `frame callbacks: ${folder}`;
}

/** The engine-level work a GPU pass belongs to. */
export function gpuGroupOf(pass: string): string {
  if (pass === "main" || pass === "post:BeautyPass" || pass === "post:RenderPass") return "scene raster (GPU)";
  if (pass === "shadow") return "shadow map raster (GPU)";
  return "post-processing GPU";
}

const UNATTRIBUTED = "untimed work inside the frame (r3f loop, React effects)";
const BETWEEN = "between frames (GPU wait, compositing, React commits, GC)";

/**
 * Average ms per frame by group for one game: CPU groups, GPU groups, and the frame's unexplained time.
 * GPU groups come from `gpuWork` (every draw timed on its own) when the record has it, since the
 * frame window's pass timers also count the GPU waiting on the CPU.
 */
export function groupCosts(breakdown: FrameBreakdownSummary, gpuWork?: FrameBreakdownSummary | null): { cpu: Map<string, number>; gpu: Map<string, number> } {
  const cpu = new Map<string, number>();
  let named = 0;
  for (const row of breakdown.cpu) {
    const group = cpuGroupOf(row.name);
    cpu.set(group, (cpu.get(group) ?? 0) + row.avgMs);
    named += row.avgMs;
  }
  const untimed = breakdown.work.avg - named;
  if (untimed > 0) cpu.set(UNATTRIBUTED, untimed);
  const between = breakdown.frame.avg - breakdown.work.avg;
  if (between > 0) cpu.set(BETWEEN, between);
  const gpu = new Map<string, number>();
  for (const pass of (gpuWork ?? breakdown).passes) {
    const group = gpuGroupOf(pass.name);
    gpu.set(group, (gpu.get(group) ?? 0) + pass.avgMs);
  }
  return { cpu, gpu };
}

/** One engine-level work item across games. */
export interface WorkItem {
  group: string;
  side: "CPU" | "GPU" | "GC";
  /** Games where this group costs at least {@link BLOCKING_SHARE} of the budget. */
  blocks: string[];
  /** Sum of the group's average ms per frame over every game. */
  totalMs: number;
  /** Average ms per frame in each game that has it. */
  perGame: Map<string, number>;
}

/** Group every game's costs and rank the groups: most games blocked first, then most ms. */
export function workItems(entries: readonly FpsGapEntry[]): WorkItem[] {
  const items = new Map<string, WorkItem>();
  const add = (group: string, side: WorkItem["side"], game: string, ms: number) => {
    const key = `${side}\t${group}`;
    const item = items.get(key) ?? { group, side, blocks: [], totalMs: 0, perGame: new Map<string, number>() };
    item.perGame.set(game, (item.perGame.get(game) ?? 0) + ms);
    item.totalMs += ms;
    items.set(key, item);
  };
  for (const { record } of entries) {
    const breakdown = record.breakdown;
    if (breakdown === null || breakdown === undefined) continue;
    const { cpu, gpu } = groupCosts(breakdown, record.gpuWork);
    for (const [group, ms] of cpu) add(group, "CPU", record.game, ms);
    for (const [group, ms] of gpu) add(group, "GPU", record.game, ms);
    // Garbage the window collected, spread over its frames: the per-frame share of collection pauses
    // is not measured directly, so this item is ranked by games and megabytes instead (see gcPer8s).
    const gc = gcPer8s(breakdown);
    if (gc > 0) add("garbage per 8 s (MB)", "GC", record.game, gc);
  }
  const threshold = FPS_GAP_BUDGET_MS * BLOCKING_SHARE;
  for (const item of items.values()) {
    const limit = item.side === "GC" ? 8 : threshold;
    item.blocks = [...item.perGame].filter(([, ms]) => ms >= limit).map(([game]) => game).sort();
  }
  // Garbage is megabytes, not ms, so among items blocking as many games it ranks after the timed ones.
  const msKey = (item: WorkItem) => (item.side === "GC" ? -1 : item.totalMs);
  return [...items.values()].sort((a, b) => b.blocks.length - a.blocks.length || msKey(b) - msKey(a) || a.group.localeCompare(b.group));
}

/** Megabytes the window's collections freed, scaled to 8 seconds of play. */
export function gcPer8s(breakdown: Pick<FrameBreakdownSummary, "counts" | "seconds">): number {
  return breakdown.seconds > 0 ? Math.round((breakdown.counts.gcMb * 8) / breakdown.seconds) : 0;
}

/** The larger of CPU and GPU p50: what a frame costs when the two overlap fully. */
export function frameCost(breakdown: Pick<FrameBreakdownSummary, "work" | "gpu">): { ms: number; bound: "CPU" | "GPU" } {
  const gpu = breakdown.gpu?.p50 ?? 0;
  return breakdown.work.p50 >= gpu ? { ms: breakdown.work.p50, bound: "CPU" } : { ms: gpu, bound: "GPU" };
}

type Table = { head: string[]; rows: string[][] };

function renderTable(table: Table, markdown: boolean): string {
  if (markdown) {
    const line = (cells: readonly string[]) => `| ${cells.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`;
    return [line(table.head), line(table.head.map(() => "---")), ...table.rows.map(line)].join("\n");
  }
  const widths = table.head.map((cell, column) => Math.max(cell.length, ...table.rows.map((row) => (row[column] ?? "").length)));
  const line = (cells: readonly string[]) => cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ").trimEnd();
  return [line(table.head), ...table.rows.map(line)].join("\n");
}

const ms2 = (value: number) => value.toFixed(2);
const top = (costs: readonly NamedCost[], count: number) => costs.slice(0, count).map((cost) => `${shortName(cost.name)} ${cost.avgMs.toFixed(2)}`).join("; ");

/** A breakdown row name without its frame label or package prefix, short enough for a table cell. */
export function shortName(name: string): string {
  const owner = name.split(" | ")[0] ?? name;
  const match = /^frame#\d+(?::(\S+))?\s+(\S+)/.exec(owner);
  if (match === null) return owner;
  const file = (match[2] ?? "").replace(/^packages\/[^/]+\/src\//, "").replace(/:\d+$/, "");
  return match[1] === undefined ? file : `${file} (${match[1]})`;
}

/** The whole report: conditions, the per-game table, each game's top costs, and the ranked work items. */
export function renderFpsGapReport(entries: readonly FpsGapEntry[], options: { markdown: boolean }): string {
  const { markdown } = options;
  const out: string[] = [];
  const first = entries[0]?.record;
  // The engine each record was measured on, not the checkout printing it: `--reuse` reads old records.
  const engines = [...new Set(entries.flatMap((entry) => {
    const engine = entry.record.engine;
    return engine?.commit == null ? [] : [`${engine.commit.slice(0, 9)}${engine.dirty === true ? " (dirty)" : ""}`];
  }))];
  const budget = ms2(FPS_GAP_BUDGET_MS);
  out.push(`360 fps gap: every cost against the ${budget} ms frame (360 fps). ${entries.length} games.`);
  if (first !== undefined) out.push(`Conditions: ${first.viewport}, ${first.quality} tier, ${first.frameClock} clock, path ${first.path ?? "still"}, ${first.gpu}${engines.length === 0 ? "" : `, engine ${engines.join(" and ")}`}${machineClause(first.machine)}.`);
  out.push("CPU is main-thread work per frame and GPU the timer-query sum of the passes; cost is the larger p50, so 'x budget' and 'ceiling fps' assume the two overlap fully.");
  out.push("GPU is the GPU's work: a second window on the same path times every draw and clear on its own ('GPU span' is the frame window's pass timers, which also count the GPU idle while the CPU submits; a record without the draw-timed window shows its span in both).");
  out.push("These are the dev server's build (development React, unminified modules) in headless Chrome; a production desktop build spends less CPU (`bun run perf desktop --launch <app.exe> --uncapped`).", "");

  const summary: Table = { head: ["game", "frame p50", "p95", "p99", "CPU p50", "GPU p50", "GPU span p50", "bound", "x budget", "ceiling fps", "draws", "triangles", "nodes", "GC MB/8s", "hitches"], rows: [] };
  for (const { record } of entries) {
    const b = record.breakdown;
    if (b === null || b === undefined) {
      summary.rows.push([record.game, `${ms2(record.frame.avgMs)} avg`, ms2(record.frame.p95Ms), "-", "-", "-", "-", "-", "-", "-", String(record.render.drawsFrame ?? "-"), String(record.render.triangles ?? "-"), String(record.render.nodes ?? "-"), "-", String(record.frame.longFrames)]);
      continue;
    }
    const gpu = (record.gpuWork ?? b).gpu;
    const cost = frameCost({ work: b.work, gpu });
    summary.rows.push([
      record.game,
      ms2(b.frame.p50), ms2(b.frame.p95), ms2(b.frame.p99),
      ms2(b.work.p50), gpu === null ? "n/a" : ms2(gpu.p50), b.gpu === null ? "n/a" : ms2(b.gpu.p50),
      cost.bound,
      `${(cost.ms / FPS_GAP_BUDGET_MS).toFixed(1)}x`,
      String(Math.round(1000 / Math.max(cost.ms, 0.01))),
      String(Math.round(b.counts.drawsAvg)), String(Math.round(b.counts.trianglesAvg)), String(record.render.nodes ?? "-"),
      String(gcPer8s(b)),
      String(b.hitches.length),
    ]);
  }
  out.push(renderTable(summary, markdown), "");

  const detail: Table = { head: ["game", "top CPU (avg ms)", "top GPU passes (avg ms)", "main thread by layer (sampled %)", "top allocators (MB/s)"], rows: [] };
  for (const { record, layers, allocators } of entries) {
    const b = record.breakdown;
    detail.rows.push([
      record.game,
      b === null || b === undefined ? "-" : top(b.cpu, 4),
      b === null || b === undefined ? "-" : top((record.gpuWork ?? b).passes, 3),
      layers.slice(0, 4).map((layer) => `${layer.layer} ${layer.pct}`).join("; "),
      allocators.slice(0, 3).map((entry) => `${entry.fn} ${entry.mbPerSecond}`).join("; "),
    ]);
  }
  out.push(renderTable(detail, markdown), "");

  const items = workItems(entries);
  const ranked: Table = { head: ["work item", "side", "games blocked", "total ms", "worst game"], rows: [] };
  for (const item of items) {
    const [worstGame, worstMs] = [...item.perGame].sort((a, b) => b[1] - a[1])[0] ?? ["-", 0];
    const unit = item.side === "GC" ? " MB" : " ms";
    ranked.rows.push([item.group, item.side, `${item.blocks.length}/${entries.length}`, item.side === "GC" ? `${Math.round(item.totalMs)} MB` : ms2(item.totalMs), `${worstGame} ${item.side === "GC" ? Math.round(worstMs) : ms2(worstMs)}${unit}`]);
  }
  out.push(`Engine work items: a game is blocked by an item costing >= ${ms2(FPS_GAP_BUDGET_MS * BLOCKING_SHARE)} ms a frame (10% of the budget), or >= 8 MB of garbage per 8 s.`);
  out.push(renderTable(ranked, markdown));
  return out.join("\n");
}

/** Where one backend's entries are saved: WebGL at the records root as before, WebGPU in a folder of its own. */
export function recordsFor(records: string, backend: RendererBackend): string {
  return backend === "webgl" ? records : join(records, backend);
}

/**
 * Frame times per game on each backend side by side. A backend that fell back to WebGL is named,
 * so a WebGPU column never silently holds WebGL numbers.
 */
export function renderBackendComparison(byBackend: ReadonlyMap<RendererBackend, readonly FpsGapEntry[]>, options: { markdown: boolean }): string {
  const backends = [...byBackend.keys()];
  const games = [...new Set(backends.flatMap((backend) => byBackend.get(backend)!.map((entry) => entry.record.game)))];
  const head = ["game", ...backends.flatMap((backend) => [`${backend} p50`, `${backend} p99`]), ...(backends.length === 2 ? [`p50 change`] : []), "notes"];
  const rows = games.map((game) => {
    const cells: string[] = [game];
    const p50s: (number | null)[] = [];
    const notes: string[] = [];
    for (const backend of backends) {
      const record = byBackend.get(backend)!.find((entry) => entry.record.game === game)?.record;
      const frame = record?.breakdown?.frame;
      cells.push(frame === undefined ? "-" : ms2(frame.p50), frame === undefined ? "-" : ms2(frame.p99));
      const drawing = record?.backend?.drawing;
      if (record !== undefined && drawing !== undefined && drawing !== backend) notes.push(`${backend} run drew with ${drawing}`);
      // Dropped GPU work draws less than the game asked for, so its frame times are kept out of the change.
      const errors = gpuErrors(record?.backend).length;
      const warnings = (record?.backend?.warnings.length ?? 0) - errors;
      if (errors > 0) notes.push(`${backend}: ${errors} WebGPU errors, GPU work dropped, not comparable`);
      if (warnings > 0) notes.push(`${backend}: ${warnings} warnings`);
      p50s.push(errors > 0 ? null : frame?.p50 ?? null);
    }
    if (backends.length === 2) {
      const [a, b] = p50s;
      cells.push(a == null || b == null ? "-" : `${b <= a ? "" : "+"}${Math.round(((b - a) / a) * 100)}%`);
    }
    cells.push(notes.join("; ") || "-");
    return cells;
  });
  return renderTable({ head, rows }, options.markdown);
}

/** Saved entries in `dir`, one per game asked for; a missing one is named rather than skipped. */
export function readEntries(dir: string, games: readonly string[]): { entries: FpsGapEntry[]; missing: string[] } {
  const entries: FpsGapEntry[] = [];
  const missing: string[] = [];
  const available = existsSync(dir) ? new Set(readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5))) : new Set<string>();
  for (const game of games) {
    if (!available.has(game)) { missing.push(game); continue; }
    entries.push(JSON.parse(readFileSync(join(dir, `${game}.json`), "utf8")) as FpsGapEntry);
  }
  return { entries, missing };
}

async function measureAll(args: FpsGapArgs, backend: RendererBackend, engine: PerfRecord["engine"]): Promise<string[]> {
  const started: Awaited<ReturnType<typeof ensureDevServer>>[] = [];
  const failed: string[] = [];
  const records = recordsFor(args.records, backend);
  let previous: string | null = null;
  try {
    for (const [index, game] of args.games.entries()) {
      console.error(`perf fps-gap: ${game} on ${backend} (${index + 1}/${args.games.length})`);
      let releaseLock = (): void => {};
      try {
        // The lock first: this game's server check and Chrome launch sit inside it, so a server
        // obtained before a long wait cannot be gone after it.
        releaseLock = await acquirePerfLock(`perf fps-gap ${game}`);
        // Checked before every game: a dev server that died under the last one is restarted, and named,
        // instead of every remaining game failing on a refused connection.
        const server = await ensureDevServer(repoRoot);
        if (server.pid !== undefined) {
          if (index > 0) console.error(`perf fps-gap: the dev server was down after ${previous ?? "the previous game"}; started a new one`);
          started.push(server);
        }
        previous = game;
        const exit = await withBrowserSession(
          // Frame window, profile window and the draw-timed GPU window.
          // The frame time is the product, so the browser draws at normal priority (scripts/perf.ts).
          { keep: false, timeoutMs: 180_000, hardDeadlineMs: gameSessionDeadlineMs(WARMUP_MS, args.seconds * 2 + GPU_WORK_SECONDS), frameClock: "uncapped", chromePriority: "normal" },
          async ({ debugPort }) => {
            const session = await openPageSession(debugPort);
            try {
              const measured = await measureGame({
                session,
                base: server.base,
                game,
                quality: "high",
                seconds: args.seconds,
                warmupMs: WARMUP_MS,
                profile: true,
                allocations: true,
                frameClock: "uncapped",
                path: "walk",
                settings: [parseSettingSpec("graphics.auto=false"), parseSettingSpec(`renderer=${backend}`)],
                size: GATE_SIZE,
                breakdownTop: BREAKDOWN_TOP,
                gpuWork: true,
              });
              if (measured.record.breakdown === null || measured.record.breakdown === undefined) {
                throw new Error("the page installed no frame breakdown, so CPU, GPU and their groups are unknown; measure it again");
              }
              if (engine !== undefined) measured.record.engine = engine;
              const entry: FpsGapEntry = {
                record: measured.record,
                layers: measured.profile === null ? [] : profileLayers(measured.profile),
                allocators: measured.allocators ?? [],
              };
              mkdirSync(records, { recursive: true });
              writeFileSync(join(records, `${game}.json`), `${JSON.stringify(entry, null, 2)}\n`);
              const b = measured.record.breakdown;
              console.error(`perf fps-gap: ${game} frame p50 ${b?.frame.p50 ?? measured.record.frame.avgMs} ms, CPU ${b?.work.p50 ?? "?"} ms, GPU ${b?.gpu?.p50 ?? "?"} ms`);
            } finally {
              await session.close();
            }
          },
        );
        if (exit !== 0) failed.push(game);
      } catch (error) {
        console.error(`perf fps-gap: ${game} could not be measured — ${error instanceof Error ? error.message : String(error)}`);
        failed.push(game);
      } finally {
        releaseLock();
      }
    }
  } finally {
    for (const server of started) {
      killProcessTree(server.child ?? null);
      killPid(server.pid, true);
    }
  }
  return failed;
}

async function main(): Promise<void> {
  const parsed = parseFpsGapArgs(process.argv.slice(2));
  if (parsed === "help") {
    console.log(USAGE);
    return;
  }
  const identity = resolveEngineIdentity();
  console.error(identity.line);
  const engine = engineRecord(identity) ?? undefined;
  const byBackend = new Map<RendererBackend, FpsGapEntry[]>();
  for (const backend of parsed.renderers) {
    const failed = parsed.reuse ? [] : await measureAll(parsed, backend, engine);
    const { entries, missing } = readEntries(recordsFor(parsed.records, backend), parsed.games.filter((game) => !failed.includes(game)));
    byBackend.set(backend, entries);
    if (parsed.renderers.length > 1) console.log(`\n## ${backend}\n`);
    console.log(renderFpsGapReport(entries, { markdown: parsed.markdown }));
    const absent = [...failed, ...missing];
    if (absent.length > 0) {
      console.error(`perf fps-gap: no ${backend} measurement for ${absent.join(", ")}`);
      process.exitCode = 1;
    }
  }
  if (byBackend.size > 1) console.log(`\nFrame time by backend (same walk, same conditions):\n\n${renderBackendComparison(byBackend, { markdown: parsed.markdown })}`);
}

if (import.meta.main) await main();
