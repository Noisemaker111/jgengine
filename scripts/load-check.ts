// `bun run shoot --load <game|all>`: how fast a game opens on jgengine.com, measured on this PC.
// It serves a production build of the site (apps/web with the /play runner) and opens
// /games/<id> in a fresh Chrome profile per game, so the HTTP, code and GPU shader caches are as
// cold as a first visit. Local only: it needs a real GPU and a window, so CI never runs it.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Frame, type Page } from "playwright-core";

import { assetStoreRoot } from "../packages/assets/src/assetStore";
import { provisionGame } from "../games/shared/provisionAssets";
import { compressedVariant, textureVariantDir } from "../games/shared/textureVariants";
import { killPid, pickDebugPort, removeProfileDir, startBrowser, waitForPidExit } from "./browser-lib";
import { printHelpIfAsked } from "./script-help";
import { BOOT_SEQUENCE_ATTRIBUTE, bootSequenceErrors, parseBootSequence } from "../packages/core/src/boot/bootSequence";
import { siteGames } from "./siteGames";
import { EXIT_UNJUDGED } from "./stepScheduler";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const webRoot = join(repoRoot, "apps", "web");

export const LOAD_USAGE = {
  summary: "cold-cache load times per game on a production build of the site (local only, real GPU)",
  usage: "bun run shoot --load <game|all> [--runs n] [--no-build] [--headless] [--trace] [--compare <json>]",
  flags: [
    { flag: "<game|all>", detail: "one games/<id>, a comma list, or all of them" },
    { flag: "--runs n", detail: "cold runs per game; the median is reported (default 1)" },
    { flag: "--no-build", detail: "reuse the last production build in apps/web/dist" },
    { flag: "--headless", detail: "headless Chrome instead of an off-screen window (still the real GPU)" },
    { flag: "--trace", detail: "save a Chrome performance trace per game next to the results" },
    { flag: "--compare <json>", detail: "a previous results file; the table shows before -> after" },
    { flag: "--timeout s", detail: "give up on a game after this many seconds (default 90)" },
    { flag: "--guard", detail: "fail when a game loads slower than scripts/load-baseline.json says (runner-only build; verify:fast runs it)" },
    { flag: "--save-baseline", detail: "measure the games the way --guard does and write them into scripts/load-baseline.json" },
  ],
  example: "bun run shoot --load all --compare .scratch/load/before.json",
} as const;

export interface LoadArgs {
  games: string[];
  runs: number;
  build: boolean;
  headless: boolean;
  trace: boolean;
  compare: string | null;
  timeoutMs: number;
  /** Compare against the saved baseline and exit 1 on a regression. */
  guard: boolean;
  /** Write this run into the saved baseline. */
  saveBaseline: boolean;
}

export function parseLoadArgs(argv: readonly string[], known: readonly string[]): LoadArgs {
  const args: LoadArgs = { games: [], runs: 1, build: true, headless: false, trace: false, compare: null, timeoutMs: 90_000, guard: false, saveBaseline: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      index += 1;
      return next;
    };
    if (arg === "--runs") args.runs = Math.max(1, Number.parseInt(value(), 10) || 1);
    else if (arg === "--no-build") args.build = false;
    else if (arg === "--headless") args.headless = true;
    else if (arg === "--trace") args.trace = true;
    else if (arg === "--compare") args.compare = value();
    else if (arg === "--timeout") args.timeoutMs = Math.max(5, Number(value())) * 1000;
    else if (arg === "--guard") args.guard = true;
    else if (arg === "--save-baseline") args.saveBaseline = true;
    else if (arg.startsWith("--")) throw new Error(`unknown flag ${arg}`);
    else args.games.push(...(arg === "all" ? known : arg.split(",").filter((id) => id.length > 0)));
  }
  if (args.games.length === 0) throw new Error("name a game or `all`");
  const unknown = args.games.filter((id) => !known.includes(id));
  if (unknown.length > 0) throw new Error(`unknown game ${unknown.join(", ")}; known: ${known.join(", ")}`);
  args.games = [...new Set(args.games)];
  return args;
}

