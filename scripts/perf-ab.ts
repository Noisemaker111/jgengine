import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve } from "node:path";

import { applyDevice, CdpSession, ensureDevServer, killPid, killProcessTree, navigateCapturePageWithRetry, openPageSession, withBrowserSession, type EnsureDevServerResult } from "./browser-lib";
import { FRAME_GAMES } from "./ci-scope";
import { ensureWorktreeReady } from "./agent-worktree";
import { startPath, type PerfPath } from "./perf-breakdown";
import { GATE_SIZE } from "./perf-gate";
import { acquirePerfLock } from "./perf-lock";
import { cappedClockProblem, PAGE_READY_MS, parseSettingSpec, perfPageUrl, perfSettingsScript, probeFrameClockMs, profiledWindow, SAMPLE_FRAMES_SCRIPT, slowCpuWindow, type PerfSettingOverride } from "./perf-play";
import { cpuBusyPct, frameScore, LOAD_RESOURCES_SCRIPT, loadScore, mainScore, productionProblem, profileSources, renderScorecard, scoreProfile, SLOW_CPU_RATE, type LoadScore, type Scorecard } from "./perf-scorecard";
import { ensureProdServer, type PerfBuild, type ProdServer } from "./prodServer";
import { treeFingerprint } from "./servedTree";
import { localGet } from "./localhostHttp";
import { currentPriority, restoreNormalPriority } from "./machine-priority";
import { resumeProcesses, suspendProcesses } from "./process-suspend";
import { provisionCapturedGame } from "./provisionCapture";

/**
 * Is the branch faster or slower than its base, per game, and by how much: one answer per game with a
 * confidence interval, in a few minutes of the perf lock.
 *
 *   bun run perf ab [--games a,b] [--base <ref|dir>] [--window s] [--blocks min,max] [--margin pct] [--markdown] [--production]
 *
 * Both sides are Vite dev servers unless `--production` asks for the build players get
 * (`scripts/prodServer.ts`), and the report leads with each side's scorecard (`scripts/perf-scorecard.ts`): the
 * slow frames and hitches of every window pooled, then one profiled window and one with the CPU slowed
 * 4x per side, and the load. The verdict table follows it.
 *
 * Both sides load once, each in a Chrome of its own, from their own checkouts and servers: the
 * base from a detached worktree at the base commit, the branch from this checkout. Then they take
 * turns in short windows, base, branch, base, ..., while the other side's renderer processes are
 * suspended (no frames, no CPU, no GPU work). Each branch window against the base windows either side
 * of it is one ratio. The run stops as soon as the 99% interval of the mean ratio answers the
 * question (excludes no change, or sits within the margin), or at the pair limit.
 *
 * The player stands still by default: on 2026-11-09 under the PC's usual load, a pair of standing
 * windows varied 5.1% and a pair of walking ones 10.5% (harbor-heat), so a walking answer within 4%
 * took about 55 pairs against 13. `--path walk` starts every window's walk from one spot, for a change
 * whose cost only shows in motion.
 *
 * Why not the four-run fps-gap A/B threads wrote by hand (beta, branch, branch, beta): each run
 * reloads the page, profiles and times the GPU, which a verdict does not need, and the same commit's
 * frame p50 moved 13-30% between runs minutes apart on this PC (fps-gap records, 2026-11-08), so two
 * runs a side could not resolve a 5% change. A beta number cached from an earlier run cannot either,
 * for the same reason, so the base is always measured beside the branch.
 */

// No trailing separator: the dev-server broker keys a server by its directory as given, and two
// spellings of one tree had it start a second server on the same port mid-run, reloading the page.
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

/** Ms of frames thrown away after a page resumes, before its window: the first frames after a pause catch up. */
const SETTLE_MS = 500;
const WARMUP_MS = 5_000;
const DEFAULT_WINDOW_SECONDS = 2;
const DEFAULT_MIN_BLOCKS = 4;
const DEFAULT_MAX_BLOCKS = 30;
/**
 * A change inside this many percent counts as no difference when the interval fits inside it: below the
 * 5% a run must find. Simulated at 5% pair noise (a busy PC, harbor-heat standing still) with 4-30
 * pairs and the 1% floor: a no-op reads no difference 89% of the time and changed 1.6%, and a 5% change
 * reads slower 94% of the time; at 3% noise, 99.4% and 99.7%.
 */
const DEFAULT_MARGIN_PCT = 4;

/**
 * A change is called only when its whole interval is past this many percent, not merely past zero.
 * Checked after every pair, a 99% interval past zero called a no-op slower about 6% of the time
 * (harbor-heat read +3.4%, +0.1 to +6.9, with the same game code both sides, 2026-11-09), which over
 * a nine-game sweep is a false regression in about every other run.
 */
const CHANGE_FLOOR_PCT = 1;

/** Two-sided 99% Student t critical values, by degrees of freedom 1..30 (beyond 30, 2.70 is within 2%). */
const T99 = [63.657, 9.925, 5.841, 4.604, 4.032, 3.707, 3.499, 3.355, 3.25, 3.169, 3.106, 3.055, 3.012, 2.977, 2.947, 2.921, 2.898, 2.878, 2.861, 2.845, 2.831, 2.819, 2.807, 2.797, 2.787, 2.779, 2.771, 2.763, 2.756, 2.75];

export function t99(df: number): number {
  if (df < 1) return Number.POSITIVE_INFINITY;
  return T99[Math.min(df, T99.length) - 1] ?? 2.7;
}

export interface AbArgs {
  games: string[] | null;
  base: string | null;
  windowSeconds: number;
  minBlocks: number;
  maxBlocks: number;
  marginPct: number;
  path: PerfPath;
  settings: PerfSettingOverride[];
  out: string;
  markdown: boolean;
  /** Self-check: busy-wait this many ms in every frame of the branch page, a known regression the run must find. */
  plantMs: number;
  /** The frame-time percentile of each window the verdict compares: 50 (the middle frame) unless asked. */
  percentile: number;
  /** `dev` (default for now): both sides are Vite dev servers; `--production`: both are the build players get. */
  build: PerfBuild;
}

