import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  ensureDevServer,
  killPid,
  killProcessTree,
  openPageSession,
  withBrowserSession,
} from "./browser-lib";
import { measureGame } from "./perf-play";
import { requireGamesAtPin } from "./games-scope";
import { parseGraphicsTier, type GraphicsTier } from "../packages/jgengine/src/templates/captureArgs";
import { checkBudget, loadBudget, summarizeRecord, type LoadedBudget } from "./perf-budget";
import { runPool } from "./type-shard";

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
 *
 * Games are measured a few at a time rather than one after another: eight games
 * in series cost ~6 minutes locally, while the same eight with four in flight
 * cost about two waves. Each game gets its own browser and profile from the
 * launch lib (one page target per game on a shared browser is not isolation: a
 * crashed or throttled page would take another game's measurement with it), and
 * each is judged against its own budget on its own record, so a game over budget
 * still fails alone.
 *
 * Two draw counts appear in the output, and they are not interchangeable:
 *
 * - `drawsFrame` is every draw a frame issues, all passes together — shadow,
 *   main, postfx prepasses, AO, DOF — taken as the p95 of the measured window by
 *   wrapping the GL draw calls. This is what the budget compares.
 * - `draws` is the renderer's own counter as the devtools probe sampled it: one
 *   frame, from a source that can only hold every pass while `info.autoReset` is
 *   off. It is printed for comparison with older records, not gated.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_SECONDS = 6;
const WARMUP_MS = 5_000;
/** Games measured at once by default. Four keeps a handful of software-GL pages off each other's core. */
export const DEFAULT_JOBS = 4;
/**
 * Debug ports for the games in flight, one per slot. Above the 9200-9899 band
 * `pickDebugPort` and the warm Chrome use, so two games in one run - or a game
 * beside a capture - can never attach to each other's browser.
 */
export const DEBUG_PORT_BASE = 9910;

export { checkBudget, loadBudget, type BudgetViolation, type LoadedBudget, type PerfBudget } from "./perf-budget";

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
  /** The tier every game is measured at; undefined measures each game's own tier. */
  quality?: GraphicsTier;
  /** Half viewport at the low tier, for a smoke pass over the gate itself. */
  draft: boolean;
  seconds: number;
  jobs: number;
}

/** The debug port game `index` of a run measures through, unique per game. */
export function debugPortFor(index: number): number {
  return DEBUG_PORT_BASE + index;
}