/** One cold open of one game. Times are ms from the site page's navigation start; null = never. */
export interface LoadSample {
  game: string;
  /** First contentful paint of the /play frame. */
  firstPaint: number | null;
  /** A menu button is on top and visible. */
  menuShown: number | null;
  /**
   * The worst wait a click on the menu could have had: the longest gap between drawn frames while
   * the menu was up, or the Play press's own wait for a frame, whichever is longer. A click is
   * seen only when a frame draws after it, so a frozen frame is a dead button.
   */
  worstClick: number | null;
  /** Loading covers gone and 30 frames in a row under 50 ms, with the menu still up. */
  sceneReady: number | null;
  /** The same, after Play was pressed: the player is in the game. */
  playable: number | null;
  /** The longest gap between drawn frames in the two seconds after the loading cover lifts. */
  revealWorstFrame: number | null;
  /** Every gap between drawn frames in those two seconds, in order; the first is the reveal frame's own. */
  revealFrames?: number[];
  /** When the post chain's effects came on, in ms after the reveal; null when they did not within those two seconds. */
  effectsAfterReveal?: number | null;
  /** The game's own full-screen menu covered the canvas at the reveal, so the two seconds were timed from when it lifted after the Play press. */
  revealCovered?: boolean;
  longestTaskMs: number;
  /** Sum over main-thread tasks of the time each spent past 50 ms. */
  blockingMs: number;
  /** Bytes the page and the frame fetched. */
  transferKb: number;
  menuLabel: string | null;
  /** The first console errors and uncaught exceptions, when there were any. */
  pageErrors?: string[];
  /** Distinct coarse colours in the scene canvas at scene ready; a blank scene has a handful. */
  sceneColors?: number | null;
  /** WebGL errors the page logged (a failed draw draws nothing). */
  glErrors?: number;
  /** The WebGL renderer string: timings are only comparable on the same GPU. */
  gpu?: string;
  /** The screens the game showed, in order (`open>loading>menu>playing`), as the engine recorded them. */
  boot?: string | undefined;
  /** Files the game asked for that the server did not have. */
  missingFiles?: string[];
  error?: string;
}

