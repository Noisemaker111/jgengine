/**
 * Makes every game's stated loop something the repo requires, not something a README hopes for.
 *
 * Each game's README carries the same six design-checklist sections and one `Loop proof:` line
 * naming the flow that proves the loop. This gate fails a game that:
 *
 *   - has no README, or is missing a section (core loop, progression, failure states,
 *     minute 5 -> hour 5, references, gap to target);
 *   - has no `Loop proof:` line, or names no flow;
 *   - names a flow whose file is not at `<game>/proofs/flows/<name>.json`, or that the engine's
 *     drive refuses, or that asserts nothing.
 *
 * Whether a flow parses is the engine's answer, not this file's: each one goes through `drive`'s own
 * `parseStepFile` (`jgengine/templates/captureArgs`) with this game's flow folder, so its step kinds,
 * fields, includes, depth and cycles are refused here exactly when `drive` would refuse them.
 *
 * A name prefixed `TODO` is a flow the README promises and nobody has written. It is reported as a
 * TODO line rather than a failure, so the four games still to be covered can be cut as their own
 * lanes; `--strict` fails them, which is the state this gate is aiming at.
 *
 * Usage: bun run check games-design [--strict] [--root <dir>]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseStepFile, type FlowFile } from "../../packages/jgengine/src/templates/captureArgs";

import { gameDirs } from "./capabilities";

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
  /** Flows the README names that exist and parse. */
  proven: string[];
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
      return readdirSync(dir).map((name) => name.replace(/\.json$/, ""));
    } catch {
      return [];
    }
  },
};

/** The engine's step-file parser, or a stand-in a test hands over to prove this gate follows it. */
export type ParseSteps = typeof parseStepFile;

/**
 * Parse one named flow the way `drive` does, includes and all, and count the asserts it runs. A flow
 * the parser refuses comes back as one problem carrying the engine's own message.
 */
export function checkFlow(game: string, flowName: string, flowsDir: string, io: Io = realIo, parse: ParseSteps = parseStepFile): { problems: string[]; asserts: number } {
  const read = (name: string): FlowFile | undefined => {
    const file = `${flowsDir}/${name}.json`;
    const source = `${game}/proofs/flows/${name}.json`;
    if (!io.exists(file)) {
      const available = io.listFlows(flowsDir).sort();
      throw new Error(`no flow named "${name}": ${source} does not exist${available.length === 0 ? "" : ` (available: ${available.join(", ")})`}`);
    }
    try {
      return { json: JSON.parse(io.read(file)) as unknown, source };
    } catch (error) {
      throw new Error(`${source} is not valid JSON (${error instanceof Error ? error.message : String(error)})`);
    }
  };
  try {
    const root = read(flowName)!;
    const steps = parse(root.json, root.source, { flows: read });
    return { problems: [], asserts: steps.filter((step) => step.kind === "assert").length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const located = message.startsWith(`${game}/`) ? message : `${game}/proofs/flows/${flowName}.json ${message}`;
    return { problems: [`${game} Loop proof "${flowName}": ${located}`], asserts: 0 };
  }
}

/** Check one game's README and the flows it names. */
export function inspectGame(root: string, game: string, io: Io = realIo): GameInspection {
  const problems: string[] = [];
  const todos: string[] = [];
  const proven: string[] = [];
  const dir = join(root, game);
  const readme = join(dir, "README.md");

  if (!io.exists(readme)) {
    return { game, problems: [`${game} has no README.md with a design checklist`], todos, proven };
  }
  const text = io.read(readme);
  for (const section of SECTIONS) {
    if (!section.pattern.test(text)) problems.push(`${game} README is missing the "${section.label}" section of the design checklist`);
  }

  const proof = readLoopProof(text);
  if (!proof.ok) {
    problems.push(`${game} README ${proof.problem}`);
    return { game, problems, todos, proven };
  }

  const flowsDir = join(dir, "proofs", "flows");
  for (const entry of proof.entries) {
    if (entry.todo) {
      todos.push(entry.name);
      continue;
    }
    const file = join(flowsDir, `${entry.name}.json`);
    if (!io.exists(file)) {
      const available = io.listFlows(flowsDir);
      problems.push(
        `${game} Loop proof names "${entry.name}", but ${game}/proofs/flows/${entry.name}.json does not exist` +
          (available.length === 0
            ? " (the game has no flows; write one that reaches the loop and asserts the arrival)"
            : ` (available: ${available.sort().join(", ")})`),
      );
      continue;
    }
    const tree = checkFlow(game, entry.name, flowsDir, io);
    problems.push(...tree.problems);
    if (tree.problems.length === 0) {
      if (tree.asserts === 0) {
        problems.push(`${game} Loop proof "${entry.name}" runs steps but asserts nothing; a flow without an arrival assert is not a proof`);
      } else {
        proven.push(entry.name);
      }
    }
  }
  return { game, problems, todos, proven };
}

export interface CheckResult {
  lines: string[];
  failures: number;
  todos: number;
}

/** Check every game directory under `root`; `strict` turns the TODO lines into failures. */
export function checkGames(root: string, games: string[], io: Io = realIo, strict = false): CheckResult {
  const lines: string[] = [];
  let failures = 0;
  let todos = 0;

  for (const game of games) {
    const result = inspectGame(root, game, io);
    for (const problem of result.problems) {
      failures += 1;
      lines.push(`game-design: FAIL - ${problem}`);
    }
    for (const name of result.todos) {
      todos += 1;
      const message = `${game} Loop proof names "${name}" as TODO: no ${game}/proofs/flows/${name}.json yet`;
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
  const result = checkGames(target, gameDirs(target), realIo, strict);
  for (const line of result.lines) log(line);
  return result.failures === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(runCli(process.argv.slice(2), process.cwd(), console.log));