const USAGE = `usage: bun run perf ab [--games a,b] [--base <ref|dir>] [--window s] [--blocks min,max] [--margin pct]
                       [--path walk|still] [--stat pNN] [--set key=value ...] [--out dir] [--markdown] [--plant-ms n] [--production]

  Both sides are Vite dev servers unless --production is given; with it both are the build players get
  (minified, bundled, production React; built once per side, under a minute, and reused until the served
  files change), which is where a claim about what players experience comes from. The report leads with each side's
  scorecard: frame p50/p95/p99 and the worst frame, frames over 16.7 and 33 ms, main-thread ms per frame
  and the share inside React and react-three-fiber, MB allocated per second and GC time, the same frames
  with the CPU slowed ${SLOW_CPU_RATE}x, load time and download size. The verdict table follows.

  Is this branch faster or slower than its base, per game: the base and the branch load once each, in
  a Chrome of their own, then take turns running ${DEFAULT_WINDOW_SECONDS} s windows (the other side suspended) at the
  frame gate's conditions (${GATE_SIZE.width}x${GATE_SIZE.height}, high tier, automatic quality off, uncapped clock),
  the player standing still. Each branch window against the base windows either side is one ratio; the
  run stops when the 99% interval of the mean ratio says slower, faster, or within the margin, and
  prints one row per game. Stops at the first game that fails.

  --games    comma-separated ids (default: the games the diff from the base can change: a game's own
             folder, or every game when packages/, apps/dev or the lockfile changed)
  --base     a git ref (default: the merge-base with origin/beta) measured from a detached worktree
             beside the main checkout (made once per commit, reused), or a checkout directory
  --window   seconds per window (default ${DEFAULT_WINDOW_SECONDS})
  --blocks   fewest and most pairs per game (default ${DEFAULT_MIN_BLOCKS},${DEFAULT_MAX_BLOCKS})
  --margin   a change whose interval fits inside +-margin % reads as no difference (default ${DEFAULT_MARGIN_PCT})
  --path     still (default) or walk: every window walks forward from one spot, about twice as noisy
  --stat     which frame time of each window is compared: p50 (default, the middle frame) or a tail
             such as p90 or p99, for a change that moves the slow frames and not the typical one
  --set     a setting for both sides, as perf <game> --set
  --out      where each game's windows are written as JSON (default .scratch/perf-ab)
  --production  time both sides' production builds, what players get, instead of their dev servers
  --markdown print the tables as Markdown
  --plant-ms busy-wait this many ms in every frame of the branch page: a known regression, to check
             the run can see a change of that size on this PC (expected change = ms / frame p50)`;

