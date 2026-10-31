import { existsSync, readFileSync } from "node:fs";
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
import { parseGraphicsTier, type GraphicsTier } from "../packages/jgengine/src/templates/captureArgs";
import {
  checkBudget,
  FRAME_BUDGET_MS,
  frameVerdict,
  KNOWN_SLOW_PATH,
  knownSlowAdded,
  loadBudget,
  readBaseKnownSlow,
  readKnownSlow,
  REFERENCE,
  summarizeRecord,
  unjudgedFrameTime,
  type LoadedBudget,
} from "./perf-budget";
import { runPool } from "./type-shard";

/**
 * Frame-time gate: plays every reference game, waits out the warmup, then fails a game whose p95
 * frame time on the reference GPU (RTX 3070 at 1600x900, uncapped clock) is over the
 * 16.7 ms every game shares, or whose frame loop still allocates GL objects after warmup.
 *
 *   bun run perf gate [--games a,b] [--seconds n] [--quality low|medium|high|ultra] [--jobs n]
 *
 * On any other GPU the frame time is printed and not judged, and only the GL allocations decide.
 * Draws are printed beside the frame time, as the first number to read when a game is slow; they
 * are not a gate. A game over budget when the gate landed is listed in
 * `scripts/perf-known-failing.json`, which only shrinks: a listed game that holds the budget fails
 * until its entry is removed, and an entry the base branch lacks fails.
 *
 * Games are measured one at a time by default: two games on one GPU would each read the other's
 * frames as their own cost.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_SECONDS = 6;
const WARMUP_MS = 5_000;
/** Games measured at once by default: one, since games sharing a GPU measure each other's frames. */
export const DEFAULT_JOBS = 1;
/**
 * Debug ports for the games in flight, one per slot. Above the 9200-9899 band
 * `pickDebugPort` and the warm Chrome use, so two games in one run - or a game
 * beside a capture - can never attach to each other's browser.
 */
export const DEBUG_PORT_BASE = 9910;

export { checkBudget, loadBudget, type BudgetViolation, type LoadedBudget, type PerfBudget } from "./perf-budget";

/** The viewport the gate measures at: the reference one, so a frame time is comparable with the budget. */
export const GATE_SIZE = { width: 1600, height: 900 } as const;

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

const USAGE = `usage: bun run perf gate [--games a,b] [--seconds n] [--quality low|medium|high|ultra] [--draft] [--jobs n]

  Fails a game whose p95 frame time is over ${FRAME_BUDGET_MS} ms on the reference GPU
  (${REFERENCE.label}, uncapped clock), or whose frame loop allocates GL objects after
  warmup. On another GPU the frame time is printed, not judged. Draws are printed, not gated.
  Games over budget today are listed in ${KNOWN_SLOW_PATH}; the list only shrinks.

  --games           comma-separated game ids (default: the 8 reference games)
  --seconds         measured window per game (default ${DEFAULT_SECONDS})
  --quality         the graphics tier each game is measured at (low, medium, high, ultra). Without
                    it each game runs its own default tier, and every record names the tier it got.
  --draft           low tier at half viewport, for a smoke pass you will not quote (frame time not judged)
  --jobs            games measured at once (default ${DEFAULT_JOBS}); more than one shares the GPU, so
                    their frame times read each other's work
  --set             not taken here: a setting override measures a cost against the defaults,
                    not a budget. Use \`bun run perf <game> --set key=value\` and compare records.`;

interface GameOutcome {
  game: string;
  /** Over the frame budget and listed as known; reported, not failed. */
  known?: string;
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

  const missing = games.filter((game) => !existsSync(join(repoRoot, "games", game, "src", "index.tsx")));
  if (missing.length > 0) {
    throw new Error(
      `perf gate: no game source for ${missing.join(", ")} under games/`,
    );
  }

  const known = readKnownSlow(repoRoot);
  const added = knownSlowAdded(known, readBaseKnownSlow(repoRoot, "origin/beta"));

  const server = await ensureDevServer(repoRoot);
  let rasterizerPrinted = false;

  const measureOne = async (game: string, index: number): Promise<GameOutcome> => {
    const loaded = budgets.get(game)!;
    console.log(`perf gate: ${game} budget ${loaded.source}`);
    let outcome: GameOutcome = { game, summary: null, violations: [], error: null };
    const exitCode = await withBrowserSession(
      { keep: false, debugPort: debugPortFor(index), timeoutMs: 180_000, hardDeadlineMs: 300_000, frameClock: "uncapped" },
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
            frameClock: "uncapped",
            ...(draft ? {} : { size: GATE_SIZE }),
          });
          const budget = loaded.budget;
          if (!rasterizerPrinted) {
            rasterizerPrinted = true;
            const unjudged = unjudgedFrameTime(measured.record);
            console.log(`perf gate: rasterizer ${measured.record.gpu}${unjudged === null ? "" : ` — frame times not judged: ${unjudged}`}`);
          }
          const violations = checkBudget(measured.record, budget);
          const verdict = frameVerdict(game, violations, measured.record, known);
          const failing = violations.filter((entry) => verdict !== "known" || entry.metric !== "p95 frame").map((entry) => entry.message);
          if (verdict === "stale") {
            failing.push(`perf gate: ${game} now holds ${FRAME_BUDGET_MS} ms (p95 ${measured.record.frame.p95Ms} ms); remove its entry from ${KNOWN_SLOW_PATH} (it said: ${known.get(game) ?? ""})`);
          }
          if (failing.length === 0) {
            const line = summarizeRecord(measured.record, budget);
            const knownNote = verdict === "known" ? `  KNOWN over budget (${known.get(game) ?? ""})` : "";
            outcome = { ...outcome, summary: `${line}${knownNote}`, ...(verdict === "known" ? { known: known.get(game) ?? "" } : {}) };
            console.log(`perf gate: ${line}${knownNote}`);
          } else {
            outcome = { ...outcome, violations: failing };
            console.error(`perf gate: ${game} FAILED against ${loaded.source} (${measured.record.gpu})`);
            for (const message of failing) console.error(`  ${message}`);
            console.error(`  p95 ${measured.record.frame.p95Ms} ms, ${measured.record.frame.fps} fps, drawsFrame ${measured.record.render.drawsFrame ?? "n/a"}`);
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
  const verdicts = gateVerdicts(measured);
  const failures = [...added, ...verdicts.failures];
  const lines = verdicts.lines;

  if (failures.length > 0) {
    console.error(`\nperf gate FAILED — ${failures.length} problem(s) across ${games.length} games`);
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      `every game shares the ${FRAME_BUDGET_MS} ms p95 frame on ${REFERENCE.label}; read the drawsFrame and \`bun run perf <game>\` breakdown to find where a frame goes.`,
    );
    process.exit(1);
  }

  const knownCount = measured.filter((outcome) => outcome.known !== undefined).length;
  console.log(`\nperf gate: ${games.length} games inside budget (${lines.length} measured${knownCount > 0 ? `, ${knownCount} known over it in ${KNOWN_SLOW_PATH}` : ""})`);
}

if (import.meta.main) {
  await main();
}
