/**
 * Fail a games PR when a game's written capability answers are wrong, `capabilities.json` is
 * behind the engine source, or adoption debt is above its committed budget.
 *
 * What a game adopts is read from its imports, so nobody writes it and nothing goes stale. A game
 * writes two things in its `jgengine.json` `capabilities` section, and this checks both: `debt`, a
 * game-facing capability whose domain the game has while it runs its own version (a reason naming
 * the domain, and the open issue that tracks adopting the shared one), and `probes`, the boot probes
 * that prove an adopted system live. `check games-framework` stops new hand-rolled systems; debt is
 * the list of old ones.
 *
 * The summary counts `adopted (verified)` apart from `adopted (declared)`: verified means the game
 * named a boot probe for a capability that ships one; `bun run games:capabilities probe` is what
 * proves those counters live on a running page.
 *
 * `scripts/debt-budget.json` makes debt a ratchet: a total and a per-game ceiling that `--write`
 * seeds from the tally and may only lower. More debt than the budget fails, and a budget above the
 * tally fails too, so clearing an entry has to take its budget with it. The summary's last line is
 * the trend.
 *
 * Usage: bun run check games-capabilities [--summary] [--write] [--no-ledger] [--no-issues]
 * `--summary` also prints the per-game adopted / debt table, which CI keeps in the job log.
 * `--write` re-seeds the debt budget from the tally and only ever shrinks it. `--no-issues` skips
 * reading the debt issues in this repo (offline work only; the gate cannot prove an owner without them).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  DEBT_REASON_MIN,
  LEDGER_FILE,
  checkDeclarations,
  deriveLedger,
  ledgerDrift,
  readGames,
  renderSummary,
  type GameDeclaration,
  type IssueState,
  type Ledger,
} from "./capabilities";
import {
  BUDGET_REL,
  buildBudget,
  describeBreach,
  describeStale,
  evaluateBudget,
  previousBudget,
  readBudget,
  renderBudget,
  renderTrend,
  type BudgetVerdict,
  type DebtBudget,
} from "./debt-budget";

export interface Sink {
  log(message: string): void;
  error(message: string): void;
}

export interface CheckOptions {
  root: string;
  argv: readonly string[];
  sink?: Sink;
  /** ISO date `--write` records; tests pin it. */
  today?: string;
  /** The installed ledger; defaults to the installed `@jgengine/*` declarations. */
  installed?: Ledger;
  /** Each game's answers and source adoption; defaults to reading the games under `root`. */
  games?: GameDeclaration[];
  /** Debt issue states; defaults to one `gh issue list` for this repo. */
  readIssues?: (root: string) => Map<number, IssueState>;
}

/** The repo whose issues own the debt: the one this checkout pushes to. */
function repoSlug(root: string): string {
  const configured = process.env.CAPABILITIES_ISSUE_REPO;
  if (configured !== undefined && configured !== "") return configured;
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" }).trim();
    const match = /github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/.exec(url);
    if (match?.[1] !== undefined) return match[1];
  } catch {
    // Fall through to the explicit failure below.
  }
  return "";
}

