import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

import type { PerfReport } from "../packages/core/src/devtools/report";

/**
 * The budget files and the verdict logic, shared by the frame gate (`bun run perf gate`) and the
 * in-page report reader (`bun run perf live <game>`), so one command cannot pass where the other
 * fails.
 *
 * A game is judged on what a player feels: the p95 frame time on the reference GPU, against one
 * budget every game shares. Draws are printed beside it as the number to look at when a game is
 * slow, never gated. The GL allocation check stays: a frame loop that still links programs or
 * creates framebuffers after warmup stutters on every GPU.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const BASELINE_RELATIVE = join("scripts", "perf-budget.json");

/** The p95 frame time every game must hold on the reference GPU: one 60 Hz frame. */
export const FRAME_BUDGET_MS = 16.7;

/**
 * The machine the frame budget is judged on: the GPU and viewport the baselines name. A frame time
 * from any other GPU (a runner's software GL, a laptop) is printed and not judged, since the same
 * build can run at three times the cost there.
 */
export const REFERENCE = { gpu: /RTX 3070/i, viewport: "1600x900", label: "GeForce RTX 3070 at 1600x900" } as const;

/** The list of games over the frame budget when it landed. */
export const KNOWN_SLOW_PATH = "scripts/perf-known-failing.json";

/** One game's budget, from its `perf-budget.json`. */
export interface PerfBudget {
  /**
   * Programs a game may still link after warmup. Zero unless a measured baseline shows materials
   * that first appear during play; tightening it back to 0 is the fix.
   */
  programsLinked?: number;
  /** Whole-frame draws at the last baseline, printed beside the measured count. Not a gate. */
  drawsFrame?: number;
  /** How the numbers above were produced (date, command, GPU). */
  baseline?: string;
}

/** One game's budget and the file it came from, so a run can name what it compared against. */
export interface LoadedBudget {
  budget: PerfBudget;
  /** Repo-relative path of the file the numbers came from, with forward slashes. */
  source: string;
}

export interface BudgetViolation {
  game: string;
  /** What was over: p95 frame, linkProgram, createFramebuffer, or a measurement that never happened. */
  metric: string;
  budget: number;
  measured: number;
  /** Readable one-liner naming the game, metric, measured value and budget. */
  message: string;
}

export const fmtCount = (value: number): string => value.toLocaleString("en-US");

const FIELDS = new Set(["programsLinked", "drawsFrame", "baseline"]);

function positive(raw: unknown, game: string, field: string, source: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    throw new Error(`perf gate: ${source} needs a number at least 0 for "${game}.${field}" (got ${JSON.stringify(raw)})`);
  }
  return raw;
}

function parseBudgetEntry(raw: unknown, game: string, source: string): PerfBudget {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`perf gate: ${source} has no budget object for "${game}"`);
  }
  const entry = raw as Record<string, unknown>;
  const unknown = Object.keys(entry).filter((key) => !FIELDS.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `perf gate: ${source} "${game}" has ${unknown.join(", ")}; a budget is the shared ${FRAME_BUDGET_MS} ms p95 frame, so a file holds only programsLinked, drawsFrame (reported) and baseline`,
    );
  }
  return {
    ...(entry["programsLinked"] === undefined ? {} : { programsLinked: positive(entry["programsLinked"], game, "programsLinked", source) }),
    ...(entry["drawsFrame"] === undefined ? {} : { drawsFrame: positive(entry["drawsFrame"], game, "drawsFrame", source) }),
    ...(typeof entry["baseline"] === "string" ? { baseline: entry["baseline"] } : {}),
  };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`perf gate: ${path} is not valid JSON (${(error as Error).message})`);
  }
}

/**
 * The budget for one game. A game's own `perf-budget.json` wins, so a content PR carries its
 * numbers; `scripts/perf-budget.json` is the fallback and names the reference games. No entry
 * anywhere is a failure, never a skip.
 */
