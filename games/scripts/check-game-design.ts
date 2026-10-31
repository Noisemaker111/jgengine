/**
 * Makes every game's stated loop something the repo requires, not something a README hopes for.
 *
 * Each game's README carries the same six design-checklist sections and one `Loop proof:` line
 * naming the flow that proves the loop. This gate fails a game that:
 *
 *   - has no README, or is missing a section (core loop, progression, failure states,
 *     minute 5 -> hour 5, references, gap to target - a `PLAN.md` with its `## Gaps` section
 *     answers the last one);
 *   - has no `Loop proof:` line, or names no flow;
 *   - names a flow whose file is not at `<game>/proofs/flows/<name>.flow.ts`, that does not export
 *     `defineFlow(...)` by default, or that expects nothing.
 *
 * Whether a flow is well formed is the compiler's answer, not this file's: a flow is TypeScript
 * against the game's own typed probe, and the game's typecheck covers `proofs/`. This gate only
 * checks that the README's proof exists and checks an arrival rather than just pressing keys.
 *
 * A name prefixed `TODO` is a flow the README promises and nobody has written. It is reported as a
 * TODO line rather than a failure, so the four games still to be covered can be cut as their own
 * lanes; `--strict` fails them, which is the state this gate is aiming at.
 *
 * Every game also carries a design brief in its `PLAN.md` (`designBrief.ts` says what it holds). It
 * is written once milestone 1 plays: a pending brief passes while milestone 1 is unticked, and the
 * full brief is required from the commit that ticks it. A game without a complete one fails, unless `depth-known-failing.json` lists it for `brief`; that
 * list only shrinks (`knownFailing.ts`), checked against `--base` (default origin/beta).
 *
 * Usage: bun run check games-design [--strict] [--root <dir>] [--base <ref>]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { gameDirs } from "./capabilities";
import { briefDue, type BriefGate } from "./designBrief";
import { addedSinceBase, judge, readBaseKnownFailing, readKnownFailing, verdictLines, type BaseList, type KnownFailing } from "./knownFailing";

/** This repo names flow files in lowercase letters, digits and dashes; the Loop proof line uses them. */
const FLOW_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** The six sections every game's design checklist states, and the bold label each is written as. */
export const SECTIONS: ReadonlyArray<{ id: string; label: string; pattern: RegExp }> = [
  { id: "core-loop", label: "Core loop", pattern: /\*\*Core loop\b/ },
  { id: "progression", label: "Progression", pattern: /\*\*Progression\b/ },
  { id: "failure-states", label: "Failure states", pattern: /\*\*Failure states\b/ },
  { id: "minute-5", label: "Minute 5 -> hour 5", pattern: /\*\*Minute 5\b/ },
  { id: "references", label: "References it is chasing", pattern: /\*\*References\b/ },
  { id: "gap-to-target", label: "Gap to target", pattern: /\*\*Gap to target\b/ },
];

export interface LoopProofEntry {
  name: string;
  /** The README promises this flow; nobody has written it yet. */
  todo: boolean;
}

export type LoopProof =
  | { ok: true; entries: LoopProofEntry[] }
  | { ok: false; problem: string };

/**
 * Read the `Loop proof:` line. It names one or more flows as bare names separated by commas; a
 * trailing parenthetical is a note (the `--state` a run needs), not a name.
 */
export function readLoopProof(readme: string): LoopProof {
  const match = /^Loop proof: *(.*)$/m.exec(readme);
  if (match === null) {
    return { ok: false, problem: 'has no "Loop proof:" line; name the flow that proves the core loop' };
  }
  const raw = (match[1] ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (raw.length === 0) {
    return { ok: false, problem: 'has an empty "Loop proof:" line; name at least one flow' };
  }
  const entries: LoopProofEntry[] = [];
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (token.length === 0) continue;
    const todoPrefix = /^TODO\b:?/.exec(token);
    const name = todoPrefix === null ? token : token.slice(todoPrefix[0].length).trim();
    if (!FLOW_NAME.test(name)) {
      return {
        ok: false,
        problem: `names "${token}" on its Loop proof line, which is not a flow name (lowercase letters, digits and dashes)`,
      };
    }
    entries.push({ name, todo: todoPrefix !== null });
  }
  if (entries.length === 0) {
    return { ok: false, problem: 'has a "Loop proof:" line that names no flow' };
  }
  return { ok: true, entries };
}

