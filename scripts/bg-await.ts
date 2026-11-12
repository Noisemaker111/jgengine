// `bun run background await <id>`: block until the task `background start` started exits, then print its whole output
// and its exit code.
//
// The harness's own background execution is the first choice where it exists (an OpenCode shell call
// with `background: true` returns at once and reports completion itself); this is the fallback for a
// shell that has none. The wait is an event: fs.watch reports the exit file the moment the runner
// writes it, so this returns immediately after the command exits rather than on some interval. An
// event is not a guarantee: under a loaded verify:fast run the waiter once never heard the rename
// and sat on the heartbeat until its 30 s test bound (#3118). So a cheap check of the exit file
// every EXIT_CHECK_MS backs the event, and a folder with no watch at all says `degraded:`. A slow
// heartbeat only asks whether the runner is still alive, and answers a task whose runner died
// without leaving a code instead of hanging forever.
import { existsSync, rmSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { AWAITER, readCommand, readExit, readOutput, readRunner, readText, taskDir, TASK_ID } from "./bg-tasks";
import { pidIsAlive } from "./land";

const root = fileURLToPath(new URL("..", import.meta.url));

export const EXIT_NO_TASK = 4;
export const EXIT_LOST = 5;
export const EXIT_TIMEOUT = 6;

/** How often a waiting `background await` asks whether the runner is still alive; the exit itself is an event. */
export const BEAT_MS = 2_000;

/**
 * How often the wait reads the exit file whether or not the folder watch spoke: the bound on how
 * late a lost watch event can make it. Reading one small file four times a second costs nothing.
 */
export const EXIT_CHECK_MS = 250;

/** The part of a folder watch the wait uses. */
export interface FolderWatch {
  close(): void;
}

/** Watch `dir`, calling `onChange` on any event and `onError` if the watch fails later; throws if it cannot start. */
export type WatchFolder = (dir: string, onChange: () => void, onError: (error: unknown) => void) => FolderWatch;

const watchFolder: WatchFolder = (dir, onChange, onError) => {
  const watcher = watch(dir, () => onChange());
  watcher.on("error", onError);
  return watcher;
};

export interface AwaitOptions {
  id: string;
  checkout?: string;
  write: (text: string) => void;
  err: (text: string) => void;
  alive?: (pid: number) => boolean;
  /** Replaces the folder watch; the test drives the wait without a real child. */
  untilExit?: (dir: string, id: string) => Promise<WaitResult>;
  timeoutMs?: number;
  /** How often the wait asks whether the runner lives; {@link BEAT_MS} by default. */
  beatMs?: number;
  /** How often the wait reads the exit file behind the watch; {@link EXIT_CHECK_MS} by default. */
  exitCheckMs?: number;
  /** Replaces fs.watch on the task folder; the test passes one that fails or never speaks. */
  watchFolder?: WatchFolder;
  /** The pid written as the task's awaiter; this process by default. */
  pid?: number;
}

/** The task's exit code, or why there is none: its runner died, or the wait ran out first. */
type WaitResult = number | "lost" | "timeout";

/** Print the task's output and return its exit code, once it has one. */
export function awaitTask(options: AwaitOptions): Promise<number> {
  const { id, err } = options;
  const checkout = options.checkout ?? root;
  if (!TASK_ID.test(id)) {
    err(`background await: "${id}" is not a task id`);
    return Promise.resolve(EXIT_NO_TASK);
  }
  const dir = taskDir(checkout, id);
  if (!existsSync(dir)) {
    err(`background await: no task ${id} in ${checkout}. A task lives until someone deletes ${dir}`);
    return Promise.resolve(EXIT_NO_TASK);
  }
  const untilExit =
    options.untilExit ??
    ((target: string) =>
      waitForExit(target, id, {
        alive: options.alive ?? pidIsAlive,
        err,
        timeoutMs: options.timeoutMs,
        beatMs: options.beatMs ?? BEAT_MS,
        exitCheckMs: options.exitCheckMs ?? EXIT_CHECK_MS,
        watchFolder: options.watchFolder ?? watchFolder,
      }));
  return (async () => {
    let code: WaitResult | null = readExit(dir);
    if (code === null) {
      const command = readCommand(dir);
      err(`background await: waiting for ${id}${command.length > 0 ? ` (${command})` : ""}`);
      // While this waits, the task has an awaiter: a turn that ends with the harness running this
      // await in its background is waiting correctly, and the Stop hooks let it end.
      const awaiter = join(dir, AWAITER);
      const pid = String(options.pid ?? process.pid);
      try {
        writeFileSync(awaiter, `${pid}\n`);
      } catch {
        // No marker only means a Stop hook nudges once; the wait itself is unaffected.
      }
      try {
        code = await untilExit(dir, id);
      } finally {
        if (readText(awaiter)?.trim() === pid) rmSync(awaiter, { force: true });
      }
    }
    const text = readOutput(dir);
    if (text.length > 0) options.write(text.endsWith("\n") ? text : `${text}\n`);
    // A wait that ran out is not a lost task: the runner is still working, and awaiting again picks it up.
    if (code === "timeout") {
      err(`background await: ${id} is still running; run \`bun run background await ${id}\` again to keep waiting`);
      return EXIT_TIMEOUT;
    }
    if (code === "lost") {
      err(`background await: ${id} never reported an exit code`);
      return EXIT_LOST;
    }
    options.write(`background await: ${id} exited ${code}\n`);
    return code;
  })();
}

interface WaitOptions {
  alive: (pid: number) => boolean;
  err: (text: string) => void;
  timeoutMs: number | undefined;
  beatMs: number;
  exitCheckMs: number;
  watchFolder: WatchFolder;
}

function waitForExit(dir: string, id: string, options: WaitOptions): Promise<WaitResult> {
  const { alive, err, timeoutMs, beatMs, exitCheckMs } = options;
  return new Promise((resolve) => {
    let settled = false;
    let watcher: FolderWatch | null = null;
    let beat: ReturnType<typeof setInterval> | null = null;
    let backstop: ReturnType<typeof setInterval> | null = null;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    const finish = (code: WaitResult): void => {
      if (settled) return;
      settled = true;
      watcher?.close();
      if (beat !== null) clearInterval(beat);
      if (backstop !== null) clearInterval(backstop);
      if (deadline !== null) clearTimeout(deadline);
      resolve(code);
    };
    const check = (): void => {
      const code = readExit(dir);
      if (code !== null) finish(code);
    };
    const degraded = (why: unknown): void => {
      if (settled) return;
      err(`degraded: background await has no watch on ${dir} (${why instanceof Error ? why.message : String(why)}); it reads the exit file every ${exitCheckMs} ms instead`);
      watcher?.close();
      watcher = null;
      check();
    };
    // The watch is armed before the first read, so an exit written between the two still wakes it.
    try {
      watcher = options.watchFolder(dir, check, degraded);
    } catch (error) {
      degraded(error);
    }
    check();
    if (settled) return;
    backstop = setInterval(check, exitCheckMs);
    beat = setInterval(() => {
      check();
      if (settled) return;
      const runner = readRunner(dir);
      if (runner !== null && !alive(runner)) {
        err(`background await: the runner for ${id} is gone and left no exit code`);
        finish("lost");
      }
    }, beatMs);
    if (timeoutMs !== undefined) {
      deadline = setTimeout(() => {
        err(`background await: ${id} was still running after ${Math.round(timeoutMs / 1000)}s; it keeps running`);
        finish("timeout");
      }, timeoutMs);
    }
  });
}

/** `<id>` and `--timeout <seconds>`. */
export function parseAwaitArgs(argv: readonly string[]): { id: string; timeoutMs?: number | undefined } {
  const rest = argv[0] === "--" ? argv.slice(1) : argv;
  let id: string | null = null;
  let timeoutMs: number | undefined;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]!;
    if (arg === "--timeout") {
      const raw = rest[(i += 1)];
      const seconds = Number(raw);
      if (raw === undefined || !Number.isFinite(seconds) || seconds <= 0) throw new Error("--timeout needs seconds");
      timeoutMs = seconds * 1000;
    } else if (arg.startsWith("--")) throw new Error(`unknown argument ${arg}`);
    else if (id === null) id = arg;
    else throw new Error(`unexpected argument ${arg}`);
  }
  if (id === null) throw new Error("usage: bun run background await <id> [--timeout <seconds>]");
  return { id, timeoutMs };
}

async function main(argv: readonly string[]): Promise<void> {
  let args: ReturnType<typeof parseAwaitArgs>;
  try {
    args = parseAwaitArgs(argv);
  } catch (error) {
    console.error(`background await: ${(error as Error).message}`);
    process.exit(EXIT_NO_TASK);
  }
  const code = await awaitTask({
    id: args.id,
    write: (text) => process.stdout.write(text),
    err: (line) => console.error(line),
    ...(args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs }),
  });
  process.exit(code);
}

if (import.meta.main) void main(process.argv.slice(2));
