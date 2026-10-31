/**
 * Holds every game to hours of content, not a two-minute demo.
 *
 * For each game it plays `proofs/flows/from-zero.flow.ts` headless from a new game (`fromZero.ts`)
 * and judges two rules against the game's `PLAN.md` design brief:
 *
 *   from-zero - the proof exists, starts from nothing beyond the brief's second 0, teaches or unlocks
 *               something by minute 2 and keeps meeting new things at the brief's pace;
 *   depth     - systems touched, time to first unlock, unlocks per 10 minutes, content against the
 *               budget, the longest real-time cycle and minutes of content clear `DEPTH_BARS`.
 *
 * Until milestone 1 is ticked and the brief written, a game's proof only has to play: the bars are
 * measured against the brief from the commit that ticks milestone 1.
 *
 * A game that failed a rule when it landed is listed in `depth-known-failing.json` with the reason;
 * the list only shrinks (`knownFailing.ts`), compared with `--base` (default origin/beta).
 *
 * Usage: bun run check games-depth [--root <games dir>] [--base <ref>] [game...]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { isProofFlow } from "../../packages/core/src/play/flow";

import { gameDirs } from "./capabilities";
import { briefDue, type BriefGate } from "./designBrief";
import { FROM_ZERO_FLOW, depthProblems, fromZeroProblems, fromZeroShapeProblems, playFromZero } from "./fromZero";
import { addedSinceBase, judge, readBaseKnownFailing, readKnownFailing, verdictLines, type BaseList, type KnownFailing } from "./knownFailing";

export interface GameDepth {
  fromZero: string[];
  depth: string[];
  /** Wall milliseconds the proof took to play, when it ran. */
  wallMs: number | null;
  /** Milestone 1 is not ticked and the brief is pending: the proof must play, and the bars wait for the brief. */
  pending?: boolean;
}

/** Play one game's from-zero proof and judge it; a game that cannot be played says why under both rules. */
export async function inspectDepth(root: string, game: string): Promise<GameDepth> {
  const both = (problem: string): GameDepth => ({ fromZero: [problem], depth: [problem], wallMs: null });
  const flowPath = join(root, game, "proofs", "flows", `${FROM_ZERO_FLOW}.flow.ts`);
  if (!existsSync(flowPath)) return both(`has no proofs/flows/${FROM_ZERO_FLOW}.flow.ts that plays a new game through real input`);
  const planPath = join(root, game, "PLAN.md");
  const brief: BriefGate = existsSync(planPath) ? briefDue(readFileSync(planPath, "utf8")) : { ok: false, problems: ["has no PLAN.md"] };
  if (!brief.ok) return both(`needs a complete design brief to be measured against (${brief.problems[0] ?? ""})`);

  const module: unknown = await import(pathToFileURL(flowPath).href);
  const flow = typeof module === "object" && module !== null && "default" in module ? module.default : undefined;
  if (!isProofFlow(flow)) return both(`proofs/flows/${FROM_ZERO_FLOW}.flow.ts must export default defineFlow(game, { run })`);
  const shape = fromZeroShapeProblems(flow);
  if (shape.length > 0 || flow.browser) return { fromZero: shape, depth: shape, wallMs: null };

  const started = performance.now();
  const run = await playFromZero(flow);
  if ("pending" in brief) {
    const played: string[] = [];
    if (!run.report.ok) played.push(`the proof failed at step ${run.report.failure.index} (${run.report.failure.label}): ${run.report.failure.message}`);
    if (run.actedAtMs === null) played.push("the proof never acted: no key, camera turn or button command");
    return { fromZero: played, depth: [], wallMs: performance.now() - started, pending: true };
  }
  return { fromZero: fromZeroProblems(run, brief.brief), depth: depthProblems(run, brief.brief), wallMs: performance.now() - started };
}

export interface DepthCheckResult {
  lines: string[];
  failures: number;
}

/** Judge the games under `root`. A game listed under both rules with no proof yet is not played. */
export async function checkDepth(root: string, games: readonly string[], known: KnownFailing): Promise<DepthCheckResult> {
  const lines: string[] = [];
  let failures = 0;
  for (const game of games) {
    const result = await inspectDepth(root, game);
    for (const [rule, problems] of [["from-zero", result.fromZero], ["depth", result.depth]] as const) {
      const verdict = verdictLines("game-depth", game, rule, judge(game, rule, problems, known));
      lines.push(...verdict.lines);
      if (verdict.failed) failures += verdict.lines.length;
    }
    if (result.wallMs !== null) lines.push(`game-depth: ${game} from-zero proof played in ${(result.wallMs / 1000).toFixed(1)}s`);
    if (result.pending === true) lines.push(`game-depth: PENDING - ${game}: milestone 1 is not ticked; its depth is measured against the brief from the commit that ticks it`);
  }
  lines.push(failures === 0 ? `game-depth: OK - ${games.length} games checked` : `game-depth: FAIL - ${failures} problem${failures === 1 ? "" : "s"} in ${games.length} games`);
  return { lines, failures };
}

export async function runCli(argv: readonly string[], root: string, log: (line: string) => void): Promise<number> {
  const rootAt = argv.indexOf("--root");
  const target = rootAt >= 0 ? (argv[rootAt + 1] ?? root) : root;
  const baseAt = argv.indexOf("--base");
  const base = baseAt >= 0 ? (argv[baseAt + 1] ?? "origin/beta") : "origin/beta";
  const flagValues = new Set([rootAt + 1, baseAt + 1].filter((index) => index > 0));
  const named = argv.filter((arg, index) => !arg.startsWith("--") && !flagValues.has(index));
  const games = gameDirs(target).filter((game) => named.length === 0 || named.includes(game));

  const known = readKnownFailing(target);
  const baseList: BaseList = known.size === 0 ? { kind: "new" } : readBaseKnownFailing(target, base);
  if (baseList.kind === "unreadable") log(`game-depth: NOTE - the known-failing list was not compared with ${base}: ${baseList.why}`);
  const added = addedSinceBase(known, baseList, ["from-zero", "depth"]);
  for (const problem of added) log(`game-depth: FAIL - ${problem}`);

  const result = await checkDepth(target, games, known);
  for (const line of result.lines) log(line);
  return result.failures === 0 && added.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(await runCli(process.argv.slice(2), join(import.meta.dir, ".."), console.log));
