import { afterEach, expect, test } from "bun:test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The Stop hook in a real checkout: a landing queue running with nobody awaiting it is refused once;
// one a `background await` is waiting on lets the turn end, since the harness calls the turn back.
const hook = join(import.meta.dir, "..", ".claude", "hooks", "warn-unpushed.mjs");
const made: string[] = [];
const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill();
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function checkoutWithQueue(): { dir: string; task: string } {
  const dir = mkdtempSync(join(tmpdir(), "warn-unpushed-"));
  made.push(dir);
  spawnSync("git", ["init", "-q", dir]);
  const task = join(dir, ".scratch", "bg", "20261105-120000-abc");
  mkdirSync(task, { recursive: true });
  writeFileSync(join(task, "cmd.txt"), "bun scripts/land-queue.ts --pr 7\n");
  writeFileSync(join(task, "runner"), `${process.pid}\n`);
  return { dir, task };
}

function stop(dir: string): string {
  const run = spawnSync(process.execPath, [hook], { cwd: dir, input: "{}", encoding: "utf8" });
  return run.stdout;
}

test("a queue nobody awaits is refused, and the reason names the background await", () => {
  const { dir } = checkoutWithQueue();
  const out = stop(dir);
  expect(out).toContain('"decision":"block"');
  expect(out).toContain("bun run background await 20261105-120000-abc");
  expect(out).toContain("harness background");
  expect(out).not.toContain("--timeout 540");
});

test("a queue a live background await is waiting on lets the turn end", () => {
  const { dir, task } = checkoutWithQueue();
  const awaiter = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"]);
  children.push(awaiter);
  writeFileSync(join(task, "awaiter"), `${awaiter.pid}\n`);
  expect(stop(dir)).toBe("");
});

test("an awaiter that died leaves the queue unawaited, so the turn is refused again", () => {
  const { dir, task } = checkoutWithQueue();
  writeFileSync(join(task, "awaiter"), "999999\n");
  expect(stop(dir)).toContain('"decision":"block"');
});

test("a second stop attempt is let through", () => {
  const { dir } = checkoutWithQueue();
  const run = spawnSync(process.execPath, [hook], { cwd: dir, input: '{"stop_hook_active":true}', encoding: "utf8" });
  expect(run.stdout).toBe("");
});
