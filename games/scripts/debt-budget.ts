/**
 * The adoption debt budget: a shrink-only ratchet on the debt entries in each
 * game's `capabilities.json`.
 *
 * Debt is the number the ledger exists to bring down, so it may not move back up.
 * This file holds the committed ceiling - one total and one number per game -
 * that `bun run check games-capabilities --write` seeds from the tally and may only
 * lower. It is the same shape as `scripts/module-global-baseline.json`: one
 * baseline, one command that may only shrink it.
 *
 * Two failures, both on the way down: a game or the total carrying more debt
 * than its budget (clear entries, or the next debt entry is refused), and a
 * budget higher than the tally (a cleared entry must take its budget with it).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DebtEntry } from "./capabilities";

export const BUDGET_REL = "scripts/debt-budget.json";

/** An earlier committed budget; the last entry is the summary's "was". */
export interface BudgetHistoryEntry {
  total: number;
  /** ISO date the earlier budget was written. */
  on: string;
}

export interface DebtBudget {
  /** ISO date `--write` last wrote this budget. */
  updated: string;
  /** Debt entries the repo may carry in total; always the sum of `games`. */
  total: number;
  /** Per-game ceiling. A game absent from this map may carry no debt at all. */
  games: Record<string, number>;
  /** Earlier budgets, oldest first. */
  history: BudgetHistoryEntry[];
}

export interface BudgetTally {
  game: string;
  debt: number;
}

/** A game carrying more debt than its budget. */
export interface BudgetBreach {
  game: string;
  actual: number;
  budget: number;
  /** The game's debt entries, lowest issue first: the issue to clear first leads. */
  entries: DebtEntry[];
}

/** A budget above the tally; `game: null` is the total. */
export interface StaleBudget {
  game: string | null;
  budget: number;
  actual: number;
}

export interface BudgetVerdict {
  over: BudgetBreach[];
  stale: StaleBudget[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function nonNegativeInteger(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${BUDGET_REL}: ${where} must be a whole number of debt entries, got ${JSON.stringify(value)}`);
  }
  return value;
}

export function parseBudget(source: string): DebtBudget {
  const parsed = JSON.parse(source) as Partial<DebtBudget> | null;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${BUDGET_REL}: must be a JSON object with "updated", "total", "games" and "history"`);
  }
  if (typeof parsed.updated !== "string" || !ISO_DATE.test(parsed.updated)) {
    throw new Error(`${BUDGET_REL}: "updated" must be an ISO date such as 2026-10-23`);
  }
  if (typeof parsed.games !== "object" || parsed.games === null || Array.isArray(parsed.games)) {
    throw new Error(`${BUDGET_REL}: "games" must map each game to its debt ceiling`);
  }

  const games: Record<string, number> = {};
  for (const [game, value] of Object.entries(parsed.games)) {
    games[game] = nonNegativeInteger(value, `"games.${game}"`);
  }
  const total = nonNegativeInteger(parsed.total, '"total"');
  const sum = Object.values(games).reduce((sum, value) => sum + value, 0);
  if (total !== sum) {
    throw new Error(
      `${BUDGET_REL}: "total" is ${total} but the per-game budgets add up to ${sum} - run bun run check games-capabilities --write`,
    );
  }

