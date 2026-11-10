import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cpus, homedir } from "node:os";
import { join } from "node:path";

import type { PerfBuild } from "./prodServer";

/**
 * What a player feels, from one measured game: the slow frames and not only the middle one, the
 * hitches, where the main thread goes by package (React, react-three-fiber, three, the engine, the
 * game), garbage, the same frames on a CPU four times slower, and the load. `bun run perf <game>` and
 * `bun run perf ab` both lead with it, for the dev server's build unless `--production` asks for the
 * one players get (`scripts/prodServer.ts`).
 */

/** Frame budgets a hitch is counted against: one 60 Hz frame, and two. */
export const HITCH_MS = [16.7, 33.3] as const;
/** The slowdown of the slow-CPU window, the stand-in for a laptop or phone (Chrome's CPU throttling); `--cpu` changes it. */
export const SLOW_CPU_RATE = 4;

export interface FrameScore {
  frames: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  worstMs: number;
  /** Frames longer than 16.7 ms in the window. */
  over16: number;
  /** Frames longer than 33.3 ms in the window. */
  over33: number;
  seconds: number;
}

const round = (value: number, digits = 2): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

/** Percentiles, the worst frame and the hitch counts of one window of frame times. */
export function frameScore(deltas: readonly number[]): FrameScore {
  const kept = deltas.filter((ms) => Number.isFinite(ms) && ms > 0).sort((a, b) => a - b);
  if (kept.length === 0) return { frames: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, worstMs: 0, over16: 0, over33: 0, seconds: 0 };
  const at = (fraction: number) => kept[Math.min(kept.length - 1, Math.floor(kept.length * fraction))]!;
  return {
    frames: kept.length,
    p50Ms: round(at(0.5)),
    p95Ms: round(at(0.95)),
    p99Ms: round(at(0.99)),
    worstMs: round(kept[kept.length - 1]!),
    over16: kept.filter((ms) => ms > HITCH_MS[0]).length,
    over33: kept.filter((ms) => ms > HITCH_MS[1]).length,
    seconds: round(kept.reduce((sum, ms) => sum + ms, 0) / 1000, 1),
  };
}

/** Whose code a profile frame is. `browser` is everything with no script: natives, GC, the compositor. */
export type CodeOwner = "react" | "ui" | "r3f" | "drei" | "three" | "engine" | "game" | "library" | "browser";
export const CODE_OWNERS: readonly CodeOwner[] = ["react", "ui", "r3f", "drei", "three", "engine", "game", "library", "browser"];

/**
 * Whose code a source path is. react-three-fiber bundles its own reconciler, so `react-reconciler`,
 * `its-fine` and `suspend-react` count as r3f: they leave with it.
 */
