// State for `bun run bg:run` / `bun run bg:await`: one folder per task under `.scratch/bg/`, which
// is ignored, so a background task never shows up in `git status`.
//
//   <id>/cmd.txt    the command, as it was handed over
//   <id>/out.log    its stdout and stderr, together
//   <id>/runner     the pid of the process running it
//   <id>/exit       written once, on exit, with the exit code
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const BG_DIR = join(".scratch", "bg");

/** A task id is a folder name and nothing else: no separators, no dots, no traversal. */
export const TASK_ID = /^[a-z0-9][a-z0-9-]{5,40}$/;

export function tasksRoot(checkout: string): string {
  return join(checkout, BG_DIR);
}

export function taskDir(checkout: string, id: string): string {
  return join(tasksRoot(checkout), id);
}

/** `20261023-204501-k3f`: sortable by start time, unique enough for one machine's lanes. */
export function newTaskId(now: number = Date.now(), random: () => number = Math.random): string {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "").replace("T", "-").toLowerCase();
  const tail = Math.floor(random() * 36 ** 3)
    .toString(36)
    .padStart(3, "0");
  return `${stamp}-${tail}`;
}

export function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** The task's exit code once it has one, else null. */
export function readExit(dir: string): number | null {
  if (!existsSync(join(dir, "exit"))) return null;
  const text = readText(join(dir, "exit"));
  const code = Number((text ?? "").trim());
  return Number.isInteger(code) ? code : null;
}

export function readOutput(dir: string): string {
  return readText(join(dir, "out.log")) ?? "";
}

export function readCommand(dir: string): string {
  return (readText(join(dir, "cmd.txt")) ?? "").trim();
}

/** The pid of the runner watching the command, once it has recorded one. */
export function readRunner(dir: string): number | null {
  const pid = Number((readText(join(dir, "runner")) ?? "").trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}
