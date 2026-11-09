import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve } from "node:path";

import { applyDevice, CdpSession, ensureDevServer, killPid, killProcessTree, navigateCapturePageWithRetry, openPageSession, withBrowserSession, type EnsureDevServerResult } from "./browser-lib";
import { FRAME_GAMES } from "./ci-scope";
import { ensureWorktreeReady } from "./agent-worktree";
import { startPath, type PerfPath } from "./perf-breakdown";
import { GATE_SIZE } from "./perf-gate";
import { acquirePerfLock } from "./perf-lock";
import { cappedClockProblem, PAGE_READY_MS, parseSettingSpec, perfPageUrl, perfSettingsScript, probeFrameClockMs, SAMPLE_FRAMES_SCRIPT, type PerfSettingOverride } from "./perf-play";
import { localGet } from "./localhostHttp";
import { currentPriority, restoreNormalPriority } from "./machine-priority";
import { resumeProcesses, suspendProcesses } from "./process-suspend";
import { provisionCapturedGame } from "./provisionCapture";

/**
 * Is the branch faster or slower than its base, per game, and by how much: one answer per game with a
 * confidence interval, in a few minutes of the perf lock.
 *
 *   bun run perf ab [--games a,b] [--base <ref|dir>] [--window s] [--blocks min,max] [--margin pct] [--markdown]
 *
 * Both sides load once, each in a Chrome of its own, from their own checkouts and dev servers: the
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
 * 5% a run must find. Simulated at 5% pair noise with 4-30 pairs: a no-op reads no difference 87% of
 * the time and changed 6%, and a 5% change reads slower 99.3% of the time.
 */
const DEFAULT_MARGIN_PCT = 4;

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
}

const USAGE = `usage: bun run perf ab [--games a,b] [--base <ref|dir>] [--window s] [--blocks min,max] [--margin pct]
                       [--path walk|still] [--set key=value ...] [--out dir] [--markdown] [--plant-ms n]

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
  --set      a setting for both sides, as perf <game> --set
  --out      where each game's windows are written as JSON (default .scratch/perf-ab)
  --markdown print the table as Markdown
  --plant-ms busy-wait this many ms in every frame of the branch page: a known regression, to check
             the run can see a change of that size on this PC (expected change = ms / frame p50)`;

export function parseAbArgs(argv: readonly string[]): AbArgs | "help" {
  const args: AbArgs = {
    games: null, base: null, windowSeconds: DEFAULT_WINDOW_SECONDS, minBlocks: DEFAULT_MIN_BLOCKS, maxBlocks: DEFAULT_MAX_BLOCKS,
    marginPct: DEFAULT_MARGIN_PCT, path: "still", settings: [], out: join(repoRoot, ".scratch", "perf-ab"), markdown: false, plantMs: 0,
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
export function abVerdict(logRatios: readonly number[], options: { minBlocks: number; maxBlocks: number; marginPct: number }): AbVerdict | null {
  const n = logRatios.length;
  if (n < Math.max(2, options.minBlocks)) return null;
  const mean = logRatios.reduce((sum, value) => sum + value, 0) / n;
  const variance = logRatios.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const half = t99(n - 1) * Math.sqrt(variance / n);
  const pct = (log: number) => Math.round((Math.exp(log) - 1) * 1000) / 10;
  const verdict = (call: AbCall): AbVerdict => ({ call, blocks: n, changePct: pct(mean), lowPct: pct(mean - half), highPct: pct(mean + half) });
  const margin = Math.log(1 + options.marginPct / 100);
  if (mean - half > 0) return verdict("slower");
  if (mean + half < 0) return verdict("faster");
  if (mean - half >= -margin && mean + half <= margin) return verdict("same");
  return n >= options.maxBlocks ? verdict("unclear") : null;
}

/** The middle frame time of a window. */
export function medianMs(deltas: readonly number[]): number {
  const kept = deltas.filter((ms) => Number.isFinite(ms) && ms > 0).sort((a, b) => a - b);
  if (kept.length === 0) return Number.NaN;
  const mid = kept.length >> 1;
  return kept.length % 2 === 1 ? kept[mid]! : (kept[mid - 1]! + kept[mid]!) / 2;
}

/** ln(branch / base) for one branch window, against the geometric mean of the base windows either side of it. */
export function bracketedLogRatio(baseBefore: number, branch: number, baseAfter: number): number {
  return Math.log(branch) - (Math.log(baseBefore) + Math.log(baseAfter)) / 2;
}

function git(cwd: string, args: string[]): { ok: boolean; out: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true, timeout: 180_000, maxBuffer: 256 * 1024 * 1024 });
  return { ok: result.status === 0, out: `${result.stdout ?? ""}`.trim() };
}