export function codeOwner(source: string): CodeOwner {
  const path = source.replaceAll("\\", "/");
  if (/(?:^|\/)packages\/(?:ui\/|core\/src\/ui\/(?:jsx\/|rune\/|runeUi\.))/.test(path) || /(?:^|\/)(?:jg-ui\/|jg_ui(?:_bg)?\.(?:js|wasm))/.test(path)) return "ui";
  // Vite's dev server pre-bundles a dependency into one file named for it, when no source map says more.
  const dep = /\/\.vite\/deps\/([^/?]+?)\.js/.exec(path)?.[1];
  if (dep !== undefined) {
    if (/^(react|react-dom|scheduler)(_|$)/.test(dep)) return "react";
    if (/^@react-three_fiber/.test(dep)) return "r3f";
    if (/^@react-three_drei/.test(dep)) return "drei";
    if (/^three(_|$)/.test(dep)) return "three";
    return "library";
  }
  const modules = path.lastIndexOf("/node_modules/");
  if (modules >= 0) {
    const rest = path.slice(modules + "/node_modules/".length);
    const name = rest.startsWith("@") ? rest.split("/").slice(0, 2).join("/") : rest.split("/")[0] ?? "";
    if (name === "@jgengine/ui" || /^@jgengine\/core\/(?:dist\/|src\/)?ui\/(?:jsx\/|rune\/|runeUi\.)/.test(rest)) return "ui";
    if (name === "react" || name === "react-dom" || name === "scheduler") return "react";
    if (name === "@react-three/fiber" || name === "react-reconciler" || name === "its-fine" || name === "suspend-react") return "r3f";
    if (name === "@react-three/drei") return "drei";
    if (name === "three" || name === "three-stdlib") return "three";
    return "library";
  }
  if (/(^|\/)games\/[^/]+\//.test(path)) return "game";
  if (/(^|\/)(packages|apps|examples|registry)\//.test(path) || /^\/src\//.test(path)) return "engine";
  return path.length === 0 ? "browser" : "library";
}

const VLQ = new Map([..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"].map((char, index) => [char.charCodeAt(0), index]));

/** A source map reduced to what a profile needs: per generated line, each segment's column and source. */
export interface DecodedMap {
  sources: string[];
  /** Per generated line, `[column, sourceIndex]` pairs flattened, columns ascending. */
  lines: Int32Array[];
}

/** Decode a source map's `mappings` to column → source per generated line. */
export function decodeSourceMap(map: { sources?: readonly string[]; mappings?: string }): DecodedMap {
  const mappings = map.mappings ?? "";
  const lines: Int32Array[] = [];
  let line: number[] = [];
  let column = 0;
  let source = 0;
  let field = 0;
  let value = 0;
  let shift = 0;
  let hasSource = false;
  const endSegment = () => {
    if (field > 0 && hasSource) line.push(column, source);
    field = 0;
    hasSource = false;
  };
  for (let index = 0; index < mappings.length; index += 1) {
    const code = mappings.charCodeAt(index);
    if (code === 44 /* , */) { endSegment(); continue; }
    if (code === 59 /* ; */) {
      endSegment();
      lines.push(Int32Array.from(line));
      line = [];
      column = 0;
      continue;
    }
    const digit = VLQ.get(code);
    if (digit === undefined) continue;
    value += (digit & 31) << shift;
    if ((digit & 32) !== 0) { shift += 5; continue; }
    const decoded = (value & 1) === 1 ? -(value >>> 1) : value >>> 1;
    value = 0;
    shift = 0;
    if (field === 0) column += decoded;
    else if (field === 1) { source += decoded; hasSource = true; }
    field += 1;
  }
  endSegment();
  lines.push(Int32Array.from(line));
  return { sources: [...(map.sources ?? [])], lines };
}

/** The source file of a generated position: the segment at or before the column, else the line's first. */
export function sourceAt(map: DecodedMap, line: number, column: number): string | null {
  const segments = map.lines[line];
  if (segments === undefined || segments.length === 0) return null;
  let low = 0;
  let high = segments.length / 2 - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (segments[middle * 2]! <= column) low = middle;
    else high = middle - 1;
  }
  return map.sources[segments[low * 2 + 1]!] ?? null;
}

interface ScoredNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
  children?: number[];
}

export interface ProfileScore {
  /** Main-thread time the profile saw, idle included, in ms. */
  totalMs: number;
  /** Main-thread time that was not idle: scripts, natives, GC and the browser's own work. */
  busyMs: number;
  /** Self time per owner, ms over the window. */
  selfMs: Record<CodeOwner, number>;
  /** Time with a React frame anywhere on the stack: React's own work and every component it renders. */
  reactInclusiveMs: number;
  /** Engine UI runtime, Rune bridge and wasm, including component callbacks underneath them. */
  uiInclusiveMs: number;
  /**
   * Time with a react-three-fiber frame anywhere on the stack. r3f owns the frame loop, so the whole
   * render (three, the engine's per-frame work) runs under it: this is what r3f drives, not what it costs.
   */
  r3fInclusiveMs: number;
  /** Time in the garbage collector. */
  gcMs: number;
  /** Self time in React's development build (`jsxDEV`, `*.development.js`): zero in the build players get. */
  devReactMs: number;
}

/**
 * Split a CPU profile's main-thread time by whose code ran. `sourceOf` names the source file of a
 * frame (through the chunk's source map in a production build), or null to judge by the frame's URL.
 */
export function scoreProfile(
  profile: { nodes: readonly ScoredNode[]; samples: readonly number[]; timeDeltas: readonly number[] },
  sourceOf: (url: string, line: number, column: number) => string | null,
): ProfileScore {
  const byId = new Map<number, ScoredNode>(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const info = new Map<number, { owner: CodeOwner; dev: boolean; underReact: boolean; underUi: boolean; underR3f: boolean }>();
  const resolveNode = (id: number): { owner: CodeOwner; dev: boolean; underReact: boolean; underUi: boolean; underR3f: boolean } => {
    const known = info.get(id);
    if (known !== undefined) return known;
    const node = byId.get(id);
    const up = parent.get(id);
    const above = up === undefined ? { underReact: false, underUi: false, underR3f: false } : resolveNode(up);
    const frame = node?.callFrame;
    const url = frame?.url ?? "";
    const source = url === "" || frame === undefined ? "" : sourceOf(url, frame.lineNumber, frame.columnNumber) ?? url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "");
    const owner = url === "" ? "browser" : codeOwner(source);
    const dev = owner === "react" && (/jsx-dev-runtime|\.development\.js|react-refresh/.test(source) || /^jsxDEV/.test(frame?.functionName ?? ""));
    const resolved = { owner, dev, underReact: above.underReact || owner === "react", underUi: above.underUi || owner === "ui", underR3f: above.underR3f || owner === "r3f" };
    info.set(id, resolved);
    return resolved;
  };
  const selfUs: Record<CodeOwner, number> = { react: 0, ui: 0, r3f: 0, drei: 0, three: 0, engine: 0, game: 0, library: 0, browser: 0 };
  let totalUs = 0;
  let idleUs = 0;
  let gcUs = 0;
  let reactUs = 0;
  let uiUs = 0;
  let r3fUs = 0;
  let devUs = 0;
  profile.samples.forEach((id, index) => {
    const us = profile.timeDeltas[index] ?? 0;
    totalUs += us;
    const name = byId.get(id)?.callFrame.functionName ?? "";
    if (name === "(idle)") { idleUs += us; return; }
    if (name === "(garbage collector)") gcUs += us;
    const node = resolveNode(id);
    selfUs[node.owner] += us;
    if (node.underReact) reactUs += us;
    if (node.underUi) uiUs += us;
    if (node.underR3f) r3fUs += us;
    if (node.dev) devUs += us;
  });
  const ms = (us: number) => round(us / 1000, 1);
  return {
    totalMs: ms(totalUs),
    busyMs: ms(totalUs - idleUs),
    selfMs: Object.fromEntries(CODE_OWNERS.map((owner) => [owner, ms(selfUs[owner])])) as Record<CodeOwner, number>,
    reactInclusiveMs: ms(reactUs),
    uiInclusiveMs: ms(uiUs),
    r3fInclusiveMs: ms(r3fUs),
    gcMs: ms(gcUs),
    devReactMs: ms(devUs),
  };
}

/**
 * The source-file lookup for a profile's frames. A production chunk is named through the `.map` the
 * build wrote beside it; a dev-server dependency bundle through the map the dev server serves. Maps are
 * read once per script.
 */
export async function profileSources(
  urls: Iterable<string>,
  options: { outDir?: string | undefined },
): Promise<(url: string, line: number, column: number) => string | null> {
  const maps = new Map<string, DecodedMap | null>();
  for (const url of new Set(urls)) {
    if (url === "" || maps.has(url)) continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      maps.set(url, null);
      continue;
    }
    let text: string | null = null;
    if (options.outDir !== undefined) {
      const file = join(options.outDir, decodeURIComponent(parsed.pathname)) + ".map";
      if (existsSync(file)) text = readFileSync(file, "utf8");
      // Without its map a chunk's every frame would be counted as some unnamed library.
      else if (/\/assets\/[^/]+\.js$/.test(parsed.pathname)) throw new Error(`no source map for ${parsed.pathname} in ${options.outDir}, so the profile cannot be split by package`);
    } else if (parsed.pathname.includes("/.vite/deps/")) {
      try {
        const response = await fetch(`${parsed.origin}${parsed.pathname}.map`, { signal: AbortSignal.timeout(10_000) });
        if (response.ok) text = await response.text();
      } catch {
        text = null;
      }
    }
    let decoded: DecodedMap | null = null;
    if (text !== null) {
      try {
        decoded = decodeSourceMap(JSON.parse(text) as { sources?: string[]; mappings?: string });
      } catch {
        decoded = null;
      }
    }
    maps.set(url, decoded);
  }
  return (url, line, column) => {
    const map = maps.get(url);
    return map === null || map === undefined ? null : sourceAt(map, line, column);
  };
}

/** What a page downloaded to become playable, read from its resource timing. */
export interface LoadScore {
  /** Ms from navigation to the page reporting itself ready to play (assets in, shaders warmed). */
  readyMs: number;
  requests: number;
  /** Bytes over the wire (compressed where the server compresses) of scripts. */
  jsBytes: number;
  wasmBytes: number;
  totalBytes: number;
  /** Script requests, and how many of them were unbundled source modules (zero in a production build). */
  scripts: number;
  sourceModules: number;
}

/** Reads every resource the page has fetched so far: `[url, encodedBodySize]` pairs, the document included. */
export const LOAD_RESOURCES_SCRIPT = `(() => {
  const out = [];
  for (const entry of [...performance.getEntriesByType("navigation"), ...performance.getEntriesByType("resource")]) {
    out.push([entry.name, entry.encodedBodySize || 0]);
  }
  return out;
})()`;

/** Sum a page's downloads by kind. A script outside the build's `assets/` folder is a source module. */
export function loadScore(resources: ReadonlyArray<readonly [string, number]>, readyMs: number): LoadScore {
  let jsBytes = 0;
  let wasmBytes = 0;
  let totalBytes = 0;
  let scripts = 0;
  let sourceModules = 0;
  for (const [url, bytes] of resources) {
    const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "");
    totalBytes += bytes;
    if (/\.wasm$/.test(path)) wasmBytes += bytes;
    else if (/\.(m?js|tsx?|jsx)$/.test(path) || /^\/@(id|vite|fs|react-refresh)/.test(path)) {
      jsBytes += bytes;
      scripts += 1;
      if (!/\/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.js$/.test(path)) sourceModules += 1;
    }
  }
  return { readyMs: Math.round(readyMs), requests: resources.length, jsBytes, wasmBytes, totalBytes, scripts, sourceModules };
}