  const history: BudgetHistoryEntry[] = [];
  for (const [index, entry] of (parsed.history ?? []).entries()) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${BUDGET_REL}: "history[${index}]" must be {"total": <number>, "on": "<date>"}`);
    }
    const on = (entry as BudgetHistoryEntry).on;
    if (typeof on !== "string" || !ISO_DATE.test(on)) {
      throw new Error(`${BUDGET_REL}: "history[${index}].on" must be an ISO date`);
    }
    history.push({ total: nonNegativeInteger((entry as BudgetHistoryEntry).total, `"history[${index}].total"`), on });
  }

  return { updated: parsed.updated, total, games, history };
}

export function budgetPath(root: string): string {
  return join(root, BUDGET_REL);
}

/** The committed budget, or null when this checkout has none yet. */
export function readBudget(root: string): DebtBudget | null {
  const path = budgetPath(root);
  if (!existsSync(path)) return null;
  return parseBudget(readFileSync(path, "utf8"));
}

export function renderBudget(budget: DebtBudget): string {
  const games = Object.fromEntries(
    Object.entries(budget.games).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return `${JSON.stringify({ ...budget, games }, null, 2)}\n`;
}

/** The budget the trend line compares against, if an earlier one was committed. */
export function previousBudget(budget: DebtBudget): BudgetHistoryEntry | null {
  return budget.history.at(-1) ?? null;
}

/**
 * Compare the tally with the committed budget.
 *
 * Every game verdict and the total are reported: a game over its budget means
 * new debt arrived, and a budget over its game or total means entries were
 * cleared without lowering the file.
 */
export function evaluateBudget(
  tallies: readonly BudgetTally[],
  budget: DebtBudget,
  entries: readonly DebtEntry[],
): BudgetVerdict {
  const over: BudgetBreach[] = [];
  const stale: StaleBudget[] = [];

  for (const tally of tallies) {
    const limit = budget.games[tally.game] ?? 0;
    if (tally.debt > limit) {
      over.push({
        game: tally.game,
        actual: tally.debt,
        budget: limit,
        entries: entries
          .filter((entry) => entry.game === tally.game)
          .sort((a, b) => a.issue - b.issue || a.capability.localeCompare(b.capability)),
      });
    }
  }

  const tallied = new Map(tallies.map((tally) => [tally.game, tally.debt]));
  for (const [game, limit] of Object.entries(budget.games)) {
    const actual = tallied.get(game) ?? 0;
    if (limit > actual) stale.push({ game, budget: limit, actual });
  }
  const actualTotal = tallies.reduce((sum, tally) => sum + tally.debt, 0);
  if (budget.total > actualTotal) stale.push({ game: null, budget: budget.total, actual: actualTotal });

  return { over, stale };
}

/** One game over budget, naming the entry and issue to clear first. */
export function describeBreach(breach: BudgetBreach): string[] {
  const noun = breach.actual === 1 ? "entry" : "entries";
  const over = breach.actual - breach.budget;
  const byIssue = new Map<number, string[]>();
  for (const entry of breach.entries) {
    const capabilities = byIssue.get(entry.issue) ?? [];
    capabilities.push(entry.capability);
    byIssue.set(entry.issue, capabilities);
  }
  const ordered = [...byIssue].sort(([a], [b]) => a - b);
  const first = ordered[0];
  const head =
    first === undefined
      ? `${breach.game}: ${breach.actual} debt ${noun}, budget ${breach.budget} - ${over} more than allowed, and no entry names an issue to clear`
      : `${breach.game}: ${breach.actual} debt ${noun}, budget ${breach.budget} - ${over} over; clear #${first[0]} (${first[1].join(", ")}) first`;
  if (ordered.length <= 1) return [head];
  const rest = ordered
    .slice(1)
    .map(([issue, capabilities]) => `#${issue} (${capabilities.join(", ")})`)
    .join(", ");
  return [head, `  then ${rest}`];
}

export function describeStale(stale: StaleBudget): string {
  const where = stale.game === null ? "total" : stale.game;
  return `${where}: budget ${stale.budget}, tally ${stale.actual} - the budget may only shrink; run bun run check games-capabilities --write`;
}

/** `debt: 43 (budget 43, was 50 on 2026-10-16)` - the one trend line the summary prints. */
export function renderTrend(debt: number, budget: DebtBudget): string {
  const was = previousBudget(budget);
  return was === null
    ? `debt: ${debt} (budget ${budget.total}, no earlier budget)`
    : `debt: ${debt} (budget ${budget.total}, was ${was.total} on ${was.on})`;
}

/**
 * The budget `--write` would commit: exactly today's tally, per game and in
 * total. The caller refuses this when a tally is above the committed budget, so
 * this function never raises a ceiling.
 */
export function buildBudget(
  previous: DebtBudget | null,
  tallies: readonly BudgetTally[],
  today: string,
): DebtBudget {
  const games: Record<string, number> = {};
  for (const tally of [...tallies].sort((a, b) => (a.game < b.game ? -1 : a.game > b.game ? 1 : 0))) {
    games[tally.game] = tally.debt;
  }
  const total = tallies.reduce((sum, tally) => sum + tally.debt, 0);
  const history = previous === null ? [] : [...previous.history];
  if (previous !== null && previous.total !== total) {
    history.push({ total: previous.total, on: previous.updated });
  }
  return { updated: today, total, games, history };
}