/**
 * What a tree serves, as one hash: the committed content of packages, apps and games, their uncommitted
 * diff and their untracked files. A run that sees it change measured two different programs (the dev
 * server hot-reloads saved edits), so it stops instead of printing a number for neither. A commit that
 * changes no served file (a script, the docs, a commit of edits already served) changes nothing here.
 */
export function treeFingerprint(dir: string): string {
  // The working files as git would commit them, through a copy of the index (its stat cache keeps this
  // to changed files), so the real index is never touched.
  const gitDir = git(dir, ["rev-parse", "--path-format=absolute", "--git-dir"]).out;
  const index = join(tmpdir(), `jg-perf-ab-${process.pid}-${createHash("sha1").update(dir).digest("hex").slice(0, 8)}.index`);
  try {
    copyFileSync(join(gitDir, "index"), index);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    const run = (args: string[]) => spawnSync("git", args, { cwd: dir, env, encoding: "utf8", windowsHide: true, timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
    const added = run(["add", "-A", "--", "packages", "apps", "games"]);
    const tree = run(["write-tree"]);
    if (added.status !== 0 || tree.status !== 0) throw new Error(`git could not hash ${dir}: ${(added.stderr || tree.stderr || "").trim()}`);
    const served = git(dir, ["rev-parse", `${tree.stdout.trim()}:packages`, `${tree.stdout.trim()}:apps`, `${tree.stdout.trim()}:games`]).out;
    return createHash("sha1").update(served).digest("hex").slice(0, 12);
  } finally {
    rmSync(index, { force: true });
  }
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

/**
 * The checkout the base side is served from: a directory as given, or a detached worktree at the
 * commit under the main checkout's `.claude/worktrees/`, made once and reused by every thread that
 * measures against that commit. Older `perf-base-*` trees with no edits are removed when a new one is made.
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
  if (!existsSync(dir)) {
    mkdirSync(root, { recursive: true });
    for (const name of existsSync(root) ? readdirSync(root) : []) {
      if (!name.startsWith("perf-base-") || name === basename(dir)) continue;
      const old = join(root, name);
      if (git(old, ["status", "--porcelain", "--untracked-files=no"]).out === "") git(main, ["worktree", "remove", "--force", old]);
    }
    console.error(`perf ab: making the base checkout ${dir} at ${commit.slice(0, 9)}`);
    const added = git(main, ["worktree", "add", "--detach", dir, commit]);
    if (!added.ok && !existsSync(dir)) throw new Error(`could not add the base worktree at ${commit.slice(0, 9)}: ${added.out}`);
  }
  if (git(dir, ["rev-parse", "HEAD"]).out !== commit) throw new Error(`the base checkout ${dir} is not at ${commit.slice(0, 9)}; remove it (git worktree remove) and run again`);
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

interface Home {
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
  stopPath: () => Promise<void>;
  /** Renderer pids suspended while the other side is timed. */
  frozen: number[];
}

export interface AbWindow {
  block: number;
  side: Side;
  medianMs: number;
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
}

async function openSide(side: Side, debugPort: number, browser: CdpSession, serve: (side: Side) => Promise<string>, game: string, args: AbArgs): Promise<SidePage> {
  const session = await openPageSession(debugPort);
  await session.send("Page.enable");
  const settings = [parseSettingSpec("graphics.auto=false"), ...args.settings];
  await session.send("Page.addScriptToEvaluateOnNewDocument", { source: perfSettingsScript(settings) });
  if (side === "branch" && args.plantMs > 0) await session.send("Page.addScriptToEvaluateOnNewDocument", { source: plantScript(args.plantMs) });
  await applyDevice(session, "desktop", "full", GATE_SIZE);
  console.error(`perf ab: ${game}: loading the ${side} page`);
  const load = async () => {
    const base = await serve(side);
    await navigateCapturePageWithRetry(session, perfPageUrl({ base, game, quality: "high" }).toString(), base, PAGE_READY_MS);
  };
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
  await session.evaluate(`new Promise((r) => setTimeout(r, ${WARMUP_MS}))`, { awaitPromise: true });
  const pose = await session.evaluate<{ ok: boolean; position?: number[]; rotationY?: number }>(`window.__jgengineAgent?.handle?.({ method: "player_pose" }) ?? { ok: false }`);
  const [x, y, z] = pose?.position ?? [];
  const home = pose?.ok === true && x !== undefined && y !== undefined && z !== undefined ? { x, y, z, yaw: pose.rotationY ?? 0 } : null;
  return { side, session, browser, home, stopPath: async () => {}, frozen: [] };
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
  // spot, every window on both sides walks the same route.
  if (page.home !== null && path === "walk") {
    const moved = await page.session.evaluate<{ ok: boolean; error?: string }>(`window.__jgengineAgent?.handle?.(${homeRequest(page.home)}) ?? { ok: false, error: "agent bridge unavailable" }`);
    if (moved?.ok !== true) throw new Error(`could not put the ${page.side} page's player back at the start of the walk: ${moved?.error ?? "no answer"}`);
    // The teleport's own camera turn swings round the camera's old target, so the view after it
    // pointed from where the last walk ended and alternate windows walked two routes (north-east at
    // 27 ms, south at 16 ms; harbor-heat, 2026-11-09). Turned again once the camera follows the new
    // spot, every window walks one route.
    await page.session.evaluate(`new Promise((r) => setTimeout(r, ${TURN_SETTLE_MS}))`, { awaitPromise: true });
    await page.session.evaluate(`window.__jgengineAgent?.handle?.(${JSON.stringify({ method: "camera_heading", yaw: page.home.yaw })})`);
    await page.session.evaluate(`new Promise((r) => setTimeout(r, ${TURN_SETTLE_MS}))`, { awaitPromise: true });
  }
  page.stopPath = await startPath(page.session, path);
  await page.session.evaluate(`new Promise((r) => setTimeout(r, ${SETTLE_MS}))`, { awaitPromise: true });
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
async function measurePair(game: string, serve: (side: Side) => Promise<string>, args: AbArgs, ports: Record<Side, number>): Promise<Omit<AbGameResult, "lockSeconds">> {
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
    // Base loads first and waits frozen while the branch loads, so neither page draws while the other is timed.
    const loadAt = Date.now();
    pages.base = await openSide("base", ports.base, browsers.base, serve, game, args);
    await pause(pages.base);
    pages.branch = await openSide("branch", ports.branch, browsers.branch, serve, game, args);
    await pause(pages.branch);
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
      if (!Number.isFinite(median)) throw new Error(`the ${side} page drew no frames in pair ${block}`);
      windows.push({
        block, side, medianMs: Math.round(median * 1000) / 1000, frames: deltas.length,
        timedCpu: rendererCpuPct(timedBefore, timedAfter, ms), idleCpu: rendererCpuPct(idleBefore, idleAfter, ms), raised, lowAfter,
        route: from === null || to === null ? null : { from, to },
      });
      return median;
    };
    // One pair first, thrown away: each page's first window after its warmup pause is not like the rest.
    await run("base", 0);
    await run("branch", 0);
    // Strictly alternating, base first and last: a page timed twice running read about 30 ms where the
    // same page timed right after the other read 14-19 ms (harbor-heat, 2026-11-09), so every window
    // follows the other page's. Each branch window is held against the mean of the base windows on
    // either side of it, which also takes out a drift that is linear over three windows.
    const ratios: number[] = [];
    let before = await run("base", 1);
    for (let block = 1; block <= args.maxBlocks; block += 1) {
      const branch = await run("branch", block);
      const after = await run("base", block + 1);
      ratios.push(bracketedLogRatio(before, branch, after));
      const verdict = abVerdict(ratios, args);
      console.error(`perf ab: ${game} pair ${block}: base ${before.toFixed(2)} / ${after.toFixed(2)} ms, branch ${branch.toFixed(2)} ms${verdict === null ? "" : ` -> ${verdict.call}`}`);
      before = after;
      if (verdict !== null) {
        console.error(`perf ab: ${game}: ${verdict.blocks} pairs in ${Math.round((Date.now() - measureAt) / 1000)} s`);
        const spread = routeSpread(windows);
        if (spread > ROUTE_SPREAD_MAX_M) console.error(`degraded: the windows' walks ended up to ${spread.toFixed(1)} m apart, so they did not all walk one route`);
        const busyIdle = windows.filter((window) => window.idleCpu > IDLE_CPU_MAX_PCT).length;
        if (busyIdle > 0) console.error(`degraded: in ${busyIdle} of ${windows.length} windows the frozen side's renderers still used over ${IDLE_CPU_MAX_PCT}% of a core`);
        const side = (which: Side) => medianMs(windows.filter((window) => window.side === which && window.block > 0).map((window) => window.medianMs));
        return { game, verdict, baseMs: side("base"), branchMs: side("branch"), windows };
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

export function renderAbTable(results: readonly AbGameResult[], options: { markdown: boolean; marginPct: number }): string {
  const head = ["game", "verdict", "change", "99% interval", "base p50 ms", "branch p50 ms", "pairs", "lock s"];
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

  const results: AbGameResult[] = [];
  let failure: string | null = null;
  try {
    for (const game of games) {
      for (const dir of [base.dir, repoRoot]) await provisionCapturedGame(join(dir, "games", game), (line) => console.error(`perf ab: ${line}`));
      const releaseLock = await acquirePerfLock(`perf ab ${game}`);
      const serve = async (side: Side): Promise<string> => {
        const server = await ensureDevServer(side === "base" ? base.dir : repoRoot);
        if (server.pid !== undefined) started.push(server);
        return server.base;
      };
      const heldAt = Date.now();
      try {
        let measured: Omit<AbGameResult, "lockSeconds"> | null = null;
        const session = { keep: false, timeoutMs: 180_000, hardDeadlineMs: 2 * 2 * PAGE_READY_MS + 2 * WARMUP_MS + (parsed.maxBlocks + 2) * 2 * (parsed.windowSeconds * 1000 + SETTLE_MS + 1_000) + 120_000, frameClock: "uncapped", chromePriority: "normal" } as const;
        let inner = 0;
        const exit = await withBrowserSession(session, async ({ debugPort: basePort }) => {
          inner = await withBrowserSession(session, async ({ debugPort: branchPort }) => {
            measured = await measurePair(game, serve, parsed, { base: basePort, branch: branchPort });
          });
        });
        if (exit !== 0 || inner !== 0 || measured === null) throw new Error(`the browser sessions exited ${exit} and ${inner}`);
        const now = { base: treeFingerprint(base.dir), branch: treeFingerprint(repoRoot) };
        for (const side of ["base", "branch"] as const) {
          if (now[side] !== fingerprints[side]) throw new Error(`the ${side} checkout's files changed while ${game} was measured, so its numbers describe neither version; measure again without editing`);
        }
        const result: AbGameResult = { ...(measured as Omit<AbGameResult, "lockSeconds">), lockSeconds: Math.round((Date.now() - heldAt) / 1000) };
        results.push(result);
        writeFileSync(join(parsed.out, `${game}.json`), `${JSON.stringify({ base: base.label, branch: branchHead, plantMs: parsed.plantMs, ...result }, null, 2)}\n`);
        console.error(`perf ab: ${game} ${CALL_TEXT[result.verdict.call]} ${result.verdict.changePct}% (${result.verdict.lowPct}..${result.verdict.highPct}) over ${result.verdict.blocks} pairs, ${result.lockSeconds} s holding the lock`);
      } catch (error) {
        failure = `${game}: ${error instanceof Error ? error.message : String(error)}`;
        break;
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
  if (results.length > 0) {
    const plant = parsed.plantMs > 0 ? ` A ${parsed.plantMs} ms busy-wait was planted in every branch frame.` : "";
    console.log(`Branch ${branchHead} against base ${base.label}: frame time per game, ${parsed.windowSeconds} s windows taken in turns, ${parsed.path === "walk" ? "walking" : "standing still"}, ${GATE_SIZE.width}x${GATE_SIZE.height}, high tier, uncapped. Positive change = the branch's frames take longer.${plant}\n`);
    console.log(renderAbTable(results, { markdown: parsed.markdown, marginPct: parsed.marginPct }));
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