/** Share of all cores busy over `ms`, as a percent: what else the PC was doing when a run started. */
export async function cpuBusyPct(ms = 1_000): Promise<number> {
  const read = () => cpus().reduce((sum, cpu) => {
    const { user, nice, sys, idle, irq } = cpu.times;
    return { busy: sum.busy + user + nice + sys + irq, all: sum.all + user + nice + sys + irq + idle };
  }, { busy: 0, all: 0 });
  const before = read();
  await new Promise((done) => setTimeout(done, ms));
  const after = read();
  return after.all === before.all ? 0 : Math.round(((after.busy - before.busy) / (after.all - before.all)) * 100);
}

/** One game on one build at one CPU speed: everything the scorecard prints. */
export interface Scorecard {
  build: PerfBuild;
  /**
   * The same page and path a moment later with its CPU slowed `rate` times (Chrome's CPU throttling):
   * a stand-in for a laptop or phone, since a fast desktop hides main-thread cost. Null when not run.
   */
  slow: { rate: number; frame: FrameScore } | null;
  /** Percent of the PC's cores busy just before the page loaded. */
  pcBusyPct: number;
  frame: FrameScore;
  /** Null when the run took no CPU profile. */
  main: {
    /** Busy main-thread ms per frame over the profiled window. */
    msPerFrame: number;
    frames: number;
    reactSelfPct: number;
    reactInclusivePct: number;
    uiSelfPct: number;
    uiInclusivePct: number;
    uiSelfMsPerFrame: number;
    uiInclusiveMsPerFrame: number;
    r3fSelfPct: number;
    r3fInclusivePct: number;
    reactSelfMsPerFrame: number;
    r3fSelfMsPerFrame: number;
    /** Self time per owner as a percent of the busy main thread. */
    selfPct: Record<CodeOwner, number>;
    gcMsPerSecond: number;
    gcPct: number;
    /** MB allocated per second of play (sampled), or null when allocations were not sampled. */
    allocatedMbPerSecond: number | null;
    devReactMs: number;
  } | null;
  load: LoadScore | null;
}

