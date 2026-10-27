/**
 * Fail a games PR when a game's written capability answers are wrong or `capabilities.json` is
 * behind the engine source.
 *
 * What a game adopts is read from its imports, so nobody writes it and nothing goes stale. A game
 * writes two things in its `jgengine.json` `capabilities` section, and this checks both: `debt`, a
 * game-facing capability whose domain the game has while it runs its own version, with the issue
 * that tracks adopting the shared one; and `probes`, the boot probes that prove an adopted system
 * live. Every failure is a fact about ids and numbers: an unknown capability, debt on something the
 * game already imports or that ships no probe, a debt entry with no issue number, a probe for a
 * module the game does not adopt, a stale ledger. No prose is judged and nothing is read from GitHub.
 *
 * The summary counts `adopted (verified)` apart from `adopted (declared)`: verified means the game
 * named a boot probe for a capability that ships one; `bun run games:capabilities probe` is what
 * proves those counters live on a running page.
 *
 * Usage: bun run check games-capabilities [--summary] [--no-ledger]
 * `--summary` also prints the per-game table, which CI keeps in the job log. `--no-ledger` skips
 * comparing `capabilities.json` with the engine source.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  LEDGER_FILE,
  checkDeclarations,
  deriveLedger,
  ledgerDrift,
  readGames,
  renderSummary,
  type GameDeclaration,
  type Ledger,
} from "./capabilities";

export interface Sink {
  log(message: string): void;
  error(message: string): void;
}

export interface CheckOptions {
  root: string;
  argv: readonly string[];
  sink?: Sink;
  /** The ledger the engine source derives; defaults to reading `packages/`. */
  installed?: Ledger;
  /** Each game's answers and source adoption; defaults to reading the games under `root`. */
  games?: GameDeclaration[];
}

/** Runs the check against `root` and returns the process exit code. */
export function runCheck(options: CheckOptions): number {
  const { root, argv } = options;
  const sink = options.sink ?? console;
  const skipLedger = argv.includes("--no-ledger");
  const summary = argv.includes("--summary");

  let committed: Ledger;
  try {
    committed = JSON.parse(readFileSync(`${root}/${LEDGER_FILE}`, "utf8")) as Ledger;
  } catch {
    sink.error(`capability check: FAIL - ${LEDGER_FILE} is missing; run bun run gen games-ledger`);
    return 1;
  }

  let failed = false;
  const declarations: GameDeclaration[] = options.games ?? readGames(root, committed);

  if (!skipLedger) {
    let installed: Ledger;
    try {
      installed = options.installed ?? deriveLedger(root);
    } catch (error) {
      sink.error(`capability check: FAIL - cannot read the engine packages (${(error as Error).message}).`);
      return 1;
    }
    const drift = ledgerDrift(committed, installed);
    if (drift.length > 0) {
      failed = true;
      sink.error(`capability check: FAIL - ${LEDGER_FILE} is behind the engine source:`);
      for (const line of drift) sink.error(`  ${line}`);
      sink.error("");
      sink.error("Run bun run gen games-ledger (bun run lane:close does this itself).");
    }
  }

  const report = checkDeclarations(committed, declarations);

  if (summary || report.problems.length > 0) {
    sink.log("");
    sink.log(renderSummary(report, committed));
  }

  if (report.problems.length > 0) {
    failed = true;
    sink.error("");
    sink.error(`capability check: FAIL - ${report.problems.length} problem(s):`);
    for (const problem of report.problems) sink.error(`  ${problem.message}`);
    sink.error("");
    sink.error("A debt entry is a game-facing capability the game has the domain of but does not import, with the number of the issue that tracks adopting it.");
    sink.error("Ledger: capabilities.json   Answers: <game>/jgengine.json capabilities.debt / .probes   Rule: games/AGENTS.md -> Capability adoption");
  }

  if (failed) return 1;

  if (report.declarationLevel.length > 0 && !summary) {
    const byCapability = new Map<string, string[]>();
    for (const entry of report.declarationLevel) {
      const adopters = byCapability.get(entry.capability) ?? [];
      adopters.push(entry.game);
      byCapability.set(entry.capability, adopters);
    }
    sink.log("Adopted game-facing capabilities with no boot probe named, so the running page cannot prove them yet:");
    for (const [capability, adopters] of [...byCapability].sort()) {
      const entry = committed.capabilities.find((item) => item.id === capability);
      sink.log(`  ${capability} (${entry?.module ?? "?"}): ${adopters.join(", ")}`);
    }
  }

  sink.log(
    `capability check: OK - ${declarations.length} games, ${committed.capabilities.filter((entry) => entry.gameFacing).length} game-facing capabilities, ${report.verified} adopted (verified), ${report.declared} adopted (declared), ${report.debt} debt`,
  );
  return 0;
}

if (import.meta.main) {
  process.exit(runCheck({ root: fileURLToPath(new URL("..", import.meta.url)), argv: process.argv.slice(2) }));
}