export function loadBudget(game: string, root = repoRoot): LoadedBudget {
  const gameFile = join(root, "games", game, "perf-budget.json");
  if (existsSync(gameFile)) {
    return { budget: parseBudgetEntry(readJson(gameFile), game, gameFile), source: relative(root, gameFile).replaceAll("\\", "/") };
  }
  const engineFile = join(root, BASELINE_RELATIVE);
  if (!existsSync(engineFile)) {
    throw new Error(`perf gate: no budget for "${game}" — ${BASELINE_RELATIVE} is missing and games/${game}/perf-budget.json does not exist`);
  }
  const budgets = readJson(engineFile);
  if (budgets === null || typeof budgets !== "object" || !(game in budgets)) {
    throw new Error(`perf gate: no budget for "${game}" in ${BASELINE_RELATIVE} — add an entry before gating it`);
  }
  return { budget: parseBudgetEntry((budgets as Record<string, unknown>)[game], game, BASELINE_RELATIVE), source: BASELINE_RELATIVE.replaceAll("\\", "/") };
}

/** What a budget compares and prints. `quality` is the graphics tier, which `PerfReport` types as the capture preset. */
export type BudgetRecord = Omit<PerfReport, "quality"> & { quality: string; frameClock?: string };

/**
 * Why this record's frame time cannot be judged, or null when it can: it must come from the
 * reference GPU at the reference viewport on the uncapped clock (a vsynced clock reads 16.7 ms
 * steps, not what a frame costs).
 */
export function unjudgedFrameTime(record: BudgetRecord): string | null {
  if (!REFERENCE.gpu.test(record.gpu)) return `measured on ${record.gpu}, not the reference ${REFERENCE.label}`;
  if (record.viewport !== REFERENCE.viewport) return `measured at ${record.viewport}, not the reference ${REFERENCE.viewport}`;
  if (record.frameClock !== "uncapped") return "measured on a vsynced clock, which reads 16.7 ms steps rather than what a frame costs";
  return null;
}

function violation(game: string, metric: string, measured: number, budget: number, unit = ""): BudgetViolation {
  const over = measured > budget ? ` over by ${fmtCount(Math.round((measured - budget) * 10) / 10)}${unit}` : "";
  return { game, metric, budget, measured, message: `perf gate: ${game} ${metric} ${fmtCount(measured)}${unit} (budget ${fmtCount(budget)}${unit})${over}` };
}

function unavailable(game: string, metric: string, reason: string): BudgetViolation {
  return { game, metric, budget: 0, measured: 0, message: `perf gate: ${game} ${metric} unavailable — ${reason}` };
}

/**
 * Compare one measured record against its budget. Every returned violation is one line a human
 * reads, and the list is empty only when the game played, held the frame budget (where it can be
 * judged) and stopped allocating GL objects after warmup.
 */
export function checkBudget(record: BudgetRecord, budget: PerfBudget): BudgetViolation[] {
  const game = record.game;
  // A capture that never rendered would otherwise read as a perfect frame.
  if (record.render.draws === null || record.render.draws === 0) {
    return [unavailable(game, "frame", "0 draw calls means the game never reached play")];
  }
  const found: BudgetViolation[] = [];
  if (record.frame.samples === 0) found.push(unavailable(game, "p95 frame", "the window measured no frames"));
  else if (unjudgedFrameTime(record) === null && record.frame.p95Ms > FRAME_BUDGET_MS) {
    found.push(violation(game, "p95 frame", record.frame.p95Ms, FRAME_BUDGET_MS, " ms"));
  }
  // Zero linkProgram/createFramebuffer is only evidence if the counters attached.
  if (record.gl.attached !== true) {
    found.push(unavailable(game, "GL allocations", "the WebGL counters never attached, so a zero allocation count proves nothing"));
  } else if (record.telemetry === null || record.telemetry.warmedUp) {
    // These count from the sampler's post-warmup baseline; before it exists they are load-time allocations.
    const linkBudget = budget.programsLinked ?? 0;
    if (record.gl.programsLinked > linkBudget) found.push(violation(game, "linkProgram", record.gl.programsLinked, linkBudget));
    if (record.gl.framebuffers > 0) found.push(violation(game, "createFramebuffer", record.gl.framebuffers, 0));
  }
  return found;
}

