import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { awaitTask, parseAwaitArgs, EXIT_LOST, EXIT_NO_TASK } from "./bg-await";
import { commandFrom, startTask } from "./bg-run";
import { newTaskId, readCommand, readExit, readOutput, readRunner, taskDir, TASK_ID } from "./bg-tasks";

const root = join(import.meta.dir, "..");
const made = new Set<string>();
function checkout(): string {
  const dir = join(root, ".scratch", `bg-test-${crypto.randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  made.add(dir);
  return dir;
}
afterEach(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
  made.clear();
});

test("a task id is a folder name: sortable by start, and never a path", () => {
  const early = newTaskId(Date.parse("2026-10-23T20:45:01.000Z"), () => 0.5);
  const late = newTaskId(Date.parse("2026-10-23T20:45:02.000Z"), () => 0.5);
  expect(early).toMatch(TASK_ID);
  expect(early < late).toBe(true);
  expect(TASK_ID.test("../etc")).toBe(false);
  expect(TASK_ID.test("a/b")).toBe(false);
});

test("starting a task returns an id at once and hands the supervisor a detached argv", () => {
  const dir = checkout();
  const spawned: string[][] = [];
  const id = startTask({
    command: "bun run verify:full",
    checkout: dir,
    id: "20261023-204501-abc",
    spawnDetached: (file, args) => spawned.push([file, ...args]),
  });

  expect(id).toBe("20261023-204501-abc");
  expect(spawned.length).toBe(1);
  expect(spawned[0]!.join(" ")).toContain("--supervise");
  expect(spawned[0]!.slice(-1)[0]).toBe("bun run verify:full");
  expect(readCommand(taskDir(dir, id))).toBe("bun run verify:full");
  expect(existsSync(join(taskDir(dir, id), "out.log"))).toBe(false);
});

test("bun's argument separator is not part of the command", () => {
  expect(commandFrom(["--", "bun", "run", "verify:full"])).toBe("bun run verify:full");
  expect(commandFrom(["bun", "run", "verify:full"])).toBe("bun run verify:full");
  expect(commandFrom(["--"])).toBe("");
});

test("a finished task answers with its whole output and its exit code", async () => {
  const dir = checkout();
  const task = taskDir(dir, "20261023-204501-abc");
  mkdirSync(task, { recursive: true });
  writeFileSync(join(task, "cmd.txt"), "echo done\n");
  writeFileSync(join(task, "out.log"), "done\nwith two lines\n");
  writeFileSync(join(task, "exit"), "7\n");

  let printed = "";
  const errors: string[] = [];
  const code = await awaitTask({
    id: "20261023-204501-abc",
    checkout: dir,
    write: (text) => (printed += text),
    err: (line) => errors.push(line),
  });

  expect(code).toBe(7);
  expect(printed).toContain("done\nwith two lines\n");
  expect(printed).toContain("exited 7");
  expect(errors).toEqual([]);
});

test("awaiting hands the task directory to the wait, and reports the code it settles on", async () => {
  const dir = checkout();
  const task = taskDir(dir, "20261023-204501-abc");
  mkdirSync(task, { recursive: true });
  writeFileSync(join(task, "cmd.txt"), "bun run verify:full\n");
  writeFileSync(join(task, "out.log"), "");

  const asked: string[] = [];
  const code = await awaitTask({
    id: "20261023-204501-abc",
    checkout: dir,
    write: () => {},
    err: () => {},
    untilExit: async (target, id) => {
      asked.push(`${target}|${id}`);
      return 0;
    },
  });

  expect(asked).toEqual([`${task}|20261023-204501-abc`]);
  expect(code).toBe(0);
});

test("an unknown id, or one that is not an id, is refused instead of waited for", async () => {
  const dir = checkout();
  const errors: string[] = [];
  const write = () => {};
  const err = (line: string) => errors.push(line);

  expect(await awaitTask({ id: "../escape", checkout: dir, write, err })).toBe(EXIT_NO_TASK);
  expect(await awaitTask({ id: "20261023-204501-abc", checkout: dir, write, err })).toBe(EXIT_NO_TASK);
  expect(errors.length).toBe(2);
});

test("a lost runner is answered, not waited for forever", async () => {
  const dir = checkout();
  const task = taskDir(dir, "20261023-204501-abc");
  mkdirSync(task, { recursive: true });
  writeFileSync(join(task, "cmd.txt"), "bun run verify:full\n");
  writeFileSync(join(task, "out.log"), "started\n");
  writeFileSync(join(task, "runner"), "999999\n");

  const errors: string[] = [];
  let printed = "";
  const code = await awaitTask({
    id: "20261023-204501-abc",
    checkout: dir,
    alive: () => false,
    write: (text) => (printed += text),
    err: (line) => errors.push(line),
  });

  expect(code).toBe(EXIT_LOST);
  expect(errors.join("\n")).toContain("left no exit code");
  expect(printed).toContain("started");
});

test("the wait is the exit event: it returns as soon as the task exits, not on the heartbeat", async () => {
  const dir = checkout();
  const id = startTask({ command: "ping -n 2 127.0.0.1 >nul & exit 3", checkout: dir });

  let printed = "";
  const code = await awaitTask({ id, checkout: dir, write: (text) => (printed += text), err: () => {} });
  const exitedAt = statSync(join(taskDir(dir, id), "exit")).mtimeMs;
  const late = Date.now() - exitedAt;

  expect(code).toBe(3);
  expect(readExit(taskDir(dir, id))).toBe(3);
  expect(readRunner(taskDir(dir, id))).not.toBeNull();
  expect(printed).toContain("exited 3");
  expect(late).toBeLessThan(800);
});

test("the documented commands run a real command in the background and report it", () => {
  const started = Bun.spawnSync({
    cmd: [process.execPath, "run", "bg:run", "--", "echo bg-cli-one & exit 4"],
    cwd: root,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  });
  const id = started.stdout.toString().split("\n")[0]?.trim() ?? "";
  expect(TASK_ID.test(id)).toBe(true);
  made.add(taskDir(root, id));

  const awaited = Bun.spawnSync({
    cmd: [process.execPath, "run", "bg:await", id],
    cwd: root,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = awaited.stdout.toString();

  expect(text).toContain("bg-cli-one");
  expect(text).toContain(`bg:await: ${id} exited 4`);
  expect(awaited.exitCode).toBe(4);
  expect(readOutput(taskDir(root, id))).toContain("bg-cli-one");
});

test("the await arguments are an id and an optional timeout", () => {
  expect(parseAwaitArgs(["20261023-204501-abc"])).toEqual({ id: "20261023-204501-abc" });
  expect(parseAwaitArgs(["--", "20261023-204501-abc", "--timeout", "90"])).toEqual({
    id: "20261023-204501-abc",
    timeoutMs: 90_000,
  });
  expect(() => parseAwaitArgs([])).toThrow("usage");
  expect(() => parseAwaitArgs(["a", "--timeout", "0"])).toThrow("--timeout needs seconds");
  expect(() => parseAwaitArgs(["a", "--guess"])).toThrow("unknown argument");
});