export function parseAbArgs(argv: readonly string[]): AbArgs | "help" {
  const args: AbArgs = {
    games: null, base: null, windowSeconds: DEFAULT_WINDOW_SECONDS, minBlocks: DEFAULT_MIN_BLOCKS, maxBlocks: DEFAULT_MAX_BLOCKS,
    marginPct: DEFAULT_MARGIN_PCT, path: "still", settings: [], out: join(repoRoot, ".scratch", "perf-ab"), markdown: false, plantMs: 0, percentile: 50, build: "dev",
  };
  const number = (flag: string, value: string, min: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min) throw new Error(`${flag} must be a number >= ${min} (got ${value})`);
    return parsed;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--help" || arg === "-h") return "help";
    if (arg === "--markdown") { args.markdown = true; continue; }
    if (arg === "--production") { args.build = "production"; continue; }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${arg.startsWith("--") ? arg : `unknown argument ${arg}:`} needs a value`);
    index += 1;
    switch (arg) {
      case "--games": {
        const games = value.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
        if (games.length === 0) throw new Error("--games needs at least one game id");
        args.games = games;
        break;
      }
      case "--base": args.base = value; break;
      case "--window": args.windowSeconds = number(arg, value, 0.5); break;
      case "--blocks": {
        const [min, max] = value.split(",").map((part) => number(arg, part, 2));
        if (min === undefined || max === undefined || max < min) throw new Error(`--blocks takes min,max with max >= min (got ${value})`);
        args.minBlocks = Math.round(min);
        args.maxBlocks = Math.round(max);
        break;
      }
      case "--margin": args.marginPct = number(arg, value, 0.1); break;
      case "--path":
        if (value !== "walk" && value !== "still") throw new Error(`--path must be walk or still (got ${value})`);
        args.path = value;
        break;
      case "--set": args.settings.push(parseSettingSpec(value)); break;
      case "--out": args.out = resolve(value); break;
      case "--plant-ms": args.plantMs = number(arg, value, 0); break;
      case "--stat": {
        const match = /^p(\d{1,2}(?:\.\d+)?)$/.exec(value);
        const percentile = match === null ? Number.NaN : Number(match[1]);
        if (!(percentile >= 1 && percentile < 100)) throw new Error(`--stat must be a percentile such as p50, p90 or p99 (got ${value})`);
        args.percentile = percentile;
        break;
      }
      default: throw new Error(`unknown argument ${arg}`);
    }
  }
  return args;
}

/**
 * The games a diff can change: a game's own folder changes that game; the engine, the dev runner or the
 * dependencies change every game. Scripts, docs and tests change none.
 */
export function affectedGames(paths: readonly string[], games: readonly string[]): string[] {
  const hit = new Set<string>();
  for (const raw of paths) {
    const path = raw.replaceAll("\\", "/");
    if (/^packages\/[^/]+\/src\//.test(path) && !/\.test\.tsx?$/.test(path)) return [...games];
    if (/^apps\/dev\//.test(path) || path === "bun.lock" || path === "package.json" || /^packages\/[^/]+\/package\.json$/.test(path)) return [...games];
    const game = /^games\/([^/]+)\//.exec(path)?.[1];
    if (game !== undefined && games.includes(game) && !/\.test\.tsx?$|\/proofs\/|\.md$/.test(path)) hit.add(game);
    if (game === "shared") return [...games];
  }
  return games.filter((game) => hit.has(game));
}

export type AbCall = "slower" | "faster" | "same" | "unclear";

export interface AbVerdict {
  call: AbCall;
  /** Blocks the verdict is over. */
  blocks: number;
  /** Mean change of branch against base, in percent (positive: the branch's frames take longer). */
  changePct: number;
  lowPct: number;
  highPct: number;
}

/**
 * The verdict over paired log ratios ln(branch / base), one per block: the mean with its 99% interval.
 * `null` while the run should go on: fewer than `minBlocks`, or an interval that neither excludes no
 * change nor fits inside +-margin. At `maxBlocks` it always answers, `unclear` when still undecided.
 */
export function abVerdict(logRatios: readonly number[], options: { minBlocks: number; maxBlocks: number; marginPct: number; floorPct?: number }): AbVerdict | null {
  const n = logRatios.length;
  if (n < Math.max(2, options.minBlocks)) return null;
  const mean = logRatios.reduce((sum, value) => sum + value, 0) / n;
  const variance = logRatios.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const half = t99(n - 1) * Math.sqrt(variance / n);
  const pct = (log: number) => Math.round((Math.exp(log) - 1) * 1000) / 10;
  const verdict = (call: AbCall): AbVerdict => ({ call, blocks: n, changePct: pct(mean), lowPct: pct(mean - half), highPct: pct(mean + half) });
  const margin = Math.log(1 + options.marginPct / 100);
  const floor = Math.log(1 + (options.floorPct ?? CHANGE_FLOOR_PCT) / 100);
  if (mean - half > floor) return verdict("slower");
  if (mean + half < -floor) return verdict("faster");
  if (mean - half >= -margin && mean + half <= margin) return verdict("same");
  return n >= options.maxBlocks ? verdict("unclear") : null;
}

/** The middle frame time of a window. */
export function medianMs(deltas: readonly number[]): number {
  return percentileMs(deltas, 50);
}

/** The frame time `percentile` % of a window's frames are at or under, interpolated between ranks (50: the median). */
export function percentileMs(deltas: readonly number[], percentile: number): number {
  const kept = deltas.filter((ms) => Number.isFinite(ms) && ms > 0).sort((a, b) => a - b);
  if (kept.length === 0) return Number.NaN;
  const rank = (percentile / 100) * (kept.length - 1);
  const low = Math.floor(rank);
  const high = Math.min(low + 1, kept.length - 1);
  return kept[low]! + (kept[high]! - kept[low]!) * (rank - low);
}

/**
 * ln(branch / base) for one pair: a base window and the branch window right after it, each page as far
 * into its own game (a page's game runs only while it is timed). Holding a branch window against the
 * base windows either side of it compared it with base half a window further on, where games run
 * cheaper as they settle: same-code no-ops read "slower" (+4.2%, +7.5%, +8%, 2026-11-09), and the same
 * windows matched by game time read -0.1 to +5.9% and never past the floor.
 */
export function pairLogRatio(base: number, branch: number): number {
  return Math.log(branch / base);
}

function git(cwd: string, args: string[]): { ok: boolean; out: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true, timeout: 180_000, maxBuffer: 256 * 1024 * 1024 });
  return { ok: result.status === 0, out: `${result.stdout ?? ""}`.trim() };
}

/** Paths that differ between `commit` and this tree, committed or not, untracked included. */
function changedPaths(dir: string, commit: string): string[] {
  const tracked = git(dir, ["diff", "--name-only", commit]).out;
  const untracked = git(dir, ["ls-files", "--others", "--exclude-standard"]).out;
  return `${tracked}\n${untracked}`.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}

function mainCheckout(): string {
  const common = git(repoRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).out;
  return dirname(common);
}

/** Directory name of the shared base worktree for a commit. */
export function baseTreeName(commit: string): string {
  return `perf-base-${commit.slice(0, 10)}`;
}

/** File a base tree's every use touches; a tree unused this long is removed when another is made. */
const BASE_USED_MARKER = ".perf-ab-used";
export const BASE_TREE_KEEP_MS = 24 * 60 * 60 * 1000;

/**
 * Which other `perf-base-*` trees to remove: those not used for a day (a tree with no marker counts
 * from when it was made). Removing every other tree whenever a new one was made deleted the base a
 * second run was still serving (2026-11-09): Windows kept the files its dev server held open, so the
 * folder stayed behind without its `.git` and the next run read the main checkout's commit from it.
 */
export function expiredBaseTrees(trees: Array<{ name: string; usedAtMs: number }>, current: string, nowMs: number): string[] {
  return trees.filter((tree) => tree.name.startsWith("perf-base-") && tree.name !== current && nowMs - tree.usedAtMs > BASE_TREE_KEEP_MS).map((tree) => tree.name);
}

/** True when `dir` is the top of its own checkout, not a leftover folder git resolves to an outer one. */
function isCheckoutRoot(dir: string): boolean {
  const top = git(dir, ["rev-parse", "--show-toplevel"]);
  return top.ok && resolve(top.out).toLowerCase() === resolve(dir).toLowerCase();
}

function usedAtMs(dir: string): number {
  for (const path of [join(dir, BASE_USED_MARKER), dir]) {
    try {
      return statSync(path).mtimeMs;
    } catch {
      // try the next
    }
  }
  return 0;
}

/** Removes a base tree or what a failed removal left of it; false when Windows still holds its files. */
function removeBaseTree(main: string, dir: string): boolean {
  if (isCheckoutRoot(dir)) git(main, ["worktree", "remove", "--force", dir]);
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // reported below
  }
  git(main, ["worktree", "prune"]);
  return !existsSync(dir);
}

/**
 * The checkout the base side is served from: a directory as given, or a detached worktree at the
 * commit under the main checkout's `.claude/worktrees/`, made once and reused by every thread that
 * measures against that commit. Other `perf-base-*` trees unused for a day are removed when a new one is made.
 */
function baseCheckout(spec: string | null): { dir: string; commit: string; label: string } {
  if (spec !== null && existsSync(spec)) {
    const dir = resolve(spec);
    return { dir, commit: git(dir, ["rev-parse", "HEAD"]).out, label: `${basename(dir)} (${git(dir, ["rev-parse", "--short=9", "HEAD"]).out})` };
  }
  const ref = spec ?? git(repoRoot, ["merge-base", "HEAD", "origin/beta"]).out;
  const commit = git(repoRoot, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).out;
  if (commit === "") throw new Error(`--base ${ref} is neither a directory nor a commit this checkout knows`);
  const main = mainCheckout();
  const root = join(main, ".claude", "worktrees");
  const dir = join(root, baseTreeName(commit));
  if (existsSync(dir) && !isCheckoutRoot(dir)) {
    console.error(`degraded: ${dir} is what a failed removal left behind (no .git); removing it and making the tree again`);
    if (!removeBaseTree(main, dir)) throw new Error(`could not remove the leftover ${dir}: a process still holds its files (its dev server); stop it and run again`);
  }
  if (!existsSync(dir)) {
    mkdirSync(root, { recursive: true });
    const trees = readdirSync(root).map((name) => ({ name, usedAtMs: usedAtMs(join(root, name)) }));
    for (const name of expiredBaseTrees(trees, basename(dir), Date.now())) {
      const old = join(root, name);
      if (isCheckoutRoot(old) && git(old, ["status", "--porcelain", "--untracked-files=no"]).out !== "") continue;
      if (!removeBaseTree(main, old)) console.error(`degraded: could not remove the unused base tree ${old}; a process still holds its files`);
    }
    console.error(`perf ab: making the base checkout ${dir} at ${commit.slice(0, 9)}`);
    const added = git(main, ["worktree", "add", "--detach", dir, commit]);
    if (!added.ok && !existsSync(dir)) throw new Error(`could not add the base worktree at ${commit.slice(0, 9)}: ${added.out}`);
  }
  if (git(dir, ["rev-parse", "HEAD"]).out !== commit) throw new Error(`the base checkout ${dir} is not at ${commit.slice(0, 9)}; remove it (git worktree remove) and run again`);
  writeFileSync(join(dir, BASE_USED_MARKER), `${new Date().toISOString()}\n`);
  ensureWorktreeReady(dir);
  return { dir, commit, label: `${ref === commit ? "" : `${ref} = `}${commit.slice(0, 9)}` };
}

/** Busy-waits `ms` at the start of every animation frame, before the page's own callbacks. */
export function plantScript(ms: number): string {
  return `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  let frame = -1;
  window.requestAnimationFrame = (callback) => raf((now) => {
    if (now !== frame) { frame = now; const end = performance.now() + ${ms}; while (performance.now() < end) {} }
    callback(now);
  });
})();`;
}

type Side = "base" | "branch";

export interface Home {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface SidePage {
  side: Side;
  session: CdpSession;
  /** The side's own browser, for its process list. */
  browser: CdpSession;
  /** Where the player stood after warmup; every window's walk starts here, so windows replay one route. */
  home: Home | null;
  /** The game's teleport left its player where it was (a car body puts it back), so windows follow it on. */
  homeFailed: boolean;
  stopPath: () => Promise<void>;
  /** Renderer pids suspended while the other side is timed. */
  frozen: number[];
  /** What the page downloaded to become ready, and how long that took, from an empty cache. */
  load: LoadScore;
  /** Percent of the PC's cores busy just before the page loaded. */
  pcBusyPct: number;
}

export interface AbWindow {
  block: number;
  side: Side;
  medianMs: number;
  /** The window's frame time at the run's `--stat` percentile: what the verdict compares (its median at p50). */
  statMs: number;
  frames: number;
  /** CPU of the timed side's renderers over the window, % of one core. */
  timedCpu: number;
  /** CPU of the other side's renderers over the window, % of one core: 0 while they are suspended. */
  idleCpu: number;
  /** The timed side's renderer and GPU processes that sat below normal priority before the window and were raised. */
  raised: string[];
  /** Those still below normal when the window ended: Chrome lowered them again during it. */
  lowAfter: string[];
  /** The player's position when the window started and ended, or null with no player: the route it walked. */
  route: { from: number[]; to: number[] } | null;
}

export interface AbGameResult {
  game: string;
  verdict: AbVerdict;
  baseMs: number;
  branchMs: number;
  windows: AbWindow[];
  lockSeconds: number;
  /** Each side's scorecard: every measured window's frames pooled, one profiled window, one slow-CPU window, the load. */
  cards: Record<Side, Scorecard>;
}

async function openSide(side: Side, debugPort: number, browser: CdpSession, serve: (side: Side) => Promise<string>, game: string, args: AbArgs): Promise<SidePage> {
  const session = await openPageSession(debugPort);
  await session.send("Page.enable");
  await session.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { try { performance.setResourceTimingBufferSize(4000); } catch {} })();` });
  await session.send("Network.enable").catch(() => {});
  await session.send("Network.clearBrowserCache").catch(() => {});
  const settings = [parseSettingSpec("graphics.auto=false"), ...args.settings];
  await session.send("Page.addScriptToEvaluateOnNewDocument", { source: perfSettingsScript(settings) });
  if (side === "branch" && args.plantMs > 0) await session.send("Page.addScriptToEvaluateOnNewDocument", { source: plantScript(args.plantMs) });
  await applyDevice(session, "desktop", "full", GATE_SIZE);
  console.error(`perf ab: ${game}: loading the ${side} page`);
  const load = async () => {
    const base = await serve(side);
    await navigateCapturePageWithRetry(session, perfPageUrl({ base, game, quality: "high" }).toString(), base, PAGE_READY_MS);
  };
  const pcBusyPct = await cpuBusyPct();
  const loadAt = Date.now();
  try {
    await load();
  } catch (error) {
    // The broker restarts a checkout's dev server when its tree moves, so the one asked for before the
    // lock can be gone at the load; asked again, it is the live one.
    const message = error instanceof Error ? error.message : String(error);
    if (!/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/.test(message)) throw error;
    console.error(`degraded: the ${side} dev server stopped answering (${message}); asked for it again and loading once more`);
    await load();
  }
  const readyMs = Date.now() - loadAt;
  const resources = (await session.evaluate<Array<[string, number]>>(LOAD_RESOURCES_SCRIPT)) ?? [];
  await session.evaluate(`new Promise((r) => setTimeout(r, ${WARMUP_MS}))`, { awaitPromise: true });
  const pose = await session.evaluate<{ ok: boolean; position?: number[]; rotationY?: number }>(`window.__jgengineAgent?.handle?.({ method: "player_pose" }) ?? { ok: false }`);
  const [x, y, z] = pose?.position ?? [];
  const home = pose?.ok === true && x !== undefined && y !== undefined && z !== undefined ? { x, y, z, yaw: pose.rotationY ?? 0 } : null;
  return { side, session, browser, home, homeFailed: false, stopPath: async () => {}, frozen: [], load: loadScore(resources, readyMs), pcBusyPct };
}

