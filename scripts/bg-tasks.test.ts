import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { removeDirSync } from "./removeDir";

import { awaitTask, parseAwaitArgs, EXIT_LOST, EXIT_NO_TASK, EXIT_TIMEOUT } from "./bg-await";
import { commandFrom, startTask } from "./bg-run";
import { formatStatus, parseStatusArgs, taskStatus } from "./bg-status";
import { newTaskId, readAwaiter, readCommand, readExit, readOutput, readRunner, taskDir, TASK_ID } from "./bg-tasks";

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

// lane:close's background runner died with an empty log when the `bun run` that started it exited
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

const GIT_BASH = "C:/Program Files/Git/bin/bash.exe";

test.skipIf(process.platform !== "win32" || !existsSync(GIT_BASH))("a Git Bash job's output reaches the log (MSYS writes nothing to an append-only handle)", async () => {
  const dir = checkout();
  const id = startTask({ command: `"${GIT_BASH}" -c "echo from-msys; echo to-stderr >&2; exit 4"`, checkout: dir });
  let printed = "";
  expect(await awaitTask({ id, checkout: dir, write: (text) => (printed += text), err: () => {}, timeoutMs: 30_000 })).toBe(4);
  expect(printed).toContain("from-msys");
  expect(printed).toContain("to-stderr");
});

test("bun's argument separator is not part of the command", () => {
  expect(commandFrom(["--", "bun", "run", "verify:fast", "--full"])).toBe("bun run verify:fast --full");
  expect(commandFrom(["bun", "run", "verify:fast", "--full"])).toBe("bun run verify:fast --full");
  expect(commandFrom(["--"])).toBe("");
});