/** Runs in every frame before any page script; only the /play frame records. */
export const PAGE_PROBE = `(() => {
  if (!location.pathname.startsWith("/play")) return;
  const epoch = () => performance.timeOrigin + performance.now();
  const s = (window.__jgLoad = { tasks: [], fcpAt: null, menuAt: null, menuBox: null, menuLabel: null, menuStall: 0, sceneReadyAt: null, sceneColors: null, sceneSampled: false, revealAt: null, revealFrames: [], revealDone: false, revealCovered: false, effectsAfterReveal: null, pressAt: null, respondedAt: null, playableAt: null });
  // The canvas keeps its last frame, so the scene can be read back at scene ready.
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, options) {
    return getContext.call(this, type, type === "webgl2" || type === "webgl" ? { ...(options || {}), preserveDrawingBuffer: true } : options);
  };
  // How many distinct colours the largest canvas shows, coarsely: a drawn scene has dozens, a scene
  // whose every draw failed is one flat clear colour.
  const sceneColors = () => {
    const canvases = [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height);
    const source = canvases[0];
    if (source === undefined || source.width === 0) return null;
    const probe = document.createElement("canvas");
    probe.width = 64; probe.height = 36;
    const g = probe.getContext("2d");
    try { g.drawImage(source, 0, 0, 64, 36); } catch { return null; }
    const px = g.getImageData(0, 0, 64, 36).data;
    const seen = new Set();
    for (let i = 0; i < px.length; i += 4) seen.add((px[i] >> 4) * 256 + (px[i + 1] >> 4) * 16 + (px[i + 2] >> 4));
    return seen.size;
  };
  const at = (t) => performance.timeOrigin + t;
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) s.tasks.push([Math.round(at(e.startTime)), Math.round(e.duration)]); }).observe({ type: "longtask", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.name === "first-contentful-paint") s.fcpAt = at(e.startTime); }).observe({ type: "paint", buffered: true });
  } catch {}
  const PRIMARY = /^(play|start|new game|new run|continue|begin|enter|launch|resume)/i;
  const onTop = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
    // The part inside the view: a menu card can run past the bottom of the frame.
    const left = Math.max(0, r.left), top = Math.max(0, r.top);
    const seen = { left, top, width: Math.min(innerWidth, r.right) - left, height: Math.min(innerHeight, r.bottom) - top };
    if (seen.width < 4 || seen.height < 4) return null;
    const hit = document.elementFromPoint(seen.left + seen.width / 2, seen.top + seen.height / 2);
    return hit !== null && (hit === el || el.contains(hit)) ? seen : null;
  };
  const findMenu = () => {
    if (s.pressAt !== null || document.body === null) return;
    const items = [...document.querySelectorAll("[data-jg-menu-item]")];
    const buttons = items.length > 0 ? items : [...document.querySelectorAll("button")];
    const enabled = (el) => !el.disabled && el.getAttribute("aria-disabled") !== "true" && el.getAttribute("data-disabled") === null;
    const shown = buttons.filter(enabled).map((el) => [el, onTop(el)]).filter(([, r]) => r !== null);
    if (shown.length === 0) return;
    const [el, r] = shown.find(([el]) => PRIMARY.test((el.textContent || "").trim())) ?? shown[0];
    if (s.menuAt === null) s.menuAt = epoch();
    s.menuBox = { x: r.left, y: r.top, w: r.width, h: r.height };
    s.menuLabel = (el.textContent || "").trim().slice(0, 40);
  };
  new MutationObserver(findMenu).observe(document, { subtree: true, childList: true, attributes: true });
  // A press is what a player feels; a click may never fire when the menu re-renders between
  // press and release, so the first trusted press counts.
  addEventListener("pointerdown", (event) => {
    if (s.pressAt !== null || !event.isTrusted) return;
    s.pressAt = at(event.timeStamp);
    requestAnimationFrame(() => requestAnimationFrame(() => { s.respondedAt = epoch(); }));
  }, true);
  let last = 0, smooth = 0, runStart = 0, sampleTick = 0, sampleFrom = null;
  const SAMPLE_MS = 2000, REVEAL_MS = 2000;
  const frame = () => {
    const now = epoch();
    findMenu();
    if (s.menuAt !== null && s.pressAt === null && last !== 0) s.menuStall = Math.max(s.menuStall, now - Math.max(last, s.menuAt));
    const covered = document.querySelector("[data-shell-code-loading]") !== null || document.querySelector("canvas") === null;
    // A game's full-screen menu stops the world drawing under it: its frames time nothing and the
    // canvas holds whatever was last drawn, so the window and the scene read wait for it to lift.
    const hidden = window.__jgengineAgent?.handle({ method: "canvas_cover" })?.covered === true;
    if (!covered && hidden && s.pressAt === null) {
      s.revealCovered = true;
      s.revealAt = null;
      s.revealFrames = [];
    } else if (!covered && !hidden && last !== 0 && !s.revealDone && (s.pressAt === null || s.revealCovered)) {
      if (s.revealAt === null) s.revealAt = now;
      if (now - s.revealAt <= REVEAL_MS) s.revealFrames.push(Math.round((now - last) * 10) / 10);
      else {
        s.revealDone = true;
        const effects = performance.getEntriesByName("jg:postfx:effects")[0];
        s.effectsAfterReveal = effects === undefined ? null : Math.round(at(effects.startTime) - s.revealAt);
      }
    }
    if (covered || last === 0 || now - last >= 50) { smooth = 0; runStart = now; }
    else if (++smooth >= 30) {
      if (s.pressAt === null && s.sceneReadyAt === null) s.sceneReadyAt = runStart;
      if (s.pressAt !== null && runStart >= s.pressAt && s.playableAt === null) s.playableAt = runStart;
    }
    // The scene is read a few times over the two seconds after scene ready, keeping the richest
    // read, so a fade-in or a title card at that moment does not read as a blank scene.
    if (s.sceneReadyAt !== null && !s.sceneSampled && !hidden && ++sampleTick % 15 === 1) {
      sampleFrom ??= now;
      const colors = sceneColors();
      if (colors !== null) s.sceneColors = Math.max(s.sceneColors ?? 0, colors);
      if (now - sampleFrom >= SAMPLE_MS) s.sceneSampled = true;
    }
    last = now;
    if (s.playableAt === null || !s.revealDone || !s.sceneSampled) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();`;

interface ProbeState {
  tasks: [number, number][];
  fcpAt: number | null;
  menuAt: number | null;
  menuBox: { x: number; y: number; w: number; h: number } | null;
  menuLabel: string | null;
  menuStall: number;
  sceneReadyAt: number | null;
  sceneColors: number | null;
  sceneSampled: boolean;
  revealAt: number | null;
  revealFrames: number[];
  revealDone: boolean;
  revealCovered: boolean;
  /** When the post effects came on (the engine marks it), in ms after the reveal; null when not within the window. */
  effectsAfterReveal: number | null;
  pressAt: number | null;
  respondedAt: number | null;
  playableAt: number | null;
}

/** How long the menu may wait for the scene to settle before Play is pressed anyway. */
const PRESS_AFTER_MENU_MS = 60_000;

function median(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  if (present.length === 0) return null;
  return present[Math.floor(present.length / 2)]!;
}

