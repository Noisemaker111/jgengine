import { fileURLToPath } from "node:url";

import { findRunningDevServer } from "./devServerMarker";
import { checkBudget, loadBudget, summarizeRecord } from "./perf-budget";
import { REPORT_ENDPOINT_PATH, type ReportRouteError } from "../packages/core/src/devtools/reportEndpoint";
import type { PerfReport } from "../packages/core/src/devtools/report";

/**
 * Read the report a game already open in a browser is producing, and gate it against
 * `scripts/perf-budget.json`. No browser launch, no CDP, no second process: the page
 * pushes to the dev server's route about once a second, and this fetches the newest.
 *
 *   bun run debug <game> [--wait ms] [--no-budget]
 *
 * The record printed to stdout is exactly what `bun run perf <game>` prints. Notes
 * and the budget verdict go to stderr, so the JSON can be piped.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_WAIT_MS = 1_500;

export interface DebugArgs {
  game: string;
  waitMs: number;
  budget: boolean;
}

const USAGE = `usage: bun run debug <game> [--wait ms] [--no-budget]

  <game>            game id already open in a browser (for example harbor-heat)
  --wait            how long to wait for a report when none has arrived (default ${DEFAULT_WAIT_MS} ms)
  --no-budget       print the report without checking scripts/perf-budget.json`;

export function parseDebugArgs(argv: readonly string[]): DebugArgs | "help" {
  if (argv.includes("--help") || argv.includes("-h")) return "help";
  let game: string | undefined;
  let waitMs = DEFAULT_WAIT_MS;
  let budget = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--no-budget") {
      budget = false;
      continue;
    }
    if (arg === "--wait") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error("--wait needs a millisecond value");
      index += 1;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--wait must be 0 or more (got ${value})`);
      waitMs = parsed;
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`unknown flag ${arg}`);
    if (game !== undefined) throw new Error(`one game per run (got ${game} and ${arg})`);
    game = arg;
  }
  if (game === undefined) throw new Error("a game id is required");
  return { game, waitMs, budget };
}

/** Fetch the newest in-page report for `game` from a running dev server. */
export async function fetchReport(base: string, game: string, waitMs: number): Promise<PerfReport | { error: string }> {
  const url = new URL(REPORT_ENDPOINT_PATH, base);
  url.searchParams.set("game", game);
  if (waitMs > 0) url.searchParams.set("wait", String(waitMs));
  const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(5_000, waitMs + 5_000)) });
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const routeError = body as ReportRouteError;
    return { error: typeof routeError?.error === "string" ? routeError.error : `report route answered ${response.status}` };
  }
  if (typeof body !== "object" || body === null || !("frame" in body) || !("render" in body)) {
    return { error: "the report route answered something that is not a perf record" };
  }
  return body as PerfReport;
}

async function main(): Promise<void> {
  const parsed = parseDebugArgs(process.argv.slice(2));
  if (parsed === "help") {
    console.log(USAGE);
    return;
  }
  const { game, waitMs, budget } = parsed;

  const server = await findRunningDevServer(repoRoot);
  if (server === null) {
    console.error(
      `debug: no dev server is running for this checkout — run \`bun dev\`, open ${game} at /games/${game}, then retry`,
    );
    process.exit(1);
  }

  const startedAt = Date.now();
  const report = await fetchReport(server.base, game, waitMs);
  const fetchMs = Date.now() - startedAt;
  if ("error" in report) {
    console.error(`debug: ${report.error}`);
    process.exit(1);
  }

  console.log(JSON.stringify(report, null, 2));
  const ageMs = Date.now() - report.at;
  console.error(
    `debug: ${game} report from ${server.base} in ${fetchMs} ms (report ${Math.max(0, Math.round(ageMs))} ms old, ` +
      `${report.frame.samples} frames over ${report.seconds}s, ${report.gpu})`,
  );
  if (report.telemetry !== null && !report.telemetry.warmedUp) {
    console.error("debug: the sampler is still inside its warmup, so link/framebuffer counts are not yet meaningful");
  }
  if (report.logs !== null && report.logs.severe.length > 0) {
    const latest = report.logs.severe[report.logs.severe.length - 1]!;
    console.error(`debug: ${report.logs.severe.length} warning/error line(s); latest [${latest.level}:${latest.system}] ${latest.message}`);
  }
  if (!budget) return;

  const limit = loadBudget(game, repoRoot);
  const violations = checkBudget(report, limit);
  if (violations.length === 0) {
    console.error(`debug: ${summarizeRecord(report, limit)}`);
    return;
  }
  console.error(`debug: ${game} is over budget`);
  for (const violation of violations) console.error(`  ${violation.message}`);
  process.exit(1);
}

if (import.meta.main) {
  await main();
}