/** One call for every issue, so a dozen debt entries do not cost a dozen requests. */
function readIssueStates(root: string): Map<number, IssueState> {
  const repo = repoSlug(root);
  if (repo === "") throw new Error("cannot tell which repo owns the debt issues; set CAPABILITIES_ISSUE_REPO=owner/repo");
  const raw = execFileSync(
    "gh",
    ["issue", "list", "--repo", repo, "--state", "all", "--limit", "2000", "--json", "number,state"],
    { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  const listed = JSON.parse(raw) as Array<{ number: number; state: string }>;
  const states = new Map<number, IssueState>();
  for (const issue of listed) {
    states.set(issue.number, { state: issue.state.toLowerCase() === "open" ? "open" : "closed" });
  }
  return states;
}

/** Runs the gate against `root` and returns the process exit code. */
export function runCheck(options: CheckOptions): number {
  const { root, argv } = options;
  const sink = options.sink ?? console;
  const now = new Date();
  const today =
    options.today ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const skipLedger = argv.includes("--no-ledger");
  const summary = argv.includes("--summary");
  const skipIssues = argv.includes("--no-issues");
  const write = argv.includes("--write");

  let committed: Ledger;
  try {
    committed = JSON.parse(readFileSync(`${root}/${LEDGER_FILE}`, "utf8")) as Ledger;
  } catch {
    sink.error(`capability check: FAIL - ${LEDGER_FILE} is missing; run bun run gen games-ledger`);
    return 1;
  }

  let budget: DebtBudget | null;
  try {
    budget = readBudget(root);
  } catch (error) {
    sink.error(`capability check: FAIL - ${(error as Error).message}`);
    return 1;
  }

  let failed = false;
  /** True when the tally itself cannot be trusted, so `--write` must not record it. */
  let blocked = false;

  const declarations: GameDeclaration[] = options.games ?? readGames(root, committed);

  if (!skipLedger) {
    let installed: Ledger;
    try {
      installed = options.installed ?? deriveLedger(root);
    } catch (error) {
      sink.error(`capability check: FAIL - cannot read the installed @jgengine/* packages (${(error as Error).message}).`);
      return 1;
    }
    const drift = ledgerDrift(committed, installed);
    if (drift.length > 0) {
      failed = true;
      blocked = true;
      sink.error(`capability check: FAIL - ${LEDGER_FILE} is behind the installed @jgengine/* packages:`);
      for (const line of drift) sink.error(`  ${line}`);
      sink.error("Run bun run gen games-ledger (lane:close runs it).");
    }
  }

  let issues: Map<number, IssueState> | undefined;
  if (skipIssues) {
    sink.error("capability check: WARNING - --no-issues skips reading debt owners; a closed issue can still hold debt.");
  } else {
    try {
      issues = (options.readIssues ?? readIssueStates)(root);
    } catch (error) {
      failed = true;
      blocked = true;
      sink.error(`capability check: FAIL - cannot read the debt issues (${(error as Error).message}).`);
      sink.error("Debt cannot outlive the issue that explains it; fix gh access or pass --no-issues for an offline read.");
    }
  }

  const report = checkDeclarations(committed, declarations, issues);

  // Only a clean tally is comparable with the budget: a missing or broken
  // declaration undercounts debt, which would read as a stale budget instead of
  // the declaration problem that actually needs fixing.
  let verdict: BudgetVerdict | null = null;
  if (report.problems.length === 0 && budget !== null) {
    verdict = evaluateBudget(report.tallies, budget, report.debtEntries);
  }

  if (budget === null && !write) {
    sink.error("");
    sink.error(`capability check: FAIL - ${BUDGET_REL} is missing; it is the committed debt budget.`);
    sink.error("Create it once from the current tally with: bun run check games-capabilities --write");
    failed = true;
  }

  const breach = verdict !== null && verdict.over.length > 0;
  const stale = verdict !== null && verdict.stale.length > 0;

  if (summary || report.problems.length > 0 || breach || stale) {
    sink.log("");
    sink.log(renderSummary(report, committed));
    if (budget !== null && report.problems.length === 0) {
      sink.log(renderTrend(report.debt, budget));
    }
  }

  if (report.problems.length > 0) {
    failed = true;
    blocked = true;
    sink.error("");
    sink.error(`capability check: FAIL - ${report.problems.length} problem(s):`);
    for (const problem of report.problems) sink.error(`  ${problem.message}`);
    sink.error("");
    sink.error(`A debt entry is a game-facing capability the game has the domain of but does not import: ${DEBT_REASON_MIN}+ characters naming the domain, and the open issue that tracks adopting it.`);
    sink.error("Ledger: capabilities.json   Answers: <game>/jgengine.json capabilities.debt / .probes   Rule: games/AGENTS.md -> Capability adoption");
  }

  if (!write && verdict !== null && budget !== null && (verdict.over.length > 0 || verdict.stale.length > 0)) {
    failed = true;
    sink.error("");
    if (verdict.over.length > 0) {
      sink.error(`capability check: FAIL - debt is above its budget (${BUDGET_REL}):`);
      for (const entry of verdict.over) {
        for (const line of describeBreach(entry)) sink.error(`  ${line}`);
      }
      sink.error("");
      sink.error("Debt only goes down. Clear those entries by adopting the capability (importing it pays the debt); --write will not raise the budget.");
    }
    if (verdict.stale.length > 0) {
      if (verdict.over.length > 0) sink.error("");
      sink.error(`capability check: FAIL - the debt budget is above the tally (${BUDGET_REL}):`);
      for (const entry of verdict.stale) sink.error(`  ${describeStale(entry)}`);
    }
    sink.error("");
    sink.error(`Trend: ${renderTrend(report.debt, budget)}`);
  }

  if (write) {
    if (blocked) {
      sink.error("");
      sink.error(`capability check: FAIL - --write did not touch ${BUDGET_REL}; fix the failures above first, so the budget records a clean tally.`);
      return 1;
    }
    if (verdict !== null && verdict.over.length > 0) {
      sink.error("");
      sink.error(`capability check: FAIL - --write will not raise ${BUDGET_REL}; debt is shrink-only:`);
      for (const entry of verdict.over) {
        for (const line of describeBreach(entry)) sink.error(`  ${line}`);
      }
      sink.error("");
      sink.error("Clear those entries first: adopt the capability, which pays the debt.");
      return 1;
    }

    const next = buildBudget(budget, report.tallies, today);
    writeFileSync(`${root}/${BUDGET_REL}`, renderBudget(next));
    const was = previousBudget(next);
    if (budget === null) {
      sink.log(`debt budget: seeded ${next.total} entries across ${Object.keys(next.games).length} game(s) in ${BUDGET_REL}`);
    } else if (was !== null && was.total !== next.total) {
      sink.log(`debt budget: ${budget.total} -> ${next.total} entries in ${BUDGET_REL} (was ${was.total} on ${was.on})`);
    } else {
      sink.log(`debt budget: ${next.total} entries in ${BUDGET_REL}, unchanged`);
    }
    return 0;
  }

  if (failed) return 1;

  if (!summary) {
    const closed = report.debtEntries.filter((entry) => issues?.get(entry.issue)?.state !== "open");
    if (closed.length > 0) {
      sink.error("");
      sink.error("Debt without a live owner:");
      for (const entry of closed) sink.error(`  ${entry.game} ${entry.capability} -> #${entry.issue}`);
    }
  }

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
    `capability check: OK - ${declarations.length} games, ${committed.capabilities.filter((entry) => entry.gameFacing).length} game-facing capabilities, ${report.verified} adopted (verified), ${report.declared} adopted (declared), ${report.debt} debt${budget === null ? "" : ` (${BUDGET_REL} budget ${budget.total})`}`,
  );
  return 0;
}

if (import.meta.main) {
  process.exit(runCheck({ root: fileURLToPath(new URL("..", import.meta.url)), argv: process.argv.slice(2) }));
}
