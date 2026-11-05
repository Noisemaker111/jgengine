// `bun run background status <id> [--lines <n>]`: where a background task is, without waiting on it:
// its command, whether it is still running, how long it has run, and the last lines of its log. A
// long job (a species fit, a perf run) prints its own progress and remaining work into that log, so
// this is how a lane reads it between the start and the await.
import { statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { readCommand, readExit, readOutput, readRunner, taskDir, TASK_ID } from "./bg-tasks";
import { pidIsAlive } from "./land";

const root = fileURLToPath(new URL("..", import.meta.url));

export const EXIT_RUNNING = 0;
export const EXIT_NO_TASK = 4;
export const EXIT_LOST = 5;

export interface TaskStatus {
  id: string;
  command: string;
  /** `running`, `exited` with its code, or `lost`: the runner is gone and left no code. */
  state: "running" | "exited" | "lost";
  code: number | null;
  startedAt: Date;
  /** Until the exit was written, or until now while it runs. */
  elapsedMs: number;
  /** The log's last `lines` non-empty lines. */
  tail: string[];
}

/** The last `lines` non-empty lines of `text`. */
export function tailLines(text: string, lines: number): string[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(-Math.max(0, lines));
}

export function taskStatus(dir: string, id: string, lines: number, alive: (pid: number) => boolean = pidIsAlive, now: number = Date.now()): TaskStatus {
  const startedAt = statSync(join(dir, "cmd.txt")).mtime;
  const code = readExit(dir);
  const runner = readRunner(dir);
  const state: TaskStatus["state"] = code !== null ? "exited" : runner !== null && !alive(runner) ? "lost" : "running";
  const endedAt = code === null ? now : statSync(join(dir, "exit")).mtime.getTime();
  return { id, command: readCommand(dir), state, code, startedAt, elapsedMs: Math.max(0, endedAt - startedAt.getTime()), tail: tailLines(readOutput(dir), lines) };
}

export function formatStatus(status: TaskStatus, logPath: string): string {
  const minutes = Math.floor(status.elapsedMs / 60_000);
  const seconds = Math.round((status.elapsedMs % 60_000) / 1000);
  const elapsed = minutes > 0 ? `${minutes}m${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
  const state = status.state === "running" ? `running for ${elapsed}` : status.state === "exited" ? `exited ${status.code} after ${elapsed}` : `lost after ${elapsed}: the runner is gone and left no exit code`;
  const lines = [`background status: ${status.id} ${state}`, `  command: ${status.command}`, `  started: ${status.startedAt.toISOString()}`, `  log: ${logPath}`];
  if (status.tail.length > 0) {
    lines.push(`  last ${status.tail.length} line(s):`);
    for (const line of status.tail) lines.push(`    ${line}`);
  } else lines.push("  the log is empty so far");
  if (status.state === "running") lines.push(`  wait for it: bun run background await ${status.id}`);
  return lines.join("\n");
}

/** `<id>` and `--lines <n>` (default 15). */
export function parseStatusArgs(argv: readonly string[]): { id: string; lines: number } {
  const rest = argv[0] === "--" ? argv.slice(1) : argv;
  let id: string | null = null;
  let lines = 15;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? "";
    if (arg === "--lines") {
      const raw = rest[(i += 1)];
      lines = Number(raw);
      if (raw === undefined || !Number.isInteger(lines) || lines < 0) throw new Error("--lines needs a whole number");
    } else if (arg.startsWith("--")) throw new Error(`unknown argument ${arg}`);
    else if (id === null) id = arg;
    else throw new Error(`unexpected argument ${arg}`);
  }
  if (id === null) throw new Error("usage: bun run background status <id> [--lines <n>]");
  return { id, lines };
}

function main(argv: readonly string[]): number {
  let args: ReturnType<typeof parseStatusArgs>;
  try {
    args = parseStatusArgs(argv);
  } catch (error) {
    console.error(`background status: ${(error as Error).message}`);
    return EXIT_NO_TASK;
  }
  if (!TASK_ID.test(args.id)) {
    console.error(`background status: "${args.id}" is not a task id`);
    return EXIT_NO_TASK;
  }
  const dir = taskDir(root, args.id);
  let status: TaskStatus;
  try {
    status = taskStatus(dir, args.id, args.lines);
  } catch {
    console.error(`background status: no task ${args.id} in ${root}`);
    return EXIT_NO_TASK;
  }
  console.log(formatStatus(status, join(dir, "out.log")));
  return status.state === "exited" ? (status.code ?? 1) : status.state === "lost" ? EXIT_LOST : EXIT_RUNNING;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
