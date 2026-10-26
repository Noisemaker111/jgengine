// One shape for a root command with verbs (`bun run worktree reap`, `bun run perf gate`): a table
// of verb -> script, so each verb's script stays the one home of its job and the root package.json
// carries one entry per tool instead of one per verb.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { renderUsage, type Usage } from "./script-help";

export interface Verb {
  /** The script the verb runs, repo-relative. */
  readonly script: string;
  /** Arguments put before the caller's own. */
  readonly args?: readonly string[];
  /** Seconds `scripts/guard.ts` lets it run before ending it; none runs unguarded. */
  readonly guardSeconds?: number;
  readonly detail: string;
}

export interface VerbTable {
  readonly name: string;
  readonly summary: string;
  readonly verbs: Readonly<Record<string, Verb>>;
  /** The verb a first argument that names no verb goes to, with that argument kept. */
  readonly fallback?: string;
  readonly example: string;
}

export function usageOf(table: VerbTable): Usage {
  return {
    summary: table.summary,
    usage: `bun run ${table.name} <${Object.keys(table.verbs).join("|")}> [<its own flags>]`,
    flags: Object.entries(table.verbs).map(([verb, entry]) => ({ flag: verb, detail: entry.detail })),
    example: table.example,
  };
}

/** The argv a command line resolves to, or null when it names no verb and the table has no fallback. */
export function resolveVerb(table: VerbTable, argv: readonly string[]): string[] | null {
  const [first, ...rest] = argv;
  const named = first !== undefined ? table.verbs[first] : undefined;
  const verb = named ?? (table.fallback !== undefined && first !== undefined && !first.startsWith("-") ? table.verbs[table.fallback] : undefined);
  if (verb === undefined) return null;
  const args = [...(verb.args ?? []), ...(named !== undefined ? rest : argv)];
  if (verb.guardSeconds === undefined) return ["bun", verb.script, ...args];
  return ["bun", "scripts/guard.ts", String(verb.guardSeconds), `bun ${verb.script}`, ...args];
}

/** Run the verb `argv` names; prints the table's usage for `--help` or an unknown verb. */
export function runVerb(table: VerbTable, argv: readonly string[]): number {
  const first = argv[0];
  if (first === undefined || first === "--help" || first === "-h") {
    console.log(renderUsage(table.name, usageOf(table)));
    return first === undefined ? 2 : 0;
  }
  const command = resolveVerb(table, argv);
  if (command === null) {
    console.error(`${table.name}: no verb ${first}\n\n${renderUsage(table.name, usageOf(table))}`);
    return 2;
  }
  const root = fileURLToPath(new URL("..", import.meta.url));
  const result = spawnSync(command[0]!, command.slice(1), { cwd: root, stdio: "inherit" });
  return result.status ?? 1;
}