export interface GameInspection {
  game: string;
  problems: string[];
  /** Flows the README names but nobody has written. */
  todos: string[];
  /** Flows the README names that exist and expect an arrival. */
  proven: string[];
  /** What the `PLAN.md` design brief is missing; empty when it is complete or still pending. */
  briefProblems: string[];
  /** The brief is still pending because milestone 1 is not ticked yet. */
  briefPending: boolean;
}

type Read = (path: string) => string;
type Exists = (path: string) => boolean;
type ListFlows = (dir: string) => string[];

export interface Io {
  read: Read;
  exists: Exists;
  listFlows: ListFlows;
}

export const realIo: Io = {
  read: (path) => readFileSync(path, "utf8"),
  exists: (path) => existsSync(path),
  listFlows: (dir) => {
    try {
      return readdirSync(dir).filter((name) => name.endsWith(FLOW_EXTENSION)).map((name) => name.slice(0, -FLOW_EXTENSION.length));
    } catch {
      return [];
    }
  },
};

/** A TypeScript proof flow's file extension. */
export const FLOW_EXTENSION = ".flow.ts";

/** The flow calls that check an arrival: a probe or page expectation, a wait on one, or a hold until one passes. */
const ARRIVAL = /\.(?:expect|waitFor|expectPage|waitForPage|see)\(|\buntil\s*:/g;

/** Read one named flow and count the arrival checks it makes. */
export function checkFlow(game: string, flowName: string, flowsDir: string, io: Io = realIo): { problems: string[]; asserts: number } {
  const source = `${game}/proofs/flows/${flowName}${FLOW_EXTENSION}`;
  const text = io.read(`${flowsDir}/${flowName}${FLOW_EXTENSION}`);
  if (!/export\s+default\s+defineFlow\(/.test(text)) {
    return { problems: [`${game} Loop proof "${flowName}": ${source} must export default defineFlow(game, { run })`], asserts: 0 };
  }
  return { problems: [], asserts: text.match(ARRIVAL)?.length ?? 0 };
}

/** A game's build plan, written with the `create-game-jg` skill. */
const PLAN_FILE = "PLAN.md";
/** The plan section naming the engine work a game still needs: its gap to target. */
const PLAN_GAPS_HEADING = "## Gaps";

/**
 * A game's `PLAN.md` (the `create-game-jg` skill) states its gap to target in its `## Gaps` section and
 * its milestones, so a README need not repeat it.
 */
function planHasGaps(path: string, io: Io): boolean {
  if (!io.exists(path)) return false;
  return io.read(path).split("\n").some((line) => line.trim() === PLAN_GAPS_HEADING);
}

/** Check one game's README and the flows it names. */
export function inspectGame(root: string, game: string, io: Io = realIo): GameInspection {
  const problems: string[] = [];
  const todos: string[] = [];
  const proven: string[] = [];
  const dir = join(root, game);
  const readme = join(dir, "README.md");
  const planPath = join(dir, PLAN_FILE);
  const brief: BriefGate = io.exists(planPath) ? briefDue(io.read(planPath)) : { ok: false, problems: ["has no PLAN.md with a design brief"] };
  const briefProblems = brief.ok ? [] : brief.problems;
  const briefPending = brief.ok && "pending" in brief;

  if (!io.exists(readme)) {
    return { game, problems: [`${game} has no README.md with a design checklist`], todos, proven, briefProblems, briefPending };
  }
  const text = io.read(readme);
  const planned = planHasGaps(planPath, io);
  for (const section of SECTIONS) {
    if (section.id === "gap-to-target" && planned) continue;
    if (!section.pattern.test(text)) problems.push(`${game} README is missing the "${section.label}" section of the design checklist`);
  }

  const proof = readLoopProof(text);
  if (!proof.ok) {
    problems.push(`${game} README ${proof.problem}`);
    return { game, problems, todos, proven, briefProblems, briefPending };
  }

  const flowsDir = join(dir, "proofs", "flows");
  for (const entry of proof.entries) {
    if (entry.todo) {
      todos.push(entry.name);
      continue;
    }
    const file = join(flowsDir, `${entry.name}${FLOW_EXTENSION}`);
    if (!io.exists(file)) {
      const available = io.listFlows(flowsDir);
      problems.push(
        `${game} Loop proof names "${entry.name}", but ${game}/proofs/flows/${entry.name}${FLOW_EXTENSION} does not exist` +
          (available.length === 0
            ? " (the game has no flows; write one that reaches the loop and expects the arrival)"
            : ` (available: ${available.sort().join(", ")})`),
      );
      continue;
    }
    const tree = checkFlow(game, entry.name, flowsDir, io);
    problems.push(...tree.problems);
    if (tree.problems.length === 0) {
      if (tree.asserts === 0) {
        problems.push(`${game} Loop proof "${entry.name}" runs steps but expects nothing; a flow that never checks an arrival (expect, waitFor, hold until) is not a proof`);
      } else {
        proven.push(entry.name);
      }
    }
  }
  return { game, problems, todos, proven, briefProblems, briefPending };
}

export interface CheckResult {
  lines: string[];
  failures: number;
  todos: number;
}

/**
 * Check every game directory under `root`; `strict` turns the TODO lines into failures. `known` is the
 * shrink-only list of games whose brief is still missing.
 */
export function checkGames(root: string, games: string[], io: Io = realIo, strict = false, known: KnownFailing = new Map()): CheckResult {
  const lines: string[] = [];
  let failures = 0;
  let todos = 0;

  for (const game of games) {
    const result = inspectGame(root, game, io);
    for (const problem of result.problems) {
      failures += 1;
      lines.push(`game-design: FAIL - ${problem}`);
    }
    const brief = verdictLines("game-design", game, "brief", judge(game, "brief", result.briefProblems, known));
    if (result.briefPending && !brief.failed) {
      lines.push(`game-design: PENDING - ${game} brief: milestone 1 is not ticked yet; the brief is due with it`);
    } else if (brief.failed) {
      failures += brief.lines.length;
      lines.push(...brief.lines);
    } else if (!brief.lines.every((line) => line.includes(": OK - "))) {
      lines.push(...brief.lines);
    }
    for (const name of result.todos) {
      todos += 1;
      const message = `${game} Loop proof names "${name}" as TODO: no ${game}/proofs/flows/${name}${FLOW_EXTENSION} yet`;
      if (strict) {
        failures += 1;
        lines.push(`game-design: FAIL - ${message}`);
      } else {
        lines.push(`game-design: TODO - ${message}`);
      }
    }
    if (result.problems.length === 0) {
      const proven = result.proven.length === 0 ? "no flow yet" : `flow${result.proven.length === 1 ? "" : "s"} ${result.proven.join(", ")}`;
      lines.push(`game-design: OK - ${game}: 6 sections, ${proven}`);
    }
  }

  if (failures > 0) {
    lines.push(`game-design: FAIL - ${failures} problem${failures === 1 ? "" : "s"} in ${games.length} games`);
  } else {
    const todoNote = todos === 0 ? "" : `, ${todos} TODO proof${todos === 1 ? "" : "s"} still to write`;
    lines.push(`game-design: OK - ${games.length} games carry the six sections and name a flow${todoNote}`);
  }
  return { lines, failures, todos };
}

export function runCli(argv: string[], root: string, log: (line: string) => void): number {
  const strict = argv.includes("--strict");
  const at = argv.indexOf("--root");
  const target = at >= 0 ? (argv[at + 1] ?? root) : root;
  const baseAt = argv.indexOf("--base");
  const base = baseAt >= 0 ? (argv[baseAt + 1] ?? "origin/beta") : "origin/beta";
  const known = readKnownFailing(target);
  // An empty list adds nothing, so there is nothing to compare.
  const baseList: BaseList = known.size === 0 ? { kind: "new" } : readBaseKnownFailing(target, base);
  if (baseList.kind === "unreadable") log(`game-design: NOTE - the known-failing list was not compared with ${base}: ${baseList.why}`);
  const added = addedSinceBase(known, baseList, ["brief"]);
  for (const problem of added) log(`game-design: FAIL - ${problem}`);
  const result = checkGames(target, gameDirs(target), realIo, strict, known);
  for (const line of result.lines) log(line);
  return result.failures === 0 && added.length === 0 ? 0 : 1;
}

// The games folder is this script's parent, wherever it is run from: `bun run check` runs it from the
// repository root, where reading the working directory found no games and passed.
if (import.meta.main) process.exit(runCli(process.argv.slice(2), join(import.meta.dir, ".."), console.log));