/** The median of each measure over a game's runs, so one slow cold start does not decide. */
export function summarizeRuns(samples: readonly LoadSample[]): LoadSample {
  const first = samples[0]!;
  const pick = (key: "firstPaint" | "menuShown" | "worstClick" | "sceneReady" | "playable" | "revealWorstFrame" | "longestTaskMs" | "blockingMs" | "transferKb") =>
    median(samples.map((sample) => sample[key]));
  return {
    game: first.game,
    firstPaint: pick("firstPaint"),
    menuShown: pick("menuShown"),
    worstClick: pick("worstClick"),
    sceneReady: pick("sceneReady"),
    playable: pick("playable"),
    revealWorstFrame: pick("revealWorstFrame"),
    longestTaskMs: pick("longestTaskMs") ?? 0,
    blockingMs: pick("blockingMs") ?? 0,
    transferKb: pick("transferKb") ?? 0,
    menuLabel: first.menuLabel,
    sceneColors: median(samples.map((sample) => sample.sceneColors ?? null)),
    glErrors: Math.max(0, ...samples.map((sample) => sample.glErrors ?? 0)),
    ...(samples.every((sample) => sample.error !== undefined) ? { error: first.error } : {}),
  };
}

const COLUMNS = [
  ["first paint", "firstPaint"],
  ["menu shown", "menuShown"],
  ["worst click", "worstClick"],
  ["scene ready", "sceneReady"],
  ["playable", "playable"],
  ["worst frame after reveal", "revealWorstFrame"],
  ["longest task", "longestTaskMs"],
  ["blocking", "blockingMs"],
  ["KB", "transferKb"],
] as const;

const cell = (value: number | null | undefined) => (value === null || value === undefined ? "-" : String(Math.round(value)));

/** Frame gaps in the two seconds after the reveal: how many, the worst, the median and how many missed 30 fps. @internal */
export function revealSummary(frames: readonly number[] | undefined, covered = false): string {
  if (frames === undefined || frames.length === 0) return covered ? "no frames (the game's menu never lifted)" : "no frames";
  const sorted = [...frames].sort((a, b) => a - b);
  const slow = frames.filter((gap) => gap > 33.4).length;
  return `${frames.length} frames${covered ? " once the game's menu lifted" : ""}, worst ${Math.round(sorted[sorted.length - 1]!)} ms, median ${Math.round(sorted[Math.floor(sorted.length / 2)]!)} ms, ${slow} over 33 ms`;
}

/** A markdown table, with `before -> after` cells when a previous run is given. */
export function renderTable(rows: readonly LoadSample[], before: readonly LoadSample[] = []): string {
  const previous = new Map(before.map((row) => [row.game, row]));
  const header = `| game | ${COLUMNS.map(([label]) => label).join(" | ")} |`;
  const rule = `|---|${COLUMNS.map(() => "---:").join("|")}|`;
  const body = rows.map((row) => {
    const old = previous.get(row.game);
    const cells = COLUMNS.map(([, key]) => (old === undefined ? cell(row[key]) : `${cell(old[key])} -> ${cell(row[key])}`));
    return `| ${row.game}${row.error === undefined ? "" : " (error)"} | ${cells.join(" | ")} |`;
  });
  return [header, rule, ...body].join("\n");
}

/** Where `--guard` keeps each game's accepted load on this machine's GPU. */
export const BASELINE_FILE = join(repoRoot, "scripts", "load-baseline.json");

export interface LoadBaseline {
  gpu: string;
  games: Record<string, { worstClick: number | null; sceneReady: number | null }>;
}

/**
 * How much slower than its baseline a game may load before the guard fails it. The margins are
 * run-to-run noise on one PC (a cold profile still varies by about a second), not slack.
 */
export const GUARD_LIMITS = {
  worstClick: { ratio: 1.5, ms: 400, label: "worst freeze" },
  sceneReady: { ratio: 1.3, ms: 1500, label: "scene ready" },
} as const;

/** Fewer distinct coarse colours than this in the scene canvas reads as a blank scene, not a drawn one. */
export const BLANK_SCENE_COLORS = 40;

/**
 * What a game's open did wrong whatever its timing: a screen shown twice or out of order (a second
 * loading screen, a world that vanished to load), or a file the server did not have.
 */
export function judgeOpen(game: string, sample: LoadSample): string[] {
  const failures: string[] = [];
  if (sample.boot === undefined) failures.push(`${game}: the engine recorded no boot sequence`);
  else {
    const boot = parseBootSequence(sample.boot);
    for (const error of bootSequenceErrors(boot.history, boot.refused)) failures.push(`${game}: boot ${boot.history.join(" > ")}: ${error}`);
  }
  if (sample.missingFiles !== undefined && sample.missingFiles.length > 0) {
    failures.push(`${game}: ${sample.missingFiles.length} files missing on the server: ${[...new Set(sample.missingFiles)].slice(0, 5).join(", ")}`);
  }
  return failures;
}