export function parseGateArgs(argv: readonly string[]): GateArgs {
  let games: string[] = [...PERF_GATE_GAMES];
  let quality: GraphicsTier | undefined;
  let draft = false;
  let seconds = DEFAULT_SECONDS;
  let jobs = DEFAULT_JOBS;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--help" || arg === "-h") throw new Error("usage");
    if (arg === "--draft") {
      draft = true;
      continue;
    }
    if (arg === "--set") {
      throw new Error(
        "--set measures a setting on top of the defaults; budgets describe the default build — use `bun run perf <game> --set key=value` and compare the two records",
      );
    }
    if (arg === "--games" || arg === "--quality" || arg === "--seconds" || arg === "--jobs") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      index += 1;
      if (arg === "--games") {
        games = value.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
      } else if (arg === "--quality") {
        quality = parseGraphicsTier(value);
      } else if (arg === "--jobs") {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--jobs must be a whole number of games at least 1 (got ${value})`);
        jobs = parsed;
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
  if (draft && quality !== undefined) throw new Error(`--draft measures the low tier at half viewport, so drop it or drop --quality ${quality}`);
  return { games, ...(quality === undefined ? {} : { quality }), draft, seconds, jobs };
}

const USAGE = `usage: bun run perf:gate [--games a,b] [--seconds n] [--quality low|medium|high|ultra] [--draft] [--jobs n]

  --games           comma-separated game ids (default: the 8 reference games)
  --seconds         measured window per game (default ${DEFAULT_SECONDS})
  --quality         the graphics tier each game is measured at (low, medium, high, ultra). Without
                    it each game runs its own default tier, and every record names the tier it got.
  --draft           low tier at half viewport, for a smoke pass you will not quote
  --jobs            games measured at once (default ${DEFAULT_JOBS}); each gets its own browser
  --set             not taken here: a setting override measures a cost against the defaults,
                    not a budget. Use \`bun run perf <game> --set key=value\` and compare records.`;

/**
 * The games checkout the gate is about to measure, as the pin in
 * `scripts/games-ref.txt` and the clone's actual HEAD. Budgets describe a content
 * snapshot, so a run that does not say which snapshot it measured cannot be read
 * as an engine regression — the log names it instead.
 */
export function describeGamesCheckout(root: string, head: () => string | null = gamesHead): { pin: string | null; head: string | null } {
  let pin: string | null = null;
  try {
    const raw = readFileSync(join(root, "scripts", "games-ref.txt"), "utf8").trim();
    if (/^[0-9a-f]{40}$/.test(raw)) pin = raw;
  } catch {
    /* no pin file: the run still measures, it just cannot name the pinned content */
  }
  return { pin, head: head(join(root, "Games")) };
}

function gamesHead(directory: string): string | null {
  try {
    return execFileSync("git", ["-C", directory, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

/** One line naming the games content behind the numbers, flagging a clone that is not at the pin. */
export function describeGamesLine(checkout: { pin: string | null; head: string | null }): string {
  const short = (sha: string | null): string => (sha === null ? "unknown" : sha.slice(0, 7));
  if (checkout.head === null) return "perf gate: games checkout unavailable — the numbers describe whatever Games/ holds";
  const pinned = checkout.pin === null ? "no pin" : `pinned ${short(checkout.pin)}`;
  const drift = checkout.pin !== null && checkout.pin !== checkout.head ? " (measuring unpinned content)" : "";
  return `perf gate: games ${short(checkout.head)}, ${pinned}${drift}`;
}

interface GameOutcome {
  game: string;
  /** The printed ok line, or null when the game failed or was not measured. */
  summary: string | null;
  violations: string[];
  /** Why the game could not be measured at all, as opposed to measured over budget. */
  error: string | null;
}

/**
 * What a run reports: each game's own ok line, and one failure per game over its
 * own budget or never measured. A game that passes is never dragged down by a
 * neighbour that did not, and a game that failed is never averaged away.
 */
export function gateVerdicts(outcomes: readonly GameOutcome[]): { failures: string[]; lines: string[] } {
  return {
    failures: outcomes.flatMap((outcome) => (outcome.error === null ? outcome.violations : [outcome.error])),
    lines: outcomes.map((outcome) => outcome.summary).filter((line): line is string => line !== null),
  };
}

async function main(): Promise<void> {
  const parsed = process.argv.slice(2);
  if (parsed.includes("--help") || parsed.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const { games, quality, draft, seconds, jobs } = parseGateArgs(parsed);

  // Budgets are read before any browser starts: a missing file must fail fast,
  // not after ten minutes of software-GL rendering.
  const budgets = new Map<string, LoadedBudget>();
  for (const game of games) budgets.set(game, loadBudget(game));

  const missing = games.filter((game) => !existsSync(join(repoRoot, "Games", game, "src", "index.tsx")));
  if (missing.length > 0) {
    throw new Error(
      `perf gate: no game source for ${missing.join(", ")} — run \`bun run games:clone\` first (CI needs GAMES_CLONE_TOKEN)`,
    );
  }

  // Budgets describe a content snapshot, so numbers from another commit cannot be
  // read as an engine regression. Fail before the ten-minute browser run (#2228).
  requireGamesAtPin("perf gate", repoRoot);

  const server = await ensureDevServer(repoRoot);
  let rasterizerPrinted = false;

  const measureOne = async (game: string, index: number): Promise<GameOutcome> => {
    const loaded = budgets.get(game)!;
    console.log(`perf gate: ${game} budget ${loaded.source}`);
    if (loaded.budget.legacyDraws === true) {
      console.log(
        `perf gate: ${game} budget entry still says draws — it is compared whole-frame, but re-measure it as drawsFrame (bun run perf ${game}) so the number is a sampled p95, not one frame`,
      );
    }
    let outcome: GameOutcome = { game, summary: null, violations: [], error: null };
    const exitCode = await withBrowserSession(
      { keep: false, debugPort: debugPortFor(index), timeoutMs: 180_000, hardDeadlineMs: 300_000 },
      async ({ debugPort }) => {
        const session = await openPageSession(debugPort);
        try {
          const measured = await measureGame({
            session,
            base: server.base,
            game,
            quality,
            draft,
            seconds,
            warmupMs: WARMUP_MS,
            profile: false,
          });
          const budget = loaded.budget;
          if (!rasterizerPrinted) {
            rasterizerPrinted = true;
            console.log(`perf gate: rasterizer ${measured.record.gpu}`);
          }
          const violations = checkBudget(measured.record, budget, { requireDrawsFrame: true });
          if (violations.length === 0) {
            outcome = { ...outcome, summary: summarizeRecord(measured.record, budget) };
            console.log(`perf gate: ${summarizeRecord(measured.record, budget)}`);
          } else {
            outcome = { ...outcome, violations: violations.map((entry) => entry.message) };
            console.error(`perf gate: ${game} FAILED against ${loaded.source} (${measured.record.gpu})`);
            for (const entry of violations) console.error(`  ${entry.message}`);
            console.error(JSON.stringify(measured.record, null, 2));
          }
        } finally {
          await session.close();
        }
      },
    );
    if (exitCode !== 0 && outcome.error === null && outcome.violations.length === 0) {
      outcome = { ...outcome, error: `perf gate: ${game} could not be measured — its browser session failed (exit ${exitCode})` };
    }
    return outcome;
  };

  const outcomes: (GameOutcome | undefined)[] = new Array<GameOutcome | undefined>(games.length);
  try {
    await runPool(
      games.map((game, index) => ({ game, index })),
      jobs,
      async ({ game, index }) => {
        try {
          outcomes[index] = await measureOne(game, index);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          const message = `perf gate: ${game} could not be measured — ${reason}`;
          console.error(message);
          outcomes[index] = { game, summary: null, violations: [], error: message };
        }
      },
    );
  } finally {
    killProcessTree(server.child ?? null);
    killPid(server.pid, true);
  }

  const measured = outcomes.filter((outcome): outcome is GameOutcome => outcome !== undefined);
  const { failures, lines } = gateVerdicts(measured);

  if (failures.length > 0) {
    console.error(`\nperf gate FAILED — ${failures.length} problem(s) across ${games.length} games`);
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      "budgets live beside each game (Games/<id>/perf-budget.json), else scripts/perf-budget.json; raise drawsFrame only with a measured whole-frame baseline.",
    );
    process.exit(1);
  }

  console.log(`\nperf gate: ${games.length} games inside budget (${lines.length} measured)`);
}

if (import.meta.main) {
  await main();
}
