import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  ensureDevServer,
  openPageSession,
  parseQualityArg,
  withBrowserSession,
  type CaptureQuality,
} from "./browser-lib";
import { measureGame } from "./perf-play";
import { checkBudget, loadBudget, summarizeRecord, type PerfBudget } from "./perf-budget";

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
 * GL allocations — decide pass or fail. `bun run debug <game>` reads the same
 * budget through the same verdict logic, from a game already open in a browser.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_SECONDS = 6;
const WARMUP_MS = 5_000;

export { checkBudget, loadBudget, type BudgetViolation, type PerfBudget } from "./perf-budget";

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
            lines.push(summarizeRecord(measured.record, budget));
            console.log(`perf gate: ${summarizeRecord(measured.record, budget)}`);
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
