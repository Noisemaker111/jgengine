import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

import type { PerfReport } from "../packages/core/src/devtools/report";

/**
 * The budget files and the verdict logic, shared by the CI gate (`bun run perf:gate`)
 * and the in-page report reader (`bun run debug <game>`), so one command cannot pass
 * where the other fails. Frame times are deliberately not gated: CI runners are slow
 * and shared, so only counts a build controls decide pass or fail. Draws are gated
 * whole-frame (`drawsFrame`), because a single pass is a third of the work a frame does.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const BASELINE_RELATIVE = join("scripts", "perf-budget.json");

/** Counts one game may not exceed, from its `perf-budget.json`. */
export interface PerfBudget {
  /**
   * Draw calls in one frame with every pass together (shadow, main, postfx, AO, DOF), measured as
   * the p95 of the window. This is the number the gate compares; a count from a single pass is
   * roughly a third of it and is not a budget any more.
   */
  drawsFrame: number;
  /**
   * The `draws` budget this entry carried before the gate counted whole frames, kept so the old
   * number reads as history beside the new one instead of disappearing.
   */
  previousDraws?: number;
  triangles: number;
  nodes: number;
  /**
   * Programs a game may still link after warmup. Zero unless a measured
   * baseline shows materials that genuinely first appear during play; the entry
   * then records that number so the gate catches growth, and tightening it back
   * to 0 is the fix.
   */
  programsLinked?: number;
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
  /** Metric name as it appears in the message: drawsFrame, triangles, nodes, linkProgram, createFramebuffer. */
  metric: string;
  budget: number;
  measured: number;
  /** Readable one-liner naming the game, metric, measured value and budget. */
  message: string;
}

export const fmtCount = (value: number): string => value.toLocaleString("en-US");

function budgetNumber(raw: unknown, game: string, field: string, source: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    throw new Error(`perf gate: ${source} needs a positive number for "${game}.${field}" (got ${JSON.stringify(raw)})`);
  }
  return raw;
}

function parseBudgetEntry(raw: unknown, game: string, source: string): PerfBudget {
  if (raw === null || typeof raw !== "object") {
    throw new Error(`perf gate: ${source} has no budget object for "${game}"`);
  }
  const entry = raw as Record<string, unknown>;
  if (entry.drawsFrame === undefined && entry.draws !== undefined) {
    throw new Error(
      `perf gate: ${source} "${game}" has no drawsFrame — the gate compares a whole frame's draws now, so re-measure \`bun run perf ${game}\` and write its p95, keeping the old number as previousDraws`,
    );
  }
  return {
    drawsFrame: budgetNumber(entry.drawsFrame, game, "drawsFrame", source),
    triangles: budgetNumber(entry.triangles, game, "triangles", source),
    nodes: budgetNumber(entry.nodes, game, "nodes", source),
    ...(entry.previousDraws === undefined
      ? {}
      : { previousDraws: budgetNumber(entry.previousDraws, game, "previousDraws", source) }),
    ...(entry.programsLinked === undefined
      ? {}
      : { programsLinked: budgetNumber(entry.programsLinked, game, "programsLinked", source) }),
    ...(typeof entry.baseline === "string" ? { baseline: entry.baseline } : {}),
  };
}

/**
 * The budget for one game. A game's own `perf-budget.json` in its `Games/<id>/`
 * directory wins, so the games repo can own its numbers and a content PR carries
 * its budget; the engine copy is the fallback this gate and its CI job land with.
 * No file anywhere is a failure, never a skip. The returned `source` names the
 * file that was used, because a verdict means nothing without it.
 */
export function loadBudget(game: string, root = repoRoot): LoadedBudget {
  const gameFile = join(root, "Games", game, "perf-budget.json");
  if (existsSync(gameFile)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(gameFile, "utf8"));
    } catch (error) {
      throw new Error(`perf gate: ${gameFile} is not valid JSON (${(error as Error).message})`);
    }
    return { budget: parseBudgetEntry(parsed, game, gameFile), source: relative(root, gameFile).replaceAll("\\", "/") };
  }

  const engineFile = join(root, BASELINE_RELATIVE);
  if (!existsSync(engineFile)) {
    throw new Error(
      `perf gate: no budget for "${game}" — ${BASELINE_RELATIVE} is missing and Games/${game}/perf-budget.json does not exist`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(engineFile, "utf8"));
  } catch (error) {
    throw new Error(`perf gate: ${engineFile} is not valid JSON (${(error as Error).message})`);
  }
  const budgets = parsed as Record<string, unknown>;
  if (budgets === null || typeof budgets !== "object" || !(game in budgets)) {
    throw new Error(`perf gate: no budget for "${game}" in ${BASELINE_RELATIVE} — add a measured entry before gating it`);
  }
  return { budget: parseBudgetEntry(budgets[game], game, BASELINE_RELATIVE), source: BASELINE_RELATIVE.replaceAll("\\", "/") };
}