/** Fold a profile, its frame count and what it allocated into the scorecard's main-thread block. */
export function mainScore(profile: ProfileScore, frames: number, seconds: number, allocatedBytes: number | null): NonNullable<Scorecard["main"]> {
  const busy = Math.max(profile.busyMs, 0.001);
  const pct = (ms: number) => round((ms / busy) * 100, 1);
  const perFrame = (ms: number) => (frames > 0 ? round(ms / frames, 3) : 0);
  return {
    msPerFrame: perFrame(profile.busyMs),
    frames,
    reactSelfPct: pct(profile.selfMs.react),
    reactInclusivePct: pct(profile.reactInclusiveMs),
    uiSelfPct: pct(profile.selfMs.ui),
    uiInclusivePct: pct(profile.uiInclusiveMs),
    uiSelfMsPerFrame: perFrame(profile.selfMs.ui),
    uiInclusiveMsPerFrame: perFrame(profile.uiInclusiveMs),
    r3fSelfPct: pct(profile.selfMs.r3f),
    r3fInclusivePct: pct(profile.r3fInclusiveMs),
    reactSelfMsPerFrame: perFrame(profile.selfMs.react),
    r3fSelfMsPerFrame: perFrame(profile.selfMs.r3f),
    selfPct: Object.fromEntries(CODE_OWNERS.map((owner) => [owner, pct(profile.selfMs[owner])])) as Record<CodeOwner, number>,
    gcMsPerSecond: seconds > 0 ? round(profile.gcMs / seconds, 1) : 0,
    gcPct: pct(profile.gcMs),
    allocatedMbPerSecond: allocatedBytes === null || seconds <= 0 ? null : round(allocatedBytes / 1_048_576 / seconds, 2),
    devReactMs: profile.devReactMs,
  };
}

