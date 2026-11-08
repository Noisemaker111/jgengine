// A long command does not need a lane that sits and watches it. Start the command, get an id back
// at once, and read the answer when it exists:
//
//   bun run background start bun run verify:fast --full     # prints the id and returns in milliseconds
//   bun run background await <id>                     # blocks until it exits, then prints its output and code
//
// The harness's own background execution is the first choice where it exists (an OpenCode shell
// call with `background: true` returns at once and reports completion itself). `background start`/`background await`
// is the fallback for a shell that has none, and for work that must outlive the call that started
// it. Neither is a wait: `background await` returns the moment the exit file appears, and there is no
// interval to guess.
//
// `background start` starts a supervisor detached from this process; the supervisor runs the command, writes
// its output to `.scratch/bg/<id>/out.log` and its exit code to `exit`, then exits itself.
//
// On Windows a detached child is still in its caller's process tree and job, and whatever ends the
// caller's tree ends it too: `lane:close`'s land-queue runner died that way with an empty log, at
// random, when the `bun run` that started it exited (2026-11-03). So on Windows the supervisor is
// created by the WMI service instead (scripts/outsideCaller.ts): it has no parent here and no job to share.
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { newTaskId, taskDir, TASK_ID, tasksRoot } from "./bg-tasks";
import { startOutsideCaller } from "./outsideCaller";

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
  const spawnDetached = options.spawnDetached ?? ((file, args, cwd) => void startOutsideCaller(file, args, { cwd }));
  // The command is read from cmd.txt, so no shell or WMI quoting ever touches it.
  spawnDetached(process.execPath, [self, "--supervise", dir], checkout);
  (options.log ?? (() => {}))(id);
  return id;
}

/** The detached side: run the command, keep its output and its exit code, and outlive the caller. */
export function supervise(dir: string): void {
  // Opened for writing, not append-only: MSYS programs (Git Bash, its grep and echo) write nothing,
  // not even their errors, to a handle opened with append access alone, so a bash job's log came
  // back empty. Nothing writes the log before this point.
  const fd = openSync(join(dir, "out.log"), "w");
  writeFileSync(join(dir, "runner"), `${process.pid}\n`);
  const command = readFileSync(join(dir, "cmd.txt"), "utf8").trim();
  const [file, args] =
    // `chcp 65001` makes the console code page UTF-8, so a tool that encodes for the console
    // (git, cmd builtins) writes the same UTF-8 bytes into the log that bun does.
    // The line goes to cmd verbatim: escaped for a C program instead (\"), quotes inside the
    // command reached it broken and `bun -e "..."` failed. `/s` drops just the outer pair.
    process.platform === "win32" ? ["cmd.exe", ["/d", "/s", "/c", `"chcp 65001 >nul & ${command}"`]] : ["bash", ["-lc", command]];
  const child = spawn(file, args, {
    windowsVerbatimArguments: process.platform === "win32",
    cwd: root,
    stdio: ["ignore", fd, fd],
    windowsHide: true,
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
  });
  const finish = (code: number, note?: string): void => {
    if (note !== undefined) writeFileSync(join(dir, "out.log"), `${note}\n`, { flag: "a" });
    // Renamed into place, so a waiter woken by the file's creation never reads it half written.
    writeFileSync(join(dir, "exit.tmp"), `${code}\n`);
    renameSync(join(dir, "exit.tmp"), join(dir, "exit"));
    try {
      closeSync(fd);
    } catch {
      // the descriptor is already closed when the command inherited it and closed it
    }
    process.exit(0);
  };
  child.on("error", (error) => finish(127, `background start: could not start the command: ${String(error)}`));
  child.on("exit", (code) => finish(code ?? 1));
}

/**
 * One argument as the shell that runs the stored line reads it back: cmd.exe on Windows, bash
 * elsewhere. Joined bare, `-m "two words"` came back as `-m two words` and lane:close refused it.
 */
export function shellWord(word: string, platform: NodeJS.Platform = process.platform): string {
  if (/^[\w@%+=:,./\-]+$/.test(word)) return word;
  if (platform === "win32") return `"${word.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`;
  return `'${word.replaceAll("'", "'\\''")}'`;
}

/**
 * The command `bun run background start <cmd>` was given, with bun's separator removed. Separate
 * words are quoted where they need it; a single argument is a whole command line, kept as written.
 */
export function commandFrom(argv: readonly string[], platform: NodeJS.Platform = process.platform): string {
  const words = argv[0] === "--" ? argv.slice(1) : argv;
  if (words.length === 1) return (words[0] ?? "").trim();
  return words.map((word) => shellWord(word, platform)).join(" ").trim();
}

function main(argv: readonly string[]): void {
  if (argv[0] === "--supervise") {
    const dir = argv[1];
    if (dir === undefined) {
      console.error("background start: --supervise needs a task directory");
      process.exit(2);
    }
    supervise(dir);
    return;
  }
  const command = commandFrom(argv);
  if (command.length === 0) {
    console.error("background start: nothing to run. Usage: bun run background start <command>");
    process.exit(2);
  }
  try {
    const id = startTask({ command });
    console.log(id);
    console.error(`bun run background await ${id}`);
    console.error(`output: ${join(tasksRoot(root), id, "out.log")}`);
    console.error(`progress: bun run background status ${id}`);
  } catch (error) {
    console.error(`background start: ${(error as Error).message}`);
    process.exit(2);
  }
}

if (import.meta.main) main(process.argv.slice(2));
