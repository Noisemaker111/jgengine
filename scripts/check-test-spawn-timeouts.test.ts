import { expect, test } from "bun:test";
import { findUntimedSyncSpawns } from "./check-test-spawn-timeouts";

test("flags sync spawns without a timeout, including multi-line and Bun.spawnSync calls", () => {
  const source = [
    'import { spawnSync, execFileSync } from "node:child_process";',
    'spawnSync(process.execPath, [cli], { encoding: "utf8" });',
    'execFileSync("tar", ["-xzf", "a(b).tgz"], {',
    '  cwd: dir,',
    '});',
    'Bun.spawnSync(["bun", "x"]);',
  ].join("\n");
  expect(findUntimedSyncSpawns(source)).toEqual([2, 3, 6]);
});

test("accepts calls that pass a timeout and ignores async spawns", () => {
  const source = [
    'spawnSync(process.execPath, [cli], { encoding: "utf8", timeout: 15_000 });',
    'execFileSync("npm", ["pack"], {',
    '  timeout: 120_000,',
    '});',
    'Bun.spawnSync(["bun"], { timeout: 60_000 });',
    'Bun.spawn(["bun"]);',
  ].join("\n");
  expect(findUntimedSyncSpawns(source)).toEqual([]);
});