/** The bridge request that puts the player back where the window's walk starts. */
export function homeRequest(home: Home): string {
  return JSON.stringify({ method: "teleport", x: home.x, y: home.y, z: home.z, yaw: home.yaw });
}

/**
 * Freeze a side: release its keys, then suspend every renderer process of its browser. A debugger
 * pause stopped only the page's main thread, and a paused game page kept three renderer processes at
 * 100-130% of a core each (harbor-heat, 2026-11-09), drawing against the side being timed.
 */
async function pause(page: SidePage): Promise<void> {
  await page.stopPath();
  page.stopPath = async () => {};
  const pids = [...(await processCpu(page.browser)).keys()].flatMap((key) => (key.startsWith("renderer:") ? [Number(key.slice("renderer:".length))] : []));
  await suspendProcesses(pids);
  page.frozen = pids;
}

async function resume(page: SidePage, path: PerfPath): Promise<void> {
  await resumeProcesses(page.frozen);
  page.frozen = [];
  await page.session.send("Page.bringToFront");
  // A walk that went on from wherever the last window left it read 10.7-23 ms from one 2 s window to
  // the next on one build (harbor-heat pilot, 2026-11-09): each window saw new ground. From the same
  // spot, every window on both sides walks the same route. Standing still, only a player that moved on
  // its own is put back (a car that drives itself), so a game whose player stands pays no teleport.
  const home = page.home;
  if (home !== null && !page.homeFailed && (path === "walk" || awayFromHome(await playerAt(page), home) > HOME_TOLERANCE_M)) {
    const moved = await page.session.evaluate<{ ok: boolean; error?: string }>(`window.__jgengineAgent?.handle?.(${homeRequest(home)}) ?? { ok: false, error: "agent bridge unavailable" }`);
    if (moved?.ok !== true) throw new Error(`could not put the ${page.side} page's player back at the start of the walk: ${moved?.error ?? "no answer"}`);
    // The teleport's own camera turn swings round the camera's old target, so the view after it
    // pointed from where the last walk ended and alternate windows walked two routes (north-east at
    // 27 ms, south at 16 ms; harbor-heat, 2026-11-09). Turned again once the camera follows the new
    // spot, every window walks one route.
    await page.session.evaluate(`new Promise((r) => setTimeout(r, ${TURN_SETTLE_MS}))`, { awaitPromise: true });
    await page.session.evaluate(`window.__jgengineAgent?.handle?.(${JSON.stringify({ method: "camera_heading", yaw: home.yaw })})`);
    await page.session.evaluate(`new Promise((r) => setTimeout(r, ${TURN_SETTLE_MS}))`, { awaitPromise: true });
    // drift-foundry's teleport answers ok and its car body puts the player back where it was; its
    // windows then follow the car down the track, each pair still at one spot on both pages.
    const away = awayFromHome(await playerAt(page), home);
    if (away > HOME_TOLERANCE_M && path === "still") {
      page.homeFailed = true;
      console.error(`degraded: the ${page.side} page's player was ${away.toFixed(1)} m from its start after a teleport, so its windows follow the player on; each pair is still both pages equally far into the game`);
    } else if (away > HOME_TOLERANCE_M) {
      throw new Error(`the ${page.side} page's player was ${away.toFixed(1)} m from the start of the walk after a teleport, so its walks would not replay one route`);
    }
  }
  page.stopPath = await startPath(page.session, path);
  await page.session.evaluate(`new Promise((r) => setTimeout(r, ${SETTLE_MS}))`, { awaitPromise: true });
}

