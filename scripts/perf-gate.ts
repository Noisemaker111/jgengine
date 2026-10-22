import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  ensureDevServer,
  openPageSession,
  parseQualityArg,
  withBrowserSession,
  type CaptureQuality,
} from "./browser-lib";
import { measureGame, type PerfRecord } from "./perf-play";

/**
 * Frame-budget gate: plays every reference game under the checkout's software
 * GL path, waits out the warmup, then fails the run when steady-state render
 * counts exceed the game's budget or when the frame loop still allocates GL
 * objects after warmup.
 *
 *   bun run perf:gate [--games a,b] [--seconds n] [--quality draft|full]
 *
 * Frame times are deliberately not gated: CI runners are slow and shared, so
 * only counts a build controls — draws, triangles, scene nodes and post-warmup
 * GL allocations — decide pass or fail.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const BASELINE_RELATIVE = join("scripts", "perf-budget.json");
const DEFAULT_SECONDS = 6;
const WARMUP_MS = 5_000;

/** The reference games the epic's budget passes cover. */
export const PERF_GATE_GAMES = [
  "harbor-heat",
  "scrap-signal",
  "brightway-park",
  "ember-command",
  "beacon-bastion",
  "drift-foundry",
  "odd-orbit",
  "deepward",
] as const;

/** Counts one game may not exceed, from `scripts/perf-budget.json`. */
export interface PerfBudget {
  draws: number;
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

export interface BudgetViolation {
  game: string;
  /** Metric name as it appears in the message: draws, triangles, nodes, linkProgram, createFramebuffer. */
  metric: string;
  budget: number;
  measured: number;
  /** Readable one-liner naming the game, metric, measured value and budget. */
  message: string;
}

const fmt = (value: number): string => value.toLocaleString("en-US");

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
  return {
    draws: budgetNumber(entry.draws, game, "draws", source),
    triangles: budgetNumber(entry.triangles, game, "triangles", source),
    nodes: budgetNumber(entry.nodes, game, "nodes", source),
    ...(entry.programsLinked === undefined
      ? {}
      : { programsLinked: budgetNumber(entry.programsLinked, game, "programsLinked", source) }),
    ...(typeof entry.baseline === "string" ? { baseline: entry.baseline } : {}),
  };
}

/**
 * The budget for one game. A game's own `perf-budget.json` in its `Games/<id>/`
 * directory wins, so the games repo can own its numbers; the engine copy is the
 * baseline this gate and its CI job land with. No file anywhere is a failure,
 * never a skip.
 */
export function loadBudget(game: string, root = repoRoot): PerfBudget {
  const gameFile = join(root, "Games", game, "perf-budget.json");
  if (existsSync(gameFile)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(gameFile, "utf8"));
    } catch (error) {
      throw new Error(`perf gate: ${gameFile} is not valid JSON (${(error as Error).message})`);
    }
    return parseBudgetEntry(parsed, game, gameFile);
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
  return parseBudgetEntry(budgets[game], game, BASELINE_RELATIVE);
}

