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
// created by the WMI service instead (startOutsideCaller): it has no parent here and no job to share.
// It then has WMI's environment, not ours, so it reads ours from the task folder.
import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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
  if (process.platform === "win32") writeFileSync(join(dir, ENV_FILE), JSON.stringify(process.env));
  const spawnDetached = options.spawnDetached ?? (process.platform === "win32" ? startOutsideCaller : startDetached);
  // The command is read from cmd.txt, so no shell or WMI quoting ever touches it.
  spawnDetached(process.execPath, [self, "--supervise", dir], checkout);
  (options.log ?? (() => {}))(id);
  return id;
}

/** The caller's environment, for a supervisor WMI started with its own; removed once read. */
const ENV_FILE = "env.json";

function startDetached(file: string, args: string[], cwd: string): void {
  spawn(file, args, { cwd, detached: true, stdio: "ignore", windowsHide: true }).unref();
}

/** Windows: have the WMI service create the process, outside this process's tree and job. */
function startOutsideCaller(file: string, args: string[], cwd: string): void {
  const line = [file, ...args].map((word) => (word.startsWith("--") ? word : `"${word}"`)).join(" ");
  const ps =
    "$s = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0}; " +
    "$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$env:BG_LINE; CurrentDirectory=$env:BG_CWD; ProcessStartupInformation=$s}; " +
    "exit $r.ReturnValue";
  const run = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    encoding: "utf8",
    env: { ...process.env, BG_LINE: line, BG_CWD: cwd },
    windowsHide: true,
  });
  if (run.status !== 0) {
    throw new Error(`could not start the runner through WMI (Win32_Process.Create returned ${run.status ?? run.error}): ${run.stderr.trim()}`);
  }
}

/** The detached side: run the command, keep its output and its exit code, and outlive the caller. */
export function supervise(dir: string): void {
  const fd = openSync(join(dir, "out.log"), "a");
  writeFileSync(join(dir, "runner"), `${process.pid}\n`);
  const command = readFileSync(join(dir, "cmd.txt"), "utf8").trim();
  const envPath = join(dir, ENV_FILE);
  let env: NodeJS.ProcessEnv = process.env;
  try {
    env = JSON.parse(readFileSync(envPath, "utf8")) as NodeJS.ProcessEnv;
    rmSync(envPath, { force: true });
  } catch {
    // started directly (not through WMI): this process already has the caller's environment
  }
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
    env: { ...env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
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

/** The command `bun run background start <cmd>` was given, with bun's separator removed. */
export function commandFrom(argv: readonly string[]): string {
  const words = argv[0] === "--" ? argv.slice(1) : argv;
  return words.join(" ").trim();
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