/** Each way `now` loads worse than `base`, as a sentence; empty when it holds. */
export function judgeLoad(game: string, base: LoadBaseline["games"][string], now: LoadSample): string[] {
  if (now.error !== undefined) return [`${game}: ${now.error}`];
  const failures: string[] = [];
  if (now.sceneColors != null && now.sceneColors < BLANK_SCENE_COLORS) {
    failures.push(`${game}: the scene drew blank at scene ready (${now.sceneColors} colours; ${now.glErrors ?? 0} WebGL errors logged)`);
  }
  for (const key of ["worstClick", "sceneReady"] as const) {
    const was = base[key];
    if (was === null) continue;
    const { ratio, ms, label } = GUARD_LIMITS[key];
    const limit = Math.round(Math.max(was * ratio, was + ms));
    const is = now[key];
    if (is === null) failures.push(`${game}: ${label} never happened (baseline ${was} ms)`);
    else if (is > limit) failures.push(`${game}: ${label} ${is} ms, baseline ${was} ms, limit ${limit} ms`);
  }
  return failures;
}

/**
 * Above this share of the PC's CPU in use by other work, a slower load cannot be told from
 * contention. Measured 28 Oct: with four plant fits and two glacier runs holding a 24-thread PC at
 * 100%, harbor-heat reached its scene in 18.3 s against a 9.4 s baseline on an unchanged engine.
 */
export const BUSY_LIMIT = 0.5;

export interface CpuTimes {
  busy: number;
  idle: number;
}

/** Busy and idle CPU time summed over every core, from `os.cpus()`. */
export function cpuTimes(cores: readonly { times: { user: number; nice: number; sys: number; idle: number; irq: number } }[]): CpuTimes {
  let busy = 0;
  let idle = 0;
  for (const { times } of cores) {
    busy += times.user + times.nice + times.sys + times.irq;
    idle += times.idle;
  }
  return { busy, idle };
}

/** The share of the PC's CPU in use between two `cpuTimes` snapshots, 0..1. */
export function busyShare(before: CpuTimes, after: CpuTimes): number {
  const busy = after.busy - before.busy;
  const total = busy + (after.idle - before.idle);
  return total <= 0 ? 0 : Math.min(1, Math.max(0, busy / total));
}

/** How busy the PC is right now, with nothing of the guard's own running: two seconds of samples. */
async function machineBusy(): Promise<number> {
  const before = cpuTimes(cpus());
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return busyShare(before, cpuTimes(cpus()));
}

/**
 * The guard's verdict on a load slower than its baseline: a failure on a quiet PC, and not judged
 * on one other work kept busy, since the wall clock then measures the neighbours.
 */
export function guardVerdict(judged: readonly string[], busy: number): { failures: string[]; unjudged: string[] } {
  if (judged.length === 0) return { failures: [], unjudged: [] };
  if (busy <= BUSY_LIMIT) return { failures: [...judged], unjudged: [] };
  const share = `${Math.round(busy * 100)}%`;
  return { failures: [], unjudged: judged.map((line) => `${line}, but other work held this PC ${share} busy`) };
}

/** The better of two runs per measure, so one noisy run cannot fail the guard. */
export function bestOf(a: LoadSample, b: LoadSample): LoadSample {
  const min = (x: number | null, y: number | null) => (x === null ? y : y === null ? x : Math.min(x, y));
  const most = (x: number | null | undefined, y: number | null | undefined) => (x == null ? (y ?? null) : y == null ? x : Math.max(x, y));
  const best: LoadSample = { ...b, worstClick: min(a.worstClick, b.worstClick), sceneReady: min(a.sceneReady, b.sceneReady), sceneColors: most(a.sceneColors, b.sceneColors) };
  if (a.error === undefined || b.error === undefined) delete best.error;
  return best;
}

function readBaseline(): LoadBaseline | null {
  return existsSync(BASELINE_FILE) ? (JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as LoadBaseline) : null;
}

/** The /play runner alone (apps/dev reads package source), so the guard skips the site and package builds. */
const runnerRoot = join(repoRoot, ".scratch", "load", "runner");