/** How far a player may be from home and count as there. */
const HOME_TOLERANCE_M = 1;

/** Ground distance from home, 0 when the game has no pose. */
export function awayFromHome(at: readonly number[] | null, home: Home): number {
  return at === null ? 0 : Math.hypot((at[0] ?? home.x) - home.x, (at[2] ?? home.z) - home.z);
}

async function playerAt(page: SidePage): Promise<number[] | null> {
  const pose = await page.session.evaluate<{ ok: boolean; position?: number[] }>(`window.__jgengineAgent?.handle?.({ method: "player_pose" }) ?? { ok: false }`);
  return pose?.ok === true && Array.isArray(pose.position) ? pose.position.map((value) => Math.round(value * 10) / 10) : null;
}

async function measureWindow(page: SidePage, seconds: number): Promise<number[]> {
  return (await page.session.evaluate<number[]>(SAMPLE_FRAMES_SCRIPT(seconds * 1000), { awaitPromise: true })) ?? [];
}

async function browserSession(port: number, side: Side): Promise<CdpSession> {
  const version = JSON.parse(await localGet(`http://127.0.0.1:${port}/json/version`, 5_000)) as { webSocketDebuggerUrl?: string };
  if (version.webSocketDebuggerUrl === undefined) throw new Error(`the ${side} browser named no debugger endpoint`);
  return CdpSession.connect(version.webSocketDebuggerUrl, 10_000);
}

/**
 * Each side has a Chrome of its own with one page. Two pages in one Chrome were not equal: Chrome
 * kept the renderers of the page it treated as background at low priority, re-lowering them within a
 * window of being raised, and a same-code no-op read -35% (harbor-heat, 2026-11-09).
 */