test("an argument with spaces or quotes reaches the command whole, on either shell", () => {
  const argv = ["--", "bun", "run", "lane:close", "-m", 'Breaking: the "old" name, gone & done'];
  expect(commandFrom(argv, "win32")).toBe('bun run lane:close -m "Breaking: the \\"old\\" name, gone & done"');
  expect(commandFrom(argv, "linux")).toBe(`bun run lane:close -m 'Breaking: the "old" name, gone & done'`);
  expect(commandFrom(["--", "bun test a.test.ts && echo ok"])).toBe("bun test a.test.ts && echo ok");
  // The line goes through the same shell the runner uses, and the program sees one argument.
  const line = commandFrom(["--", "bun", "-e", "console.log(JSON.stringify(process.argv.slice(1)))", "x y", 'say "hi"']);
  const run = process.platform === "win32" ? spawnSync("cmd.exe", ["/d", "/s", "/c", `"${line}"`], { windowsVerbatimArguments: true, encoding: "utf8" }) : spawnSync("bash", ["-lc", line], { encoding: "utf8" });
  expect(JSON.parse(run.stdout.trim())).toEqual(["x y", 'say "hi"']);
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

test("a waiting await marks itself as the task's awaiter, and clears the mark when the wait ends", async () => {
  const dir = checkout();
  const task = taskDir(dir, "20261023-204501-abc");
  mkdirSync(task, { recursive: true });
  writeFileSync(join(task, "cmd.txt"), "bun scripts/lane-close.ts\n");

  const seen: { awaiter: number | null } = { awaiter: null };
  const code = await awaitTask({
    id: "20261023-204501-abc",
    checkout: dir,
    pid: 4242,
    write: () => {},
    err: () => {},
    untilExit: async (target) => {
      seen.awaiter = readAwaiter(target);
      return 0;
    },
  });

  expect(code).toBe(0);
  expect(seen.awaiter).toBe(4242);
  expect(readAwaiter(task)).toBeNull();
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

// A landing that took 9 minutes outlasted a 540 s wait, and the wait then also said the task
// "never reported an exit code", which reads as a dead runner (2026-11-03, #2922 landed fine).
test("a wait that runs out says the task is still running, never that it was lost", async () => {
  const dir = checkout();
  const task = taskDir(dir, "20261023-204501-abc");
  mkdirSync(task, { recursive: true });
  writeFileSync(join(task, "cmd.txt"), "bun scripts/lane-close.ts\n");
  writeFileSync(join(task, "out.log"), "");
  // A pid nothing holds, so cleanup does not wait on it; `alive` says the runner lives.
  writeFileSync(join(task, "runner"), "999999\n");

  const errors: string[] = [];
  const code = await awaitTask({ id: "20261023-204501-abc", checkout: dir, alive: () => true, write: () => {}, err: (line) => errors.push(line), timeoutMs: 300 });

  expect(code).toBe(EXIT_TIMEOUT);
  expect(errors.join("\n")).toContain("is still running");
  expect(errors.join("\n")).not.toContain("never reported");
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

// Under a loaded verify:fast run the exit event once never reached the waiter and it sat out its
// 30 s bound (#3118): the wait now reads the exit file behind the watch, and still returns on exit.
test("the wait is the exit event: it returns as soon as the task exits, not on the heartbeat", async () => {
  const dir = checkout();
  // One command both shells read alike; `ping ... >nul` on bash wrote a file named `nul` into the repo (#2860).
  const script = join(dir, "exit-3.ts");
  writeFileSync(script, "setTimeout(() => process.exit(3), 1000);\n");
  const id = startTask({ command: `bun ${script.split("\\").join("/")}`, checkout: dir });

  let printed = "";
  // A heartbeat a minute away, so only the exit event can end the wait in time. A bound of 800 ms
  // against the real 2 s beat measured the PC's load instead: it failed at 1135 ms on a busy one.
  const code = await awaitTask({ id, checkout: dir, write: (text) => (printed += text), err: () => {}, beatMs: 60_000 });
  const exitedAt = statSync(join(taskDir(dir, id), "exit")).mtimeMs;
  const late = Date.now() - exitedAt;

  expect(code).toBe(3);
  expect(readExit(taskDir(dir, id))).toBe(3);
  expect(readRunner(taskDir(dir, id))).not.toBeNull();
  expect(printed).toContain("exited 3");
  expect(late).toBeLessThan(10_000);
}, { timeout: 30_000 });

/** A task folder whose runner `alive` reports living, for a wait driven without a real child. */
function waitingTask(): { dir: string; id: string; task: string } {
  const dir = checkout();
  const id = "20261023-204501-abc";
  const task = taskDir(dir, id);
  mkdirSync(task, { recursive: true });
  writeFileSync(join(task, "cmd.txt"), "bun scripts/lane-close.ts\n");
  writeFileSync(join(task, "out.log"), "");
  // A pid nothing holds, so cleanup does not wait on it; `alive` says the runner lives.
  writeFileSync(join(task, "runner"), "999999\n");
  return { dir, id, task };
}

// #3118: the watch event for the exit file's rename never arrived under load. A watch that stays
// silent must cost at most the exit check, never the heartbeat (a minute here) or the test bound.
test("a lost watch event still ends the wait on the exit, not on the heartbeat", async () => {
  const { dir, id, task } = waitingTask();
  const errors: string[] = [];
  let closed = false;
  setTimeout(() => writeFileSync(join(task, "exit"), "3\n"), 300);
  const started = Date.now();
  const code = await awaitTask({
    id, checkout: dir, alive: () => true, write: () => {}, err: (line) => errors.push(line), beatMs: 60_000, exitCheckMs: 50,
    watchFolder: () => ({ close: () => { closed = true; } }),
  });

  expect(code).toBe(3);
  expect(Date.now() - started).toBeLessThan(5_000);
  expect(closed).toBe(true);
  expect(errors.join("\n")).not.toContain("degraded:");
});

test("a folder that cannot be watched says degraded and still ends the wait on the exit", async () => {
  const { dir, id, task } = waitingTask();
  const errors: string[] = [];
  setTimeout(() => writeFileSync(join(task, "exit"), "4\n"), 100);
  const code = await awaitTask({
    id, checkout: dir, alive: () => true, write: () => {}, err: (line) => errors.push(line), beatMs: 60_000, exitCheckMs: 50,
    watchFolder: () => { throw new Error("ENOSPC: inotify watch limit reached"); },
  });

  expect(code).toBe(4);
  expect(errors.join("\n")).toContain("degraded: background await has no watch on");
  expect(errors.join("\n")).toContain("ENOSPC");
});

test("a watch that fails mid-wait says degraded once and the wait carries on", async () => {
  const { dir, id, task } = waitingTask();
  const errors: string[] = [];
  const code = await awaitTask({
    id, checkout: dir, alive: () => true, write: () => {}, err: (line) => errors.push(line), beatMs: 60_000, exitCheckMs: 50,
    watchFolder: (_dir, _onChange, onError) => {
      setTimeout(() => onError(new Error("watcher closed")), 50);
      setTimeout(() => writeFileSync(join(task, "exit"), "0\n"), 150);
      return { close: () => {} };
    },
  });

  expect(code).toBe(0);
  expect(errors.filter((line) => line.startsWith("degraded:")).length).toBe(1);
});

test("the documented commands run a real command in the background and report it", () => {
  // `&&` runs the two in order in both shells. With `&`, bash put the echo in the background and
  // `exit 4` could end the task before the echo wrote, so a loaded run read an empty log (#3118).
  const started = Bun.spawnSync({
    cmd: [process.execPath, "run", "background", "start", "--", "echo bg-cli-one && exit 4"],
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

  const status = Bun.spawnSync({ cmd: [process.execPath, "run", "background", "status", id, "--lines", "3"], cwd: root, timeout: 60_000, stdout: "pipe", stderr: "pipe" });
  const report = status.stdout.toString();
  expect(report).toContain(`background status: ${id} exited 4 after`);
  expect(report).toContain("bg-cli-one");
  expect(status.exitCode).toBe(4);
});

test("a running task's status says so, shows the log's tail and names the await; a lost one is not reported running", () => {
  const dir = checkout();
  const task = taskDir(dir, "20261023-204501-run");
  mkdirSync(task, { recursive: true });
  writeFileSync(join(task, "cmd.txt"), "bun run jgengine plants fit pinus-strobus\n");
  writeFileSync(join(task, "runner"), "4242\n");
  writeFileSync(join(task, "out.log"), "plants fit: 1 species\npinus-strobus gen 1/40 best 6.10\n\npinus-strobus gen 2/40 best 5.90\n");
  const running = taskStatus(task, "20261023-204501-run", 2, () => true, Date.now());
  expect(running.state).toBe("running");
  expect(running.tail).toEqual(["pinus-strobus gen 1/40 best 6.10", "pinus-strobus gen 2/40 best 5.90"]);
  const text = formatStatus(running, join(task, "out.log"));
  expect(text).toContain("running for");
  expect(text).toContain("bun run background await 20261023-204501-run");
  expect(taskStatus(task, "20261023-204501-run", 2, () => false).state).toBe("lost");
  expect(parseStatusArgs(["--", "20261023-204501-run", "--lines", "5"])).toEqual({ id: "20261023-204501-run", lines: 5 });
  expect(() => parseStatusArgs(["a", "--lines", "x"])).toThrow("--lines needs a whole number");
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