function buildRunner(): void {
  console.error("load: building the /play runner for production…");
  const result = spawnSync("bun", ["x", "vite", "build", "--base", "/play/", "--outDir", join(runnerRoot, "play"), "--emptyOutDir", "--logLevel", "warn"], {
    cwd: join(repoRoot, "apps", "dev"),
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error("load: the /play runner build failed");
}

function buildSite(): void {
  console.error("load: building the site (apps/web + /play) for production…");
  const result = spawnSync("bun", ["run", "--cwd", webRoot, "build"], { cwd: repoRoot, stdio: "inherit" });
  if (result.status !== 0) throw new Error("load: the production build failed");
}

/**
 * Serves apps/web's production output the way Cloudflare's asset layer does: prerendered pages as
 * `<path>/index.html` and the `_headers` cache rules. Every game page is prerendered, so no worker
 * code runs on the path this check measures.
 */
export function serveSite(clientDir = join(webRoot, "dist", "client"), entry = "index.html"): { base: string; stop: () => void } {
  if (!existsSync(join(clientDir, entry))) throw new Error(`load: no production build at ${join(clientDir, entry)}; drop --no-build`);
  const resolve = (pathname: string): string | null => {
    const clean = decodeURIComponent(pathname).replace(/\.\.+/g, "");
    for (const candidate of [clean, `${clean}/index.html`, `${clean}.html`]) {
      const path = join(clientDir, candidate);
      if (existsSync(path) && statSync(path).isFile()) return path;
    }
    return null;
  };
  // Every file comes from the build, game models included (`games/<id>/` under /play), as on the live site.
  const variantDir = textureVariantDir(assetStoreRoot(repoRoot));
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => {
      const { pathname, search } = new URL(request.url);
      const built = resolve(pathname);
      const path = built === null ? null : (compressedVariant(built, search, variantDir) ?? built);
      if (path === null) return new Response("not found", { status: 404 });
      const hashed = pathname.startsWith("/assets/") || pathname.startsWith("/play/assets/");
      return new Response(Bun.file(path), {
        headers: { "cache-control": hashed ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate" },
      });
    },
  });
  return { base: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}

/**
 * Links or downloads every pack the measured games reference, the same as `games:provision`, so a
 * fresh worktree never times a game drawing placeholder boxes and flat materials.
 */
async function provisionGames(games: readonly string[]): Promise<void> {
  const failed: string[] = [];
  for (const game of games) {
    const result = await provisionGame(join(repoRoot, "games", game), { log: (line) => console.error(`load: ${line}`) });
    failed.push(...result.failed.map((target) => `${game}: ${target}`));
  }
  if (failed.length > 0) throw new Error(`load: could not provision ${failed.join(", ")}; a game without its packs loads unlike the real one`);
}

async function playFrame(page: Page): Promise<Frame | null> {
  return page.frames().find((frame) => new URL(frame.url(), "http://x").pathname.startsWith("/play")) ?? null;
}

async function measureOnce(base: string, game: string, path: string, args: LoadArgs, shotDir: string): Promise<LoadSample> {
  const started = await startBrowser({ debugPort: pickDebugPort(), prefix: "jg-load-", headed: !args.headless });
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${started.debugPort}`);
  const sample: LoadSample = { game, firstPaint: null, menuShown: null, worstClick: null, sceneReady: null, playable: null, revealWorstFrame: null, longestTaskMs: 0, blockingMs: 0, transferKb: 0, menuLabel: null };
  try {
    const context = browser.contexts()[0]!;
    await context.addInitScript({ content: PAGE_PROBE });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.setViewportSize({ width: 1280, height: 720 });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.text().includes("GL_INVALID")) sample.glErrors = (sample.glErrors ?? 0) + 1;
      // A failed fetch is named by the response listener below, with its path.
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) pageErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() < 400) return;
      const path = new URL(response.url()).pathname;
      pageErrors.push(`${response.status()} ${path}`);
      if (response.status() === 404 && path.startsWith("/play/")) (sample.missingFiles ??= []).push(path);
    });
    if (args.trace) {
      await browser.startTracing(page, {
        path: join(shotDir, `${game}.trace.json`),
        screenshots: true,
        categories: ["devtools.timeline", "v8.execute", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "disabled-by-default-v8.cpu_profiler", "blink.user_timing", "gpu", "loading"],
      });
    }
    const navigation = page.goto(`${base}${path}`, { waitUntil: "commit", timeout: args.timeoutMs });
    await navigation;
    const origin = await page.evaluate(() => performance.timeOrigin);
    const deadline = Date.now() + args.timeoutMs;
    let pressed = false;
    let state: ProbeState | null = null;
    while (Date.now() < deadline) {
      const frame = await playFrame(page);
      state = frame === null ? null : await frame.evaluate(() => (window as unknown as { __jgLoad?: ProbeState }).__jgLoad ?? null).catch(() => null);
      // Play is pressed once the scene behind the menu has settled and the two seconds after the
      // reveal are timed (the press would load the level into them), or after a long wait.
      const settled = state !== null && ((state.sceneReadyAt !== null && (state.revealDone || state.revealCovered)) || (state.menuAt !== null && Date.now() - state.menuAt > PRESS_AFTER_MENU_MS));
      if (state !== null && state.menuBox !== null && !pressed && settled) {
        const box = frame === page.mainFrame() ? { x: 0, y: 0 } : await (await frame!.frameElement()).boundingBox();
        if (box !== null) {
          pressed = true;
          // Not awaited: a press into a frozen page only resolves once the page takes it.
          void page.mouse.click(box.x + state.menuBox.x + state.menuBox.w / 2, box.y + state.menuBox.y + state.menuBox.h / 2).catch(() => {});
        }
      }
      if (process.env["JG_LOAD_DEBUG"] === "1") console.error(`load: ${Date.now() - (deadline - args.timeoutMs)}ms ${JSON.stringify({ ...state, tasks: state?.tasks.length })}`);
      if (state?.playableAt != null && state.revealDone) break;
      // The guard judges the menu and the scene behind it, so it stops once the scene is read and its first two seconds timed.
      if ((args.guard || args.saveBaseline) && state?.sceneReadyAt != null && state.sceneSampled && state.revealDone) break;
      // wait-ok: samples the page's own probe while the game loads
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (state !== null) {
      const rel = (value: number | null) => (value === null ? null : Math.max(0, Math.round(value - origin)));
      sample.firstPaint = rel(state.fcpAt);
      sample.menuShown = rel(state.menuAt);
      const press = state.pressAt !== null && state.respondedAt !== null ? state.respondedAt - state.pressAt : null;
      sample.worstClick = state.menuAt === null ? null : Math.round(Math.max(state.menuStall, press ?? 0));
      sample.sceneReady = rel(state.sceneReadyAt);
      sample.sceneColors = state.sceneColors;
      sample.playable = rel(state.playableAt);
      sample.revealCovered = state.revealCovered;
      sample.revealFrames = state.revealFrames;
      sample.effectsAfterReveal = state.effectsAfterReveal;
      sample.revealWorstFrame = sample.revealFrames.length === 0 ? null : Math.max(...sample.revealFrames);
      sample.menuLabel = state.menuLabel;
    }
    sample.gpu = (await page
      .evaluate(() => {
        const gl = document.createElement("canvas").getContext("webgl2");
        const info = gl?.getExtension("WEBGL_debug_renderer_info");
        return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown";
      })
      .catch(() => "unknown")) as string;
    const frame = await playFrame(page);
    sample.boot = (await frame?.evaluate((name) => document.documentElement.getAttribute(name), BOOT_SEQUENCE_ATTRIBUTE).catch(() => null)) ?? undefined;
    const tasks = [
      ...(state?.tasks ?? []),
      ...((await page.evaluate(() => performance.getEntriesByType("longtask").map((entry) => Math.round(entry.duration))).catch(() => [])) as number[]).map((duration) => [0, duration] as [number, number]),
    ];
    sample.longestTaskMs = Math.max(0, ...tasks.map(([, duration]) => duration));
    sample.blockingMs = tasks.reduce((sum, [, duration]) => sum + Math.max(0, duration - 50), 0);
    const bytes = async (target: Page | Frame | null) =>
      target === null ? 0 : await target.evaluate(() => performance.getEntriesByType("resource").reduce((sum, entry) => sum + ((entry as PerformanceResourceTiming).transferSize || (entry as PerformanceResourceTiming).encodedBodySize || 0), 0)).catch(() => 0);
    sample.transferKb = Math.round(((await bytes(page)) + (await bytes(frame))) / 1024);
    await page.screenshot({ path: join(shotDir, `${game}.png`) }).catch(() => {});
    if (pageErrors.length > 0) sample.pageErrors = pageErrors.slice(0, 40).map((line) => line.slice(0, 300));
    if (args.trace) await browser.stopTracing();
  } catch (error) {
    sample.error = error instanceof Error ? error.message : String(error);
  } finally {
    await browser.close().catch(() => {});
    killPid(started.browser.pid, true);
    await waitForPidExit(started.browser.pid);
    removeProfileDir(started.profilePath);
  }
  return sample;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  printHelpIfAsked("shoot --load", LOAD_USAGE, argv);
  const args = parseLoadArgs(argv, siteGames());
  const runner = args.guard || args.saveBaseline;
  if (runner && process.env["CI"] !== undefined) {
    console.error("load: the load guard needs this PC's GPU and never runs in CI; skipped");
    return 0;
  }
  await provisionGames(args.games);
  if (args.build) (runner ? buildRunner : buildSite)();
  const outDir = join(repoRoot, ".scratch", "load");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(outDir, stamp);
  mkdirSync(runDir, { recursive: true });
  const before = args.compare === null ? [] : (JSON.parse(readFileSync(args.compare, "utf8")) as { rows: LoadSample[] }).rows;
  const server = runner ? serveSite(runnerRoot, join("play", "index.html")) : serveSite();
  const pathOf = (game: string) => (runner ? `/play/?game=${game}` : `/games/${game}`);
  const baseline = readBaseline();
  const rows: LoadSample[] = [];
  const allSamples: LoadSample[] = [];
  const failures: string[] = [];
  const unjudged: string[] = [];
  const log = (game: string, run: number, sample: LoadSample) =>
    console.error(`load: ${game} run ${run}: paint ${cell(sample.firstPaint)} menu ${cell(sample.menuShown)} worst click ${cell(sample.worstClick)} scene ${cell(sample.sceneReady)} playable ${cell(sample.playable)} ms, after reveal ${revealSummary(sample.revealFrames, sample.revealCovered)}, effects on ${sample.effectsAfterReveal == null ? "-" : `${sample.effectsAfterReveal >= 0 ? "+" : ""}${sample.effectsAfterReveal}`} ms, ${sample.sceneColors ?? "-"} colours, ${sample.glErrors ?? 0} GL errors, boot ${sample.boot ?? "-"}${sample.error === undefined ? "" : ` (${sample.error})`}`);
  try {
    for (const game of args.games) {
      // Other sessions' work comes in bursts, so the PC is sampled before the runs as well as after.
      const busyBefore = args.guard ? await machineBusy() : 0;
      const samples: LoadSample[] = [];
      for (let run = 0; run < args.runs; run += 1) {
        const sample = await measureOnce(server.base, game, pathOf(game), args, runDir);
        log(game, run + 1, sample);
        samples.push(sample);
      }
      let row: LoadSample = { ...summarizeRuns(samples), ...(samples[0]?.gpu === undefined ? {} : { gpu: samples[0].gpu }) };
      for (const sample of samples) if (sample.error === undefined) failures.push(...judgeOpen(game, sample));
      if (args.guard) {
        const accepted = baseline?.games[game];
        if (baseline === null || accepted === undefined || baseline.gpu !== row.gpu) {
          console.error(`load: no baseline for ${game} on ${row.gpu ?? "this GPU"}; record one with: bun run shoot --load ${game} --save-baseline`);
        } else {
          let judged = judgeLoad(game, accepted, row);
          if (judged.length > 0) {
            // A second cold run before failing: one slow start is noise, two are the change.
            const again = await measureOnce(server.base, game, pathOf(game), args, runDir);
            log(game, samples.length + 1, again);
            samples.push(again);
            row = bestOf(row, again);
            judged = judgeLoad(game, accepted, row);
          }
          // A load that never happened or drew blank fails however busy the PC is; only a slower one is weighed.
          const timed = judged.filter((line) => / ms, baseline \d+ ms, limit \d+ ms$/.test(line));
          failures.push(...judged.filter((line) => !timed.includes(line)));
          const verdict = guardVerdict(timed, timed.length === 0 ? 0 : Math.max(busyBefore, await machineBusy()));
          failures.push(...verdict.failures);
          unjudged.push(...verdict.unjudged);
        }
      }
      rows.push(row);
      allSamples.push(...samples);
    }
  } finally {
    server.stop();
  }
  const file = join(runDir, "results.json");
  writeFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), runs: args.runs, rows, samples: allSamples }, null, 2)}\n`);
  console.log(renderTable(rows, before));
  console.error(`load: results, end-of-run screenshots${args.trace ? " and traces" : ""} in ${runDir}`);
  if (args.saveBaseline) {
    const gpu = rows[0]?.gpu ?? "unknown";
    const games = { ...(baseline !== null && baseline.gpu === gpu ? baseline.games : {}) };
    for (const row of rows) if (row.error === undefined) games[row.game] = { worstClick: row.worstClick, sceneReady: row.sceneReady };
    const sorted = Object.fromEntries(Object.entries(games).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(BASELINE_FILE, `${JSON.stringify({ gpu, games: sorted } satisfies LoadBaseline, null, 2)}\n`);
    console.error(`load: baseline for ${rows.map((row) => row.game).join(", ")} written to scripts/load-baseline.json`);
  }
  if (failures.length > 0) {
    console.error(`load: ${failures.length} failure(s) (boot sequence, missing files, or a regression against scripts/load-baseline.json):`);
    for (const failure of failures) console.error(`  ${failure}`);
    console.error("load guard: find the slow shader or task with `bun run shoot --load <game> --trace`; a deliberate cost re-records with --save-baseline");
    return 1;
  }
  if (unjudged.length > 0) {
    for (const line of unjudged) console.error(`  ${line}`);
    const slower = [...new Set(unjudged.map((line) => line.slice(0, line.indexOf(":"))))];
    console.error(
      `load guard not judged: ${slower.join(", ")} loaded slower than the baseline while other work held this PC over ${Math.round(BUSY_LIMIT * 100)}% busy, so contention cannot be told from a regression; run \`bun run shoot --load ${slower.join(",")} --guard\` on a quieter PC`,
    );
    return EXIT_UNJUDGED;
  }
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
