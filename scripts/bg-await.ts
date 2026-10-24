// `bun run bg:await <id>`: block until the task `bg:run` started exits, then print its whole output
// and its exit code.
//
// The harness's own background execution is the first choice where it exists (an OpenCode shell call
// with `background: true` returns at once and reports completion itself); this is the fallback for a
// shell that has none. The wait is an event: fs.watch reports the exit file the moment the runner
// writes it, so this returns immediately after the command exits rather than on some interval. A
// slow heartbeat only asks whether the runner is still alive, and answers a task whose runner died
// without leaving a code instead of hanging forever.
import { watch, type FSWatcher } from "node:fs";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readCommand, readExit, readOutput, readRunner, taskDir, TASK_ID } from "./bg-tasks";
import { pidIsAlive } from "./land";

const root = fileURLToPath(new URL("..", import.meta.url));

export const EXIT_NO_TASK = 4;
export const EXIT_LOST = 5;
export const EXIT_TIMEOUT = 6;

/** How often a waiting `bg:await` asks whether the runner is still alive; the exit itself is an event. */
export const BEAT_MS = 2_000;

export interface AwaitOptions {
  id: string;
  checkout?: string;
  write: (text: string) => void;
  err: (text: string) => void;
  alive?: (pid: number) => boolean;
  /** Replaces the folder watch; the test drives the wait without a real child. */
  untilExit?: (dir: string, id: string) => Promise<number | null>;
  timeoutMs?: number;
}

/** Print the task's output and return its exit code, once it has one. */
export function awaitTask(options: AwaitOptions): Promise<number> {
  const { id, err } = options;
  const checkout = options.checkout ?? root;
  if (!TASK_ID.test(id)) {
    err(`bg:await: "${id}" is not a task id`);
    return Promise.resolve(EXIT_NO_TASK);
  }
  const dir = taskDir(checkout, id);
  if (!existsSync(dir)) {
    err(`bg:await: no task ${id} in ${checkout}. A task lives until someone deletes ${dir}`);
    return Promise.resolve(EXIT_NO_TASK);
  }
  const untilExit =
    options.untilExit ??
    ((target: string) => waitForExit(target, id, options.alive ?? pidIsAlive, err, options.timeoutMs));
  return (async () => {
    let code = readExit(dir);
    if (code === null) {
      const command = readCommand(dir);
      err(`bg:await: waiting for ${id}${command.length > 0 ? ` (${command})` : ""}`);
      code = await untilExit(dir, id);
    }
    const text = readOutput(dir);
    if (text.length > 0) options.write(text.endsWith("\n") ? text : `${text}\n`);
    if (code === null) {
      err(`bg:await: ${id} never reported an exit code`);
      return EXIT_LOST;
    }
    options.write(`bg:await: ${id} exited ${code}\n`);
    return code;
  })();
}

function waitForExit(
  dir: string,
  id: string,
  alive: (pid: number) => boolean,
  err: (text: string) => void,
  timeoutMs?: number,
): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false;
    let watcher: FSWatcher | null = null;
    let beat: ReturnType<typeof setInterval> | null = null;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      watcher?.close();
      if (beat !== null) clearInterval(beat);
      if (deadline !== null) clearTimeout(deadline);
      resolve(code);
    };
    const check = (): void => {
      const code = readExit(dir);
      if (code !== null) finish(code);
    };
    try {
      watcher = watch(dir, () => check());
      watcher.on("error", () => check());
    } catch {
      watcher = null;
    }
    check();
    beat = setInterval(() => {
      if (readExit(dir) !== null) {
        check();
        return;
      }
      const runner = readRunner(dir);
      if (runner !== null && !alive(runner)) {
        err(`bg:await: the runner for ${id} is gone and left no exit code`);
        finish(null);
      }
    }, BEAT_MS);
    if (timeoutMs !== undefined) {
      deadline = setTimeout(() => {
        err(`bg:await: ${id} was still running after ${Math.round(timeoutMs / 1000)}s; it keeps running`);
        finish(null);
      }, timeoutMs);
    }
  });
}

/** `<id>` and `--timeout <seconds>`. */
export function parseAwaitArgs(argv: readonly string[]): { id: string; timeoutMs?: number } {
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
  if (id === null) throw new Error("usage: bun run bg:await <id> [--timeout <seconds>]");
  return { id, timeoutMs };
}

async function main(argv: readonly string[]): Promise<void> {
  let args: { id: string; timeoutMs?: number };
  try {
    args = parseAwaitArgs(argv);
  } catch (error) {
    console.error(`bg:await: ${(error as Error).message}`);
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