/**
 * Why a run that asked for the production build did not measure one, or null when it did: React's
 * development build ran, or the page loaded source modules instead of bundled chunks.
 */
export function productionProblem(card: Scorecard): string | null {
  if (card.build !== "production") return null;
  if (card.main !== null && card.main.devReactMs > 0) return `${card.main.devReactMs} ms of the profile ran React's development build (jsxDEV)`;
  if (card.load !== null && card.load.sourceModules > 0) return `${card.load.sourceModules} of ${card.load.scripts} scripts were source modules, not bundled chunks`;
  if (card.load !== null && card.load.scripts === 0) return "the page loaded no scripts the harness could see";
  return null;
}

const kb = (bytes: number): string => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(2)} MB` : `${Math.round(bytes / 1024)} KB`);

/** A column of the printed scorecard: a heading and the card under it, or null for a run that failed. */
export interface ScorecardColumn {
  label: string;
  card: Scorecard | null;
}

/** The scorecard's rows, one value per column: the table `perf` and `perf ab` both lead with. */
export function scorecardRows(columns: readonly ScorecardColumn[]): string[][] {
  const row = (name: string, value: (card: Scorecard) => string): string[] => [name, ...columns.map(({ card }) => (card === null ? "failed" : value(card)))];
  const main = (value: (main: NonNullable<Scorecard["main"]>) => string) => (card: Scorecard) => (card.main === null ? "-" : value(card.main));
  const load = (value: (load: LoadScore) => string) => (card: Scorecard) => (card.load === null ? "-" : value(card.load));
  const slow = (value: (frame: FrameScore) => string) => (card: Scorecard) => (card.slow === null ? "-" : value(card.slow.frame));
  const rate = columns.find(({ card }) => card !== null && card.slow !== null)?.card?.slow?.rate ?? SLOW_CPU_RATE;
  return [
    row("frame p50 ms", (card) => card.frame.p50Ms.toFixed(2)),
    row("frame p95 ms", (card) => card.frame.p95Ms.toFixed(2)),
    row("frame p99 ms", (card) => card.frame.p99Ms.toFixed(2)),
    row("worst frame ms", (card) => card.frame.worstMs.toFixed(1)),
    row("frames over 16.7 ms", (card) => `${card.frame.over16} of ${card.frame.frames}`),
    row("frames over 33 ms", (card) => `${card.frame.over33} of ${card.frame.frames}`),
    row("main thread ms/frame", main((value) => value.msPerFrame.toFixed(2))),
    row("React self", main((value) => `${value.reactSelfPct.toFixed(1)}% (${value.reactSelfMsPerFrame.toFixed(3)} ms)`)),
    row("React inclusive", main((value) => `${value.reactInclusivePct.toFixed(1)}%`)),
    row("engine UI self", main((value) => `${value.uiSelfPct.toFixed(1)}% (${value.uiSelfMsPerFrame.toFixed(3)} ms)`)),
    row("engine UI inclusive", main((value) => `${value.uiInclusivePct.toFixed(1)}% (${value.uiInclusiveMsPerFrame.toFixed(3)} ms)`)),
    row("r3f self", main((value) => `${value.r3fSelfPct.toFixed(1)}% (${value.r3fSelfMsPerFrame.toFixed(3)} ms)`)),
    row("r3f inclusive", main((value) => `${value.r3fInclusivePct.toFixed(1)}%`)),
    row("three / engine / game / browser", main((value) => `${value.selfPct.three.toFixed(0)}% / ${value.selfPct.engine.toFixed(0)}% / ${value.selfPct.game.toFixed(0)}% / ${value.selfPct.browser.toFixed(0)}%`)),
    row("allocated MB/s", main((value) => (value.allocatedMbPerSecond === null ? "-" : value.allocatedMbPerSecond.toFixed(2)))),
    row("GC ms per second", main((value) => `${value.gcMsPerSecond.toFixed(1)} (${value.gcPct.toFixed(1)}%)`)),
    row(`CPU ${rate}x slower: p50 / p95 ms`, slow((frame) => `${frame.p50Ms.toFixed(2)} / ${frame.p95Ms.toFixed(2)}`)),
    row(`CPU ${rate}x slower: p99 / worst ms`, slow((frame) => `${frame.p99Ms.toFixed(1)} / ${frame.worstMs.toFixed(1)}`)),
    row(`CPU ${rate}x slower: over 16.7 / 33 ms`, slow((frame) => `${frame.over16} / ${frame.over33} of ${frame.frames}`)),
    row("load to ready s", load((value) => (value.readyMs / 1000).toFixed(1))),
    row("download JS", load((value) => kb(value.jsBytes))),
    row("download wasm", load((value) => kb(value.wasmBytes))),
    row("download total", load((value) => `${kb(value.totalBytes)} in ${value.requests} requests`)),
    row("PC busy before run", (card) => `${card.pcBusyPct}%`),
  ];
}

/** The scorecard as a table: plain columns for a terminal, or Markdown for a PR. */
export function renderScorecard(columns: readonly ScorecardColumn[], markdown = false): string {
  const head = ["", ...columns.map((column) => column.label)];
  const rows = scorecardRows(columns);
  if (markdown) {
    const line = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;
    return [line(head), line(head.map((_, index) => (index === 0 ? "---" : "---:"))), ...rows.map(line)].join("\n");
  }
  const widths = head.map((cell, column) => Math.max(cell.length, ...rows.map((cells) => (cells[column] ?? "").length)));
  const line = (cells: readonly string[]) => cells.map((cell, column) => (column === 0 ? cell.padEnd(widths[column] ?? 0) : cell.padStart(widths[column] ?? 0))).join("  ").trimEnd();
  return [line(head), ...rows.map(line)].join("\n");
}

/** `production` or `dev`: how a scorecard column is headed. */
export function scorecardLabel(card: Pick<Scorecard, "build">): string {
  return card.build;
}

/** The scorecard as tally rows: `[metric, value, unit]`, a row left out where the run did not measure it. */
export function scorecardMetrics(card: Scorecard): Array<[string, number, string]> {
  const rows: Array<[string, number, string]> = [
    ["frame.p50", card.frame.p50Ms, "ms"],
    ["frame.p95", card.frame.p95Ms, "ms"],
    ["frame.p99", card.frame.p99Ms, "ms"],
    ["frame.worst", card.frame.worstMs, "ms"],
    ["hitches.over16", card.frame.over16, "frames"],
    ["hitches.over33", card.frame.over33, "frames"],
    ["pc.busy", card.pcBusyPct, "%"],
  ];
  if (card.main !== null) {
    rows.push(
      ["main.per_frame", card.main.msPerFrame, "ms"],
      ["react.self", card.main.reactSelfPct, "%"],
      ["react.inclusive", card.main.reactInclusivePct, "%"],
      ["ui.self", card.main.uiSelfPct, "%"],
      ["ui.inclusive", card.main.uiInclusivePct, "%"],
      ["ui.self_per_frame", card.main.uiSelfMsPerFrame, "ms"],
      ["ui.inclusive_per_frame", card.main.uiInclusiveMsPerFrame, "ms"],
      ["r3f.self", card.main.r3fSelfPct, "%"],
      ["r3f.inclusive", card.main.r3fInclusivePct, "%"],
      ["gc.per_second", card.main.gcMsPerSecond, "ms"],
    );
    if (card.main.allocatedMbPerSecond !== null) rows.push(["alloc.per_second", card.main.allocatedMbPerSecond, "MB"]);
  }
  if (card.slow !== null) {
    rows.push(
      [`slow${card.slow.rate}x.p50`, card.slow.frame.p50Ms, "ms"],
      [`slow${card.slow.rate}x.p95`, card.slow.frame.p95Ms, "ms"],
      [`slow${card.slow.rate}x.over16`, card.slow.frame.over16, "frames"],
      [`slow${card.slow.rate}x.over33`, card.slow.frame.over33, "frames"],
    );
  }
  if (card.load !== null) {
    rows.push(
      ["load.ready", card.load.readyMs, "ms"],
      ["download.js", Math.round(card.load.jsBytes / 1024), "KB"],
      ["download.wasm", Math.round(card.load.wasmBytes / 1024), "KB"],
      ["download.total", Math.round(card.load.totalBytes / 1024), "KB"],
    );
  }
  return rows;
}

/**
 * Record a scorecard in Jon's local tally store (`~/Projects/tally`, or `TALLY_CLI`): one row a metric,
 * the game as the task and the build as the side, so `tally compare dev production group=<group>` is
 * the before/after table. A machine without tally prints `degraded:` and records nothing.
 */
export function recordScorecardInTally(game: string, card: Scorecard, group: string): void {
  const cli = process.env["TALLY_CLI"] ?? join(homedir(), "Projects", "tally", "src", "cli.mjs");
  if (!existsSync(cli)) {
    console.error(`degraded: no tally at ${cli}, so ${game}'s scorecard was not recorded`);
    return;
  }
  for (const [metric, value, unit] of scorecardMetrics(card)) {
    const run = spawnSync(process.execPath, [cli, "record", "--metric", metric, "--value", String(value), "--unit", unit, "--task", game, "--side", card.build, "--group", group], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
    if (run.status !== 0) {
      console.error(`degraded: tally did not record ${game} ${metric}: ${`${run.stderr ?? ""}`.trim().slice(0, 200)}`);
      return;
    }
  }
}