/** One line naming the frame time against the budget and the counts beside it, for a passing run. */
export function summarizeRecord(record: BudgetRecord, budget: PerfBudget): string {
  const overrides = (record as PerfReport & { overrides?: readonly string[] }).overrides ?? [];
  const unjudged = unjudgedFrameTime(record);
  return [
    `${record.game} ok`,
    `p95 ${record.frame.p95Ms} ms/${FRAME_BUDGET_MS} ms (${record.frame.fps} fps)${unjudged === null ? "" : " not judged"}`,
    `drawsFrame ${record.render.drawsFrame === null ? "n/a" : fmtCount(record.render.drawsFrame)}${budget.drawsFrame === undefined ? "" : ` (baseline ${fmtCount(budget.drawsFrame)})`}`,
    `links ${fmtCount(record.gl.programsLinked)}/${fmtCount(budget.programsLinked ?? 0)}`,
    `framebuffers ${fmtCount(record.gl.framebuffers)}/0`,
    `${record.viewport} ${record.quality}`,
    ...(overrides.length === 0 ? [] : [`overrides ${overrides.join(" ")}`]),
  ].join("  ");
}

/** game -> why it misses the frame budget today. */
export type KnownSlow = ReadonlyMap<string, string>;

/** Parse the list; `$`-prefixed keys are comments. */
export function parseKnownSlow(text: string): KnownSlow {
  const raw: unknown = JSON.parse(text);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${KNOWN_SLOW_PATH} must be an object of game -> reason`);
  const out = new Map<string, string>();
  for (const [game, reason] of Object.entries(raw)) {
    if (game.startsWith("$")) continue;
    if (typeof reason !== "string" || reason.trim().length === 0) throw new Error(`${KNOWN_SLOW_PATH}: "${game}" needs the reason it is over budget`);
    out.set(game, reason);
  }
  return out;
}

export function readKnownSlow(root = repoRoot): KnownSlow {
  const path = join(root, KNOWN_SLOW_PATH);
  return existsSync(path) ? parseKnownSlow(readFileSync(path, "utf8")) : new Map();
}

/** The list as `base` has it, or null when it cannot be read there (no such ref, or a new list). */
export function readBaseKnownSlow(root: string, base: string): KnownSlow | null {
  const shown = spawnSync("git", ["show", `${base}:${KNOWN_SLOW_PATH}`], { cwd: root, encoding: "utf8", timeout: 15_000 });
  if (shown.status !== 0) return null;
  return parseKnownSlow(shown.stdout);
}

/** Entries the base did not have: the list only shrinks, so each is a problem. */
export function knownSlowAdded(current: KnownSlow, base: KnownSlow | null): string[] {
  if (base === null) return [];
  return [...current.keys()]
    .filter((game) => !base.has(game))
    .map((game) => `perf gate: ${game} was added to ${KNOWN_SLOW_PATH}; the list only shrinks — make the game hold ${FRAME_BUDGET_MS} ms instead`);
}

export type FrameVerdict = "pass" | "fail" | "known" | "stale" | "unjudged";

/**
 * A game's frame-time verdict against the list: a listed game over budget is known, a listed game
 * inside it is stale (its entry must go), an unlisted one over budget fails.
 */
export function frameVerdict(game: string, violations: readonly BudgetViolation[], record: BudgetRecord, known: KnownSlow): FrameVerdict {
  if (unjudgedFrameTime(record) !== null) return "unjudged";
  const slow = violations.some((entry) => entry.metric === "p95 frame");
  if (known.has(game)) return slow ? "known" : "stale";
  return slow ? "fail" : "pass";
}
