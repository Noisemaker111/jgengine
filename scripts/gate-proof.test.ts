import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CASES, judge, patchedFiles } from "./gate-proof";

const root = join(import.meta.dir, "..");

test("a green gate on a real break is a failed proof; red without the lines a lane needs is too", () => {
  expect(judge(0, "everything passed", [/FAIL/]).ok).toBe(false);
  expect(judge(1, "FAIL  test\nsomething", [/FAIL/, /rerun only this/]).reason).toContain("rerun only this");
  expect(judge(1, "FAIL  test\n  rerun only this: bun test a.test.ts", [/FAIL/, /rerun only this/]).ok).toBe(true);
});

test("every case's patch exists and still applies to the files it names (or is applied right now, mid-proof)", () => {
  for (const proof of CASES) {
    const path = join(root, "scripts/fixtures/gate-proof", proof.patch);
    expect(existsSync(path), proof.patch).toBe(true);
    const files = patchedFiles(readFileSync(path, "utf8"));
    expect(files.length, proof.patch).toBeGreaterThan(0);
    const check = (args: string[]): boolean => Bun.spawnSync({ cmd: ["git", "apply", "--check", ...args, `scripts/fixtures/gate-proof/${proof.patch}`], cwd: root, stdout: "pipe", stderr: "pipe" }).exitCode === 0;
    expect(check([]) || check(["-R"]), `${proof.patch} neither applies nor is applied: update it for ${files.join(", ")}`).toBe(true);
  }
});
