import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { removeDirSync } from "./removeDir";

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
/** The task folders under `dir`: `dir` itself when it is one, else its checkout's `.scratch/bg/<id>`. */
function taskFolders(dir: string): string[] {
  if (existsSync(join(dir, "runner"))) return [dir];
  const bg = join(dir, ".scratch", "bg");
  return existsSync(bg) ? readdirSync(bg).map((id) => join(bg, id)) : [];
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// The runner writes `exit` and then exits, holding `out.log` until it is gone; on Windows removing
// the folder before then fails with EBUSY. So cleanup waits for each runner process to end.
afterEach(async () => {
  for (const dir of made) {
    for (const folder of taskFolders(dir)) {
      const pid = readRunner(folder);
      // Waits on the runner process ending (the event), bounded so a stuck runner cannot hang the suite
      for (let turn = 0; pid !== null && alive(pid) && turn < 600; turn += 1) await Bun.sleep(50);
    }
    removeDirSync(dir);
  }
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

test("starting a task returns an id at once and hands the supervisor only its task folder", () => {
  const dir = checkout();
  const spawned: string[][] = [];
  const id = startTask({
    command: `bun run verify:fast --full & echo "a & b"`,
    checkout: dir,
    id: "20261023-204501-abc",
    spawnDetached: (file, args) => spawned.push([file, ...args]),
  });

  expect(id).toBe("20261023-204501-abc");
  expect(spawned.length).toBe(1);
  // The command travels in cmd.txt, never through a command line WMI or a shell would re-split.
  expect(spawned[0]!.slice(1)).toEqual([join(import.meta.dir, "bg-run.ts"), "--supervise", taskDir(dir, id)]);
  expect(readCommand(taskDir(dir, id))).toBe(`bun run verify:fast --full & echo "a & b"`);
  expect(existsSync(join(taskDir(dir, id), "out.log"))).toBe(false);
});

// lane:close's land-queue runner died with an empty log when the `bun run` that started it exited
// (2026-11-03): a detached child was still in its caller's process tree. Ending the caller's whole
// tree must leave the task running.
test.skipIf(process.platform !== "win32")("a task outlives its caller's whole process tree", async () => {
  const dir = checkout();
  const starter = join(dir, "starter.ts");
  const bgRun = join(import.meta.dir, "bg-run.ts").split("\\").join("/");
  writeFileSync(
    starter,
    `import { startTask } from "${bgRun}";\n` +
      `console.log(startTask({ command: "bun -e \\"setTimeout(() => { console.log('outlived'); process.exit(5) }, 1500)\\"", checkout: ${JSON.stringify(dir)} }));\n` +
      `setInterval(() => {}, 1000);\n`,
  );
  const caller = Bun.spawn({ cmd: [process.execPath, starter], stdout: "pipe", stderr: "inherit" });
  const reader = caller.stdout.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  const id = first.split("\n")[0]!.trim();
  expect(TASK_ID.test(id)).toBe(true);
  // Wait for the runner to exist, then end the caller and everything it started.
  for (let turn = 0; readRunner(taskDir(dir, id)) === null && turn < 200; turn += 1) await Bun.sleep(25);
  Bun.spawnSync({ cmd: ["taskkill", "/T", "/F", "/PID", String(caller.pid)], stdout: "ignore", stderr: "ignore" });
  await caller.exited;

  let printed = "";
  const code = await awaitTask({ id, checkout: dir, write: (text) => (printed += text), err: () => {}, timeoutMs: 30_000 });
  expect(code).toBe(5);
  expect(printed).toContain("outlived");
  expect(existsSync(join(taskDir(dir, id), "env.json"))).toBe(false);
});

test("a supervisor started outside the caller runs the command with the caller's environment", async () => {
  const dir = checkout();
  process.env["BG_TEST_MARK"] = "from-the-caller";
  try {
    const id = startTask({ command: `bun -e "console.log('mark=' + process.env.BG_TEST_MARK)"`, checkout: dir });
    let printed = "";
    expect(await awaitTask({ id, checkout: dir, write: (text) => (printed += text), err: () => {}, timeoutMs: 30_000 })).toBe(0);
    expect(printed).toContain("mark=from-the-caller");
  } finally {
    delete process.env["BG_TEST_MARK"];
  }
});

test("bun's argument separator is not part of the command", () => {
  expect(commandFrom(["--", "bun", "run", "verify:fast", "--full"])).toBe("bun run verify:fast --full");
  expect(commandFrom(["bun", "run", "verify:fast", "--full"])).toBe("bun run verify:fast --full");
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
  writeFileSync(join(task, "cmd.txt"), "bun run verify:fast --full\n");
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
  writeFileSync(join(task, "cmd.txt"), "bun run verify:fast --full\n");
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

// A waiter woken by the exit file's creation read it before its code was written, and reported
// a task that exited 3 as exited 0 (CI run 41587553136, four test lanes on one runner).
test("an exit file with no code yet is no code, never a pass", () => {
  const dir = checkout();
  writeFileSync(join(dir, "exit"), "");
  expect(readExit(dir)).toBeNull();
  writeFileSync(join(dir, "exit"), "3\n");
  expect(readExit(dir)).toBe(3);
});

test("the wait is the exit event: it returns as soon as the task exits, not on the heartbeat", async () => {
  const dir = checkout();
  // One command both shells read alike; `ping ... >nul` on bash wrote a file named `nul` into the repo (#2860).
  const script = join(dir, "exit-3.ts");
  writeFileSync(script, "setTimeout(() => process.exit(3), 1000);\n");
  const id = startTask({ command: `bun ${script.split("\\").join("/")}`, checkout: dir });

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
    cmd: [process.execPath, "run", "background", "start", "--", "echo bg-cli-one & exit 4"],
    cwd: root,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  });
  const id = started.stdout.toString().split("\n")[0]?.trim() ?? "";
  expect(TASK_ID.test(id)).toBe(true);
  made.add(taskDir(root, id));

  const awaited = Bun.spawnSync({
    cmd: [process.execPath, "run", "background", "await", id],
    cwd: root,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = awaited.stdout.toString();

  expect(text).toContain("bg-cli-one");
  expect(text).toContain(`background await: ${id} exited 4`);
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
