/**
 * The games that fail a depth rule today, and why. The list may only shrink.
 *
 * Three rules hold a game to hours of content rather than a two-minute demo: `brief` (a design brief
 * in `PLAN.md`), `from-zero` (a proof that starts a new game and plays its first minutes through real
 * input) and `depth` (the numbers that proof measures against the brief). A game that failed one when
 * the rule landed is listed with the reason; every other game must pass.
 *
 * Shrink only, both ways round:
 *   - a listed game that now passes fails the check until its entry is removed, so a fix is recorded;
 *   - an entry the base branch did not have fails the check, so nobody lists a game to get past it.
 * Never loosen a rule's threshold to pass a game; fix the game.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEPTH_RULES = ["brief", "from-zero", "depth"] as const;
export type DepthRule = (typeof DEPTH_RULES)[number];

/** Repository-relative path of the list. */
export const KNOWN_FAILING_PATH = "games/scripts/depth-known-failing.json";

/** game -> rule -> why it fails today. */
export type KnownFailing = ReadonlyMap<string, ReadonlyMap<DepthRule, string>>;

function isRule(value: string): value is DepthRule {
  return DEPTH_RULES.some((rule) => rule === value);
}

/** Parse the list; a malformed entry throws with its place, since a list nobody can read protects nothing. */
export function parseKnownFailing(text: string): KnownFailing {
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`${KNOWN_FAILING_PATH} must be an object of game -> { rule: reason }`);
  const out = new Map<string, Map<DepthRule, string>>();
  for (const [game, rules] of Object.entries(raw)) {
    if (game.startsWith("$")) continue;
    if (typeof rules !== "object" || rules === null || Array.isArray(rules)) throw new Error(`${KNOWN_FAILING_PATH}: "${game}" must map rules to reasons`);
    const entry = new Map<DepthRule, string>();
    for (const [rule, reason] of Object.entries(rules)) {
      if (!isRule(rule)) throw new Error(`${KNOWN_FAILING_PATH}: "${game}" names rule "${rule}"; the rules are ${DEPTH_RULES.join(", ")}`);
      if (typeof reason !== "string" || reason.trim().length === 0) throw new Error(`${KNOWN_FAILING_PATH}: "${game}" ${rule} needs the reason it fails`);
      entry.set(rule, reason);
    }
    out.set(game, entry);
  }
  return out;
}

/** The list beside the games under `gamesRoot`; a games folder without one (a test fixture) lists nothing. */
export function readKnownFailing(gamesRoot: string): KnownFailing {
  const path = join(gamesRoot, "scripts", "depth-known-failing.json");
  if (!existsSync(path)) return new Map();
  return parseKnownFailing(readFileSync(path, "utf8"));
}

export type BaseList = { kind: "list"; list: KnownFailing } | { kind: "new" } | { kind: "unreadable"; why: string };

/** The list as the base branch has it: absent there means this branch introduces it. */
export function readBaseKnownFailing(gamesRoot: string, base: string): BaseList {
  const ref = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${base}^{commit}`], { cwd: gamesRoot, encoding: "utf8", timeout: 15_000 });
  if (ref.status !== 0) return { kind: "unreadable", why: `${base} is not a commit here (git fetch origin beta)` };
  const shown = spawnSync("git", ["show", `${base}:${KNOWN_FAILING_PATH}`], { cwd: gamesRoot, encoding: "utf8", timeout: 15_000 });
  if (shown.status !== 0) return { kind: "new" };
  return { kind: "list", list: parseKnownFailing(shown.stdout) };
}

/** Entries added since the base: each is a problem. */
export function addedSinceBase(current: KnownFailing, base: BaseList, rules: readonly DepthRule[]): string[] {
  if (base.kind !== "list") return [];
  const problems: string[] = [];
  for (const [game, entry] of current) {
    for (const rule of entry.keys()) {
      if (!rules.includes(rule)) continue;
      if (base.list.get(game)?.has(rule) !== true) {
        problems.push(`${game} was added to ${KNOWN_FAILING_PATH} for "${rule}"; the list only shrinks - make the game pass instead`);
      }
    }
  }
  return problems;
}

export type Verdict =
  | { status: "pass" }
  | { status: "fail"; problems: string[] }
  | { status: "known"; reason: string; problems: string[] }
  | { status: "stale"; reason: string };

/** Judge one game on one rule against the list. */
export function judge(game: string, rule: DepthRule, problems: readonly string[], list: KnownFailing): Verdict {
  const reason = list.get(game)?.get(rule);
  if (problems.length === 0) return reason === undefined ? { status: "pass" } : { status: "stale", reason };
  return reason === undefined ? { status: "fail", problems: [...problems] } : { status: "known", reason, problems: [...problems] };
}

/** The lines a check prints for one verdict, and whether it fails the check. */
export function verdictLines(tag: string, game: string, rule: DepthRule, verdict: Verdict): { lines: string[]; failed: boolean } {
  switch (verdict.status) {
    case "pass":
      return { lines: [`${tag}: OK - ${game} ${rule}`], failed: false };
    case "fail":
      return { lines: verdict.problems.map((problem) => `${tag}: FAIL - ${game} ${rule}: ${problem}`), failed: true };
    case "known":
      return { lines: [`${tag}: KNOWN - ${game} ${rule} (${verdict.reason}); first problem: ${verdict.problems[0] ?? ""}`], failed: false };
    case "stale":
      return { lines: [`${tag}: FAIL - ${game} now passes "${rule}"; remove its entry from ${KNOWN_FAILING_PATH} (it said: ${verdict.reason})`], failed: true };
  }
}