function violation(game: string, metric: string, measured: number, budget: number): BudgetViolation {
  const over = measured > budget ? ` over by ${fmt(measured - budget)}` : "";
  return {
    game,
    metric,
    budget,
    measured,
    message: `perf gate: ${game} ${metric} ${fmt(measured)} (budget ${fmt(budget)})${over}`,
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
export function checkBudget(record: PerfRecord, budget: PerfBudget): BudgetViolation[] {
  const game = record.game;
  const found: BudgetViolation[] = [];

  // A capture that never rendered would otherwise read as a perfect 0 draws.
  if (record.render.draws === null || record.render.draws === 0) {
    found.push(unavailable(game, "draws", "0 draw calls means the game never reached play"));
    return found;
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
  if (record.render.draws > budget.draws) found.push(violation(game, "draws", record.render.draws, budget.draws));

  // Zero linkProgram/createFramebuffer is only evidence if the hooks attached.
  const glActivity = (record.gl.total.buffers ?? 0) + (record.gl.total.textures ?? 0);
  if (glActivity === 0) {
    found.push(unavailable(game, "GL allocations", "the WebGL counters never saw a buffer or texture, so they did not attach"));
  } else {
    const linkBudget = budget.programsLinked ?? 0;
    if (record.gl.programsLinked > linkBudget) found.push(violation(game, "linkProgram", record.gl.programsLinked, linkBudget));
    if (record.gl.framebuffers > 0) found.push(violation(game, "createFramebuffer", record.gl.framebuffers, 0));
  }
  return found;
}

function summarize(record: PerfRecord, budget: PerfBudget): string {
  return [
    `${record.game} ok`,
    `draws ${fmt(record.render.draws ?? 0)}/${fmt(budget.draws)}`,
    `triangles ${fmt(record.render.triangles ?? 0)}/${fmt(budget.triangles)}`,
    `nodes ${fmt(record.render.nodes ?? 0)}/${fmt(budget.nodes)}`,
    `links ${fmt(record.gl.programsLinked)}/${fmt(budget.programsLinked ?? 0)}`,
    `framebuffers ${fmt(record.gl.framebuffers)}/0`,
    `allocations ${fmt(record.gl.allocations)}`,
    `${record.viewport} ${record.quality}`,
  ].join("  ");
}

export interface GateArgs {
  games: string[];
  quality: CaptureQuality;
  seconds: number;
}

export function parseGateArgs(argv: readonly string[]): GateArgs {
  let games: string[] = [...PERF_GATE_GAMES];
  let quality: CaptureQuality = "full";
  let seconds = DEFAULT_SECONDS;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--help" || arg === "-h") throw new Error("usage");
    if (arg === "--games" || arg === "--quality" || arg === "--seconds") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      index += 1;
      if (arg === "--games") {
        games = value.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
      } else if (arg === "--quality") {
        quality = parseQualityArg(value);
      } else {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--seconds must be a positive number (got ${value})`);
        seconds = parsed;
      }
      continue;
    }
    throw new Error(`unknown argument ${arg}`);
  }
  if (games.length === 0) throw new Error("--games needs at least one game id");
  return { games, quality, seconds };
}

const USAGE = `usage: bun run perf:gate [--games a,b] [--seconds n] [--quality draft|full]

  --games           comma-separated game ids (default: the 8 reference games)
  --seconds         measured window per game (default ${DEFAULT_SECONDS})
  --quality         graphics tier: full (default) or draft`;

async function main(): Promise<void> {
  const parsed = process.argv.slice(2);
  if (parsed.includes("--help") || parsed.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const { games, quality, seconds } = parseGateArgs(parsed);

  // Budgets are read before any browser starts: a missing file must fail fast,
  // not after ten minutes of software-GL rendering.
  const budgets = new Map<string, PerfBudget>();
  for (const game of games) budgets.set(game, loadBudget(game));

  const missing = games.filter((game) => !existsSync(join(repoRoot, "Games", game, "src", "index.tsx")));
  if (missing.length > 0) {
    throw new Error(
      `perf gate: no game source for ${missing.join(", ")} — run \`bun run games:clone\` first (CI needs GAMES_CLONE_TOKEN)`,
    );
  }

  const server = await ensureDevServer(repoRoot);
  const failures: string[] = [];
  const lines: string[] = [];
  let rasterizerPrinted = false;

  const exitCode = await withBrowserSession(
    { keep: false, timeoutMs: 180_000, server: server.child, serverPid: server.pid, hardDeadlineMs: 1_500_000 },
    async ({ debugPort }) => {
      for (const game of games) {
        const session = await openPageSession(debugPort);
        try {
          const measured = await measureGame({
            session,
            base: server.base,
            game,
            quality,
            seconds,
            warmupMs: WARMUP_MS,
            profile: false,
          });
          const budget = budgets.get(game)!;
          if (!rasterizerPrinted) {
            rasterizerPrinted = true;
            console.log(`perf gate: rasterizer ${measured.record.gpu}`);
          }
          const violations = checkBudget(measured.record, budget);
          if (violations.length === 0) {
            lines.push(summarize(measured.record, budget));
            console.log(`perf gate: ${summarize(measured.record, budget)}`);
          } else {
            failures.push(...violations.map((entry) => entry.message));
            console.error(`perf gate: ${game} FAILED (${measured.record.gpu})`);
            for (const entry of violations) console.error(`  ${entry.message}`);
            console.error(JSON.stringify(measured.record, null, 2));
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          failures.push(`perf gate: ${game} could not be measured — ${reason}`);
          console.error(`perf gate: ${game} could not be measured — ${reason}`);
        } finally {
          await session.close();
        }
      }
    },
  );

  if (exitCode !== 0) {
    console.error(`perf gate: the browser session failed (exit ${exitCode}) before every game was measured`);
    process.exit(exitCode);
  }

  if (failures.length > 0) {
    console.error(`\nperf gate FAILED — ${failures.length} problem(s) across ${games.length} games`);
    for (const failure of failures) console.error(`  ${failure}`);
    console.error("budgets live in scripts/perf-budget.json; raise one only with a measured baseline.");
    process.exit(1);
  }

  console.log(`\nperf gate: ${games.length} games inside budget (${lines.length} measured)`);
}

if (import.meta.main) {
  await main();
}