async function measurePair(game: string, serve: (side: Side) => Promise<string>, args: AbArgs, ports: Record<Side, number>, buildDir: (side: Side) => string | undefined): Promise<Omit<AbGameResult, "lockSeconds">> {
  for (const side of ["base", "branch"] as const) {
    const probe = await openPageSession(ports[side]);
    try {
      const problem = cappedClockProblem(await probeFrameClockMs(probe));
      if (problem !== null) throw new Error(`the ${side} browser's uncapped clock did not take: ${problem}`);
    } finally {
      await probe.close();
    }
  }
  const pages: Partial<Record<Side, SidePage>> = {};
  const browsers: Partial<Record<Side, CdpSession>> = {};
  try {
    browsers.base = await browserSession(ports.base, "base");
    browsers.branch = await browserSession(ports.branch, "branch");
    // Base loads first and waits frozen while the branch loads, so neither page draws while the other is
    // timed. Which side loads and launches first moved nothing (a no-op read -0.5% with the branch first,
    // -1.7% with the base first, harbor-heat, 2026-11-09).
    const loadAt = Date.now();
    for (const side of ["base", "branch"] as const) {
      pages[side] = await openSide(side, ports[side], browsers[side]!, serve, game, args);
      await pause(pages[side]!);
    }
    if (pages.base === undefined || pages.branch === undefined) throw new Error("a side did not load");
    const measureAt = Date.now();
    // A walk with no player to put back (a camera-only game pans away) would see new ground every
    // window, so such a game is measured standing still, and says so.
    let path = args.path;
    if (path === "walk" && (pages.base.home === null || pages.branch.home === null)) {
      console.error(`perf ab: ${game} has no player pose to start each walk from, so it is measured standing still`);
      path = "still";
    }
    console.error(`perf ab: ${game}: both pages loaded and warmed in ${Math.round((measureAt - loadAt) / 1000)} s`);
    const windows: AbWindow[] = [];
    const pooled: Record<Side, number[]> = { base: [], branch: [] };
    // After the verdict: one profiled window and one slow-CPU window a side, taken in turns like the rest.
    const score = async (side: Side): Promise<Scorecard> => {
      const page = pages[side]!;
      await resume(page, path);
      equalizePriorities(await processCpu(page.browser), true);
      const profiled = await profiledWindow(page.session, SCORE_SECONDS);
      const slow = await slowCpuWindow(page.session, SLOW_CPU_RATE, SCORE_SECONDS);
      await pause(page);
      const sources = await profileSources(profiled.raw.nodes.map((node) => node.callFrame.url), { outDir: buildDir(side) });
      const card: Scorecard = {
        build: args.build,
        slow: { rate: SLOW_CPU_RATE, frame: frameScore(slow) },
        pcBusyPct: page.pcBusyPct,
        frame: frameScore(pooled[side]),
        main: mainScore(scoreProfile(profiled.raw, sources), profiled.frames, profiled.ms / 1000, profiled.allocatedBytes),
        load: page.load,
      };
      const problem = productionProblem(card);
      if (problem !== null) throw new Error(`the ${side} page was asked for as a production build but was not one: ${problem}`);
      return card;
    };
    const run = async (side: Side, block: number): Promise<number> => {
      const page = pages[side]!;
      const other = pages[side === "base" ? "branch" : "base"]!;
      await resume(page, path);
      const [timedBefore, idleBefore] = [await processCpu(page.browser), await processCpu(other.browser)];
      const raised = equalizePriorities(timedBefore, true);
      const windowAt = Date.now();
      const from = await playerAt(page);
      const deltas = await measureWindow(page, args.windowSeconds);
      const to = await playerAt(page);
      const ms = Date.now() - windowAt;
      const [timedAfter, idleAfter] = [await processCpu(page.browser), await processCpu(other.browser)];
      const lowAfter = equalizePriorities(timedAfter, false);
      await pause(page);
      const median = medianMs(deltas);
      const stat = percentileMs(deltas, args.percentile);
      if (!Number.isFinite(median) || !Number.isFinite(stat)) throw new Error(`the ${side} page drew no frames in pair ${block}`);
      if (block > 0) pooled[side].push(...deltas);
      windows.push({
        block, side, medianMs: Math.round(median * 1000) / 1000, statMs: Math.round(stat * 1000) / 1000, frames: deltas.length,
        timedCpu: rendererCpuPct(timedBefore, timedAfter, ms), idleCpu: rendererCpuPct(idleBefore, idleAfter, ms), raised, lowAfter,
        route: from === null || to === null ? null : { from, to },
      });
      return stat;
    };
    // One pair first, thrown away: each page's first window after its warmup pause is not like the rest.
    await run("base", 0);
    await run("branch", 0);
    // Strictly alternating: a page timed twice running read about 30 ms where the same page timed right
    // after the other read 14-19 ms (harbor-heat, 2026-11-09), so every window follows the other page's.
    // Each pair is a base window and the branch window after it, both pages that far into their game.
    const ratios: number[] = [];
    for (let block = 1; block <= args.maxBlocks; block += 1) {
      const base = await run("base", block);
      const branch = await run("branch", block);
      ratios.push(pairLogRatio(base, branch));
      const verdict = abVerdict(ratios, args);
      console.error(`perf ab: ${game} pair ${block}: base ${base.toFixed(2)} ms, branch ${branch.toFixed(2)} ms${verdict === null ? "" : ` -> ${verdict.call}`}`);
      if (verdict !== null) {
        console.error(`perf ab: ${game}: ${verdict.blocks} pairs in ${Math.round((Date.now() - measureAt) / 1000)} s`);
        // Every window starts from home, walking or standing (a vehicle's player moves on its own), so
        // their ends say whether they all covered the same ground.
        const spread = pages.base.homeFailed || pages.branch.homeFailed ? 0 : routeSpread(windows);
        if (spread > ROUTE_SPREAD_MAX_M) console.error(`degraded: the windows' players ended up to ${spread.toFixed(1)} m apart, so they did not all cover the same ground`);
        const busyIdle = windows.filter((window) => window.idleCpu > IDLE_CPU_MAX_PCT).length;
        if (busyIdle > 0) console.error(`degraded: in ${busyIdle} of ${windows.length} windows the frozen side's renderers still used over ${IDLE_CPU_MAX_PCT}% of a core`);
        const side = (which: Side) => medianMs(windows.filter((window) => window.side === which && window.block > 0).map((window) => window.statMs));
        const cards = { base: await score("base"), branch: await score("branch") };
        return { game, verdict, baseMs: side("base"), branchMs: side("branch"), windows, cards };
      }
    }
    throw new Error("the block loop ended without a verdict");
  } finally {
    for (const page of Object.values(pages)) await resumeProcesses(page.frozen).catch(() => {});
    for (const page of Object.values(pages)) {
      await page.stopPath().catch(() => {});
      await page.session.close().catch(() => {});
    }
    for (const browser of Object.values(browsers)) await browser.close().catch(() => {});
  }
}

