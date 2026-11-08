import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The Stop hook in a real checkout: a lane:close still running here is refused once, since its exit
// is the merge to report or the failure to fix; a second stop is let through.
const hook = join(import.meta.dir, "..", ".claude", "hooks", "warn-unpushed.mjs");
const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function checkoutClosing(pid: number): string {
  const dir = mkdtempSync(join(tmpdir(), "warn-unpushed-"));
  made.push(dir);
  spawnSync("git", ["init", "-q", dir]);
  mkdirSync(join(dir, ".scratch"), { recursive: true });
  writeFileSync(join(dir, ".scratch", "lane-close.json"), JSON.stringify({ pid, branch: "agent/x" }));
  return dir;
}

function stop(dir: string, input = "{}"): string {
  return spawnSync(process.execPath, [hook], { cwd: dir, input, encoding: "utf8" }).stdout;
}

test("a lane:close still running in this checkout is refused, and the reason says so", () => {
  const out = stop(checkoutClosing(process.pid));
  expect(out).toContain('"decision":"block"');
  expect(out).toContain("bun run lane:close is still running");
});

test("a lane:close whose process is gone lets the turn end", () => {
  expect(stop(checkoutClosing(999999))).toBe("");
});

test("a second stop attempt is let through", () => {
  expect(stop(checkoutClosing(process.pid), '{"stop_hook_active":true}')).toBe("");
});
