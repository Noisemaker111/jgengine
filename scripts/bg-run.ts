// A long command does not need a lane that sits and watches it. Start the command, get an id back
// at once, and read the answer when it exists:
//
//   bun run bg:run -- bun run verify:full     # prints the id and returns in milliseconds
//   bun run bg:await <id>                     # blocks until it exits, then prints its output and code
//
// The harness's own background execution is the first choice where it exists (an OpenCode shell
// call with `background: true` returns at once and reports completion itself). `bg:run`/`bg:await`
// is the fallback for a shell that has none, and for work that must outlive the call that started
// it. Neither is a wait: `bg:await` returns the moment the exit file appears, and there is no
// interval to guess.
//
// `bg:run` starts a supervisor detached from this process; the supervisor runs the command, writes
// its output to `.scratch/bg/<id>/out.log` and its exit code to `exit`, then exits itself.
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { newTaskId, taskDir, TASK_ID, tasksRoot } from "./bg-tasks";

const root = fileURLToPath(new URL("..", import.meta.url));
const self = fileURLToPath(import.meta.url);

export interface StartOptions {
  command: string;
  /** The checkout whose `.scratch/bg/` holds the task. */
  checkout?: string;
  id?: string;
  /** How the detached supervisor is started; the test passes a fake to read its argv. */
  spawnDetached?: (file: string, args: string[], cwd: string) => void;
  log?: (line: string) => void;
}

/** Start `command` in the background and return its id without waiting for it. */
export function startTask(options: StartOptions): string {
  const checkout = options.checkout ?? root;
  const id = options.id ?? newTaskId();
  if (!TASK_ID.test(id)) throw new Error(`not a task id: ${id}`);
  const dir = taskDir(checkout, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "cmd.txt"), `${options.command.trim()}\n`);
  const spawnDetached =
    options.spawnDetached ??
    ((file: string, args: string[], cwd: string) => {
      const child = spawn(file, args, { cwd, detached: true, stdio: "ignore", windowsHide: true });
      child.unref();
    });
  spawnDetached(process.execPath, [self, "--supervise", dir, "--", options.command.trim()], checkout);
  (options.log ?? (() => {}))(id);
  return id;
}

/** The detached side: run the command, keep its output and its exit code, and outlive the caller. */
export function supervise(dir: string, command: string): void {
  const fd = openSync(join(dir, "out.log"), "a");
  writeFileSync(join(dir, "runner"), `${process.pid}\n`);
  const [file, args] =
    process.platform === "win32" ? ["cmd.exe", ["/d", "/s", "/c", command]] : ["bash", ["-lc", command]];
  const child = spawn(file, args, { cwd: root, stdio: ["ignore", fd, fd], windowsHide: true });
  const finish = (code: number, note?: string): void => {
    if (note !== undefined) writeFileSync(join(dir, "out.log"), `${note}\n`, { flag: "a" });
    writeFileSync(join(dir, "exit"), `${code}\n`);
    try {
      closeSync(fd);
    } catch {
      // the descriptor is already closed when the command inherited it and closed it
    }
    process.exit(0);
  };
  child.on("error", (error) => finish(127, `bg:run: could not start the command: ${String(error)}`));
  child.on("exit", (code) => finish(code ?? 1));
}

/** The command `bun run bg:run -- <cmd>` was given, with bun's separator removed. */
export function commandFrom(argv: readonly string[]): string {
  const words = argv[0] === "--" ? argv.slice(1) : argv;
  return words.join(" ").trim();
}

function main(argv: readonly string[]): void {
  if (argv[0] === "--supervise") {
    const dir = argv[1];
    const rest = argv.slice(argv.indexOf("--") + 1);
    if (dir === undefined || rest.length === 0) {
      console.error("bg:run: --supervise needs a task directory and a command");
      process.exit(2);
    }
    supervise(dir, rest.join(" "));
    return;
  }
  const command = commandFrom(argv);
  if (command.length === 0) {
    console.error("bg:run: nothing to run. Usage: bun run bg:run -- <command>");
    process.exit(2);
  }
  try {
    const id = startTask({ command });
    console.log(id);
    console.error(`bg:await ${id}   (or: bun run bg:await ${id})`);
    console.error(`output: ${join(root, tasksRoot(root), id, "out.log")}`);
  } catch (error) {
    console.error(`bg:run: ${(error as Error).message}`);
    process.exit(2);
  }
}

if (import.meta.main) main(process.argv.slice(2));