function violation(game: string, metric: string, measured: number, budget: number): BudgetViolation {
  const over = measured > budget ? ` over by ${fmtCount(measured - budget)}` : "";
  return {
    game,
    metric,
    budget,
    measured,
    message: `perf gate: ${game} ${metric} ${fmtCount(measured)} (budget ${fmtCount(budget)})${over}`,
  };
}

function unavailable(game: string, metric: string, reason: string): BudgetViolation {
  return {
    game,
    metric,
    budget: 0,
    measured: 0,
    message: `perf gate: ${game} ${metric} unavailable — ${reason}`,
  };
}

/**
 * Compare one measured record against its budget. Every returned violation is
 * one line a human reads in the CI log, and the list is empty only when the
 * game actually played and stayed inside its counts.
 */
export function checkBudget(record: PerfReport, budget: PerfBudget): BudgetViolation[] {
  const game = record.game;
  const found: BudgetViolation[] = [];

  // A capture that never rendered would otherwise read as a perfect 0 draws.
  if (record.render.draws === null || record.render.draws === 0) {
    found.push(unavailable(game, "draws", "0 draw calls means the game never reached play"));
    return found;
  }
  if (record.render.drawsFrame === null || record.render.drawsFrame === 0) {
    found.push(
      unavailable(game, "drawsFrame (whole frame)", "the wrapped draw counter saw no frame — the page never rendered one"),
    );
  } else if (record.render.drawsFrame > budget.drawsFrame) {
    found.push(violation(game, "drawsFrame (whole frame)", record.render.drawsFrame, budget.drawsFrame));
  }
  if (record.render.triangles === null) {
    found.push(unavailable(game, "triangles", "the debug snapshot reported no triangle count"));
  } else if (record.render.triangles > budget.triangles) {
    found.push(violation(game, "triangles", record.render.triangles, budget.triangles));
  }
  if (record.render.nodes === null) {
    found.push(unavailable(game, "nodes", `the harness could not read three.js scene nodes (${record.render.nodesSource})`));
  } else if (record.render.nodes > budget.nodes) {
    found.push(violation(game, "nodes", record.render.nodes, budget.nodes));
  }

  // Zero linkProgram/createFramebuffer is only evidence if the counters attached.
  if (record.gl.attached !== true) {
    found.push(unavailable(game, "GL allocations", "the WebGL counters never attached, so a zero allocation count proves nothing"));
  } else if (record.telemetry === null || record.telemetry.warmedUp) {
    // These two count from the sampler's post-warmup baseline; before it exists the
    // numbers are load-time allocations, and the record says so in `telemetry`.
    const linkBudget = budget.programsLinked ?? 0;
    if (record.gl.programsLinked > linkBudget) found.push(violation(game, "linkProgram", record.gl.programsLinked, linkBudget));
    if (record.gl.framebuffers > 0) found.push(violation(game, "createFramebuffer", record.gl.framebuffers, 0));
  }
  return found;
}

/** One line naming every measured count against its budget, for a passing run. */
export function summarizeRecord(record: PerfReport, budget: PerfBudget): string {
  // A number measured with a setting on names that setting, so the line is reproducible as printed.
  const overrides = (record as PerfReport & { overrides?: readonly string[] }).overrides ?? [];
  return [
    `${record.game} ok`,
    `drawsFrame ${fmtCount(record.render.drawsFrame ?? 0)}/${fmtCount(budget.drawsFrame)} (${record.render.drawsFrames} frames)`,
    `draws ${fmtCount(record.render.draws ?? 0)}`,
    `triangles ${fmtCount(record.render.triangles ?? 0)}/${fmtCount(budget.triangles)}`,
    `nodes ${fmtCount(record.render.nodes ?? 0)}/${fmtCount(budget.nodes)}`,
    `links ${fmtCount(record.gl.programsLinked)}/${fmtCount(budget.programsLinked ?? 0)}`,
    `framebuffers ${fmtCount(record.gl.framebuffers)}/0`,
    `allocations ${fmtCount(record.gl.allocations)}`,
    `${record.viewport} ${record.quality}`,
    ...(overrides.length === 0 ? [] : [`overrides ${overrides.join(" ")}`]),
  ].join("  ");
}