/** Seconds of the profiled window and of the slow-CPU window each side gets after the verdict. */
const SCORE_SECONDS = 4;

/** Ms between the teleport, the second camera turn and the walk. */
const TURN_SETTLE_MS = 250;
/** Walk end points further apart than this, in metres, are different routes. */
const ROUTE_SPREAD_MAX_M = 3;

/** The largest distance between any two measured windows' walk end points (0 with fewer than two routes). */
export function routeSpread(windows: readonly Pick<AbWindow, "block" | "route">[]): number {
  const ends = windows.filter((window) => window.block > 0 && window.route !== null).map((window) => window.route!.to);
  let widest = 0;
  for (const a of ends) for (const b of ends) widest = Math.max(widest, Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[2] ?? 0) - (b[2] ?? 0)));
  return widest;
}

/** A frozen side whose renderers use more than this share of a core over a window was not frozen. */
const IDLE_CPU_MAX_PCT = 5;

/**
 * The renderer and GPU processes below normal priority, named; with `raise`, each is put back to
 * normal. Chrome lowers renderers it treats as background, and a side timed at low priority on a busy
 * PC is timed against the PC.
 */
function equalizePriorities(processes: ReadonlyMap<string, number>, raise: boolean): string[] {
  const lowered: string[] = [];
  for (const key of processes.keys()) {
    const [type, id] = key.split(":");
    const pid = Number(id);
    if ((type !== "renderer" && type !== "gpu") || !Number.isInteger(pid) || pid <= 0) continue;
    const before = currentPriority(pid);
    if (before === "normal") continue;
    lowered.push(`${type} ${pid} (${before})`);
    if (raise) restoreNormalPriority(pid);
  }
  return lowered;
}

/** CPU seconds so far per process of one browser, keyed `<type>:<pid>`. */
async function processCpu(browser: CdpSession): Promise<Map<string, number>> {
  const info = await browser.send("SystemInfo.getProcessInfo");
  const list = (info["processInfo"] ?? []) as Array<{ type: string; id: number; cpuTime: number }>;
  return new Map(list.map((process) => [`${process.type}:${process.id}`, process.cpuTime]));
}

/** Renderer CPU between two readings of one browser, as a percent of one core over `windowMs`. */
export function rendererCpuPct(before: ReadonlyMap<string, number>, after: ReadonlyMap<string, number>, windowMs: number): number {
  let seconds = 0;
  for (const [key, cpu] of after) {
    if (key.startsWith("renderer:") && before.has(key)) seconds += cpu - (before.get(key) ?? 0);
  }
  return Math.round((seconds * 1000 * 100) / Math.max(windowMs, 1));
}

const CALL_TEXT: Record<AbCall, string> = { slower: "slower", faster: "faster", same: "no difference", unclear: "unclear" };

export function renderAbTable(results: readonly AbGameResult[], options: { markdown: boolean; marginPct: number; percentile?: number }): string {
  const stat = `p${options.percentile ?? 50}`;
  const head = ["game", "verdict", "change", "99% interval", `base ${stat} ms`, `branch ${stat} ms`, "pairs", "lock s"];
  const rows = results.map((result) => {
    const { verdict } = result;
    const sign = (pct: number) => `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
    return [
      result.game,
      verdict.call === "same" ? `${CALL_TEXT.same} (within +-${options.marginPct}%)` : CALL_TEXT[verdict.call],
      sign(verdict.changePct), `${sign(verdict.lowPct)} to ${sign(verdict.highPct)}`,
      result.baseMs.toFixed(2), result.branchMs.toFixed(2), String(verdict.blocks), String(result.lockSeconds),
    ];
  });
  if (options.markdown) {
    const line = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;
    return [line(head), line(head.map(() => "---")), ...rows.map(line)].join("\n");
  }
  const widths = head.map((cell, column) => Math.max(cell.length, ...rows.map((row) => (row[column] ?? "").length)));
  const line = (cells: readonly string[]) => cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ").trimEnd();
  return [line(head), ...rows.map(line)].join("\n");
}

/** Each game's two scorecards side by side, base then branch: what the report leads with. */
export function renderAbScorecards(results: readonly Pick<AbGameResult, "game" | "cards">[], markdown: boolean): string {
  return results
    .map((result) => `${markdown ? `**${result.game}**` : result.game}\n${renderScorecard([{ label: "base", card: result.cards.base }, { label: "branch", card: result.cards.branch }], markdown)}`)
    .join("\n\n");
}

async function main(): Promise<number> {
  const parsed = parseAbArgs(process.argv.slice(2));
  if (parsed === "help") {
    console.log(USAGE);
    return 0;
  }
  const startedAt = Date.now();
  const base = baseCheckout(parsed.base);
  const baseGames = new Set(readdirSync(join(base.dir, "games")));
  const candidates = FRAME_GAMES.filter((game) => baseGames.has(game));
  const games = parsed.games ?? affectedGames(changedPaths(repoRoot, base.commit), candidates);
  const unknown = games.filter((game) => !candidates.includes(game));
  if (unknown.length > 0) throw new Error(`not a playable game on both sides: ${unknown.join(", ")}`);
  if (games.length === 0) {
    console.log(`perf ab: nothing a game runs differs from ${base.label} (only scripts, docs or tests changed), so there is nothing to time`);
    return 0;
  }
  const branchHead = git(repoRoot, ["rev-parse", "--short=9", "HEAD"]).out;
  console.error(`perf ab: base ${base.label} from ${base.dir}; branch ${branchHead}${git(repoRoot, ["status", "--porcelain", "--", "packages", "apps", "games"]).out === "" ? "" : " with uncommitted edits"} from ${repoRoot}; games ${games.join(", ")}`);
  const fingerprints = { base: treeFingerprint(base.dir), branch: treeFingerprint(repoRoot) };
  mkdirSync(parsed.out, { recursive: true });

  // Each page asks for its side's server when it loads, under the perf lock (scripts/perf-lock.ts):
  // a server asked for before a long wait can be gone after it.
  const started: EnsureDevServerResult[] = [];
  // A production build bakes in each game's asset list, so every game's packs are linked on both sides
  // before either is built; a side is built once, at its first page, and serves every game after.
  const prod: Partial<Record<Side, ProdServer>> = {};
  if (parsed.build === "production") {
    for (const game of games) for (const dir of [base.dir, repoRoot]) await provisionCapturedGame(join(dir, "games", game), (line) => console.error(`perf ab: ${line}`));
  }

  const results: AbGameResult[] = [];
  let failure: string | null = null;
  try {
    for (const game of games) {
      for (const dir of [base.dir, repoRoot]) await provisionCapturedGame(join(dir, "games", game), (line) => console.error(`perf ab: ${line}`));
      const releaseLock = await acquirePerfLock(`perf ab ${game}`);
      const serve = async (side: Side): Promise<string> => {
        const dir = side === "base" ? base.dir : repoRoot;
        if (parsed.build === "production") return (prod[side] ??= ensureProdServer(dir)).base;
        let server: EnsureDevServerResult;
        try {
          server = await ensureDevServer(dir);
        } catch (error) {
          // The machine-wide dev-server broker died mid-request (2026-11-09, 03:20, no log line); asked
          // again, a new broker starts.
          const message = error instanceof Error ? error.message : String(error);
          if (!/ECONNRESET|ECONNREFUSED|socket hang up/.test(message)) throw error;
          console.error(`degraded: asking for the ${side} dev server failed (${message}); asking once more`);
          server = await ensureDevServer(dir);
        }
        if (server.pid !== undefined) started.push(server);
        return server.base;
      };
      const heldAt = Date.now();
      try {
        let measured: Omit<AbGameResult, "lockSeconds"> | null = null;
        const session = { keep: false, timeoutMs: 180_000, hardDeadlineMs: 2 * 2 * PAGE_READY_MS + 2 * WARMUP_MS + (parsed.maxBlocks + 2) * 2 * (parsed.windowSeconds * 1000 + SETTLE_MS + 1_000) + 2 * (2 * SCORE_SECONDS * 1000 + 5_000) + 120_000, frameClock: "uncapped", chromePriority: "normal" } as const;
        let inner = 0;
        const exit = await withBrowserSession(session, async ({ debugPort: outerPort }) => {
          inner = await withBrowserSession(session, async ({ debugPort: innerPort }) => {
            measured = await measurePair(game, serve, parsed, { base: outerPort, branch: innerPort }, (side) => prod[side]?.build.outDir);
          });
        });
        if (exit !== 0 || inner !== 0 || measured === null) throw new Error(`the browser sessions exited ${exit} and ${inner}`);
        const now = { base: treeFingerprint(base.dir), branch: treeFingerprint(repoRoot) };
        for (const side of ["base", "branch"] as const) {
          if (now[side] !== fingerprints[side]) throw new Error(`the ${side} checkout's files changed while ${game} was measured, so its numbers describe neither version; measure again without editing`);
        }
        const result: AbGameResult = { ...(measured as Omit<AbGameResult, "lockSeconds">), lockSeconds: Math.round((Date.now() - heldAt) / 1000) };
        results.push(result);
        writeFileSync(join(parsed.out, `${game}.json`), `${JSON.stringify({ base: base.label, branch: branchHead, build: parsed.build, plantMs: parsed.plantMs, ...result }, null, 2)}\n`);
        console.error(`perf ab: ${game} ${CALL_TEXT[result.verdict.call]} ${result.verdict.changePct}% (${result.verdict.lowPct}..${result.verdict.highPct}) over ${result.verdict.blocks} pairs, ${result.lockSeconds} s holding the lock`);
      } catch (error) {
        failure = `${game}: ${error instanceof Error ? error.message : String(error)}`;
        break;
      } finally {
        releaseLock();
      }
    }
  } finally {
    for (const server of Object.values(prod)) server.stop();
    for (const server of started) {
      killProcessTree(server.child ?? null);
      killPid(server.pid, true);
    }
  }
  if (results.length > 0) {
    const plant = parsed.plantMs > 0 ? ` A ${parsed.plantMs} ms busy-wait was planted in every branch frame.` : "";
    const what = parsed.build === "production" ? "the production build players get" : "the dev servers' build (development React, unbundled modules), not what players get";
    console.log(`Branch ${branchHead} against base ${base.label}, ${what}. Frames are every measured window pooled; the main thread, garbage and slow-CPU rows are one ${SCORE_SECONDS} s window a side.\n`);
    console.log(`${renderAbScorecards(results, parsed.markdown)}\n`);
    console.log(`Verdict: frame time per game, ${parsed.windowSeconds} s windows taken in turns, ${parsed.path === "walk" ? "walking" : "standing still"}, ${GATE_SIZE.width}x${GATE_SIZE.height}, high tier, uncapped. Positive change = the branch's frames take longer.${plant}\n`);
    console.log(renderAbTable(results, { markdown: parsed.markdown, marginPct: parsed.marginPct, percentile: parsed.percentile }));
  }
  console.error(`perf ab: ${Math.round((Date.now() - startedAt) / 1000)} s in all`);
  if (failure !== null) {
    const rest = games.slice(results.length + 1);
    console.error(`degraded: perf ab stopped at the first failure (${failure})${rest.length === 0 ? "" : `; not measured: ${rest.join(", ")}`}`);
    return 1;
  }
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(`perf ab: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
