import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { baselinePath, cleanCommitFor, conditionsKey, readBaselineAt, resolveCommit, saveBaseline, type PerfConditions } from "./perf-baselines";

const base: PerfConditions = {
  size: { width: 1920, height: 1080 }, quality: undefined, draft: false, frameClock: "uncapped", path: "walk",
  seconds: 6, telemetry: "on", state: undefined, params: [], settings: [],
};

test("a cached run is reused only under the same run conditions", () => {
  expect(conditionsKey(base)).toBe(conditionsKey({ ...base, size: { width: 1920, height: 1080 } }));
  for (const changed of [
    { ...base, size: { width: 1280, height: 720 } },
    { ...base, quality: "ultra" },
    { ...base, frameClock: "capped" },
    { ...base, path: "still" },
    { ...base, seconds: 3 },
    { ...base, state: "two-towers" },
    { ...base, params: [["seed", "7"] as const] },
    { ...base, settings: [{ id: "accessibility.colorblind", value: "grayscale" }] },
  ]) {
    expect(conditionsKey(changed)).not.toBe(conditionsKey(base));
  }
});

function git(dir: string, ...args: string[]): string {
  const run = spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 10_000 });
  if (run.status !== 0) throw new Error(run.stderr);
  return run.stdout.trim();
}

test("a clean tree names its commit and keeps the record; an edited game or engine names none", () => {
  const root = mkdtempSync(join(tmpdir(), "jg-perf-baselines-"));
  try {
    git(root, "init", "-q");
    git(root, "config", "user.email", "perf@test");
    git(root, "config", "user.name", "perf");
    mkdirSync(join(root, "games", "deepward"), { recursive: true });
    mkdirSync(join(root, "packages", "core"), { recursive: true });
    writeFileSync(join(root, "games", "deepward", "index.ts"), "1");
    writeFileSync(join(root, "packages", "core", "index.ts"), "1");
    git(root, "add", ".");
    git(root, "commit", "-q", "-m", "start");
    const head = git(root, "rev-parse", "--short=8", "HEAD");

    expect(resolveCommit(root, "HEAD")).toBe(head);
    expect(resolveCommit(root, "no-such-ref")).toBeNull();
    expect(cleanCommitFor(root, "deepward")).toBe(head);

    const path = baselinePath(root, "deepward", head, conditionsKey(base));
    expect(readBaselineAt(path)).toBeNull();
    saveBaseline(path, { game: "deepward", frame: 8 });
    expect(JSON.parse(readBaselineAt(path) ?? "null")).toEqual({ game: "deepward", frame: 8 });

    writeFileSync(join(root, "games", "deepward", "index.ts"), "2");
    expect(cleanCommitFor(root, "deepward")).toBeNull();
    git(root, "checkout", "-q", "--", ".");
    writeFileSync(join(root, "packages", "core", "index.ts"), "2");
    expect(cleanCommitFor(root, "deepward")).toBeNull();
    git(root, "checkout", "-q", "--", ".");
    // Another game's edit does not change what this game's run serves.
    mkdirSync(join(root, "games", "fernwild"), { recursive: true });
    writeFileSync(join(root, "games", "fernwild", "index.ts"), "1");
    expect(cleanCommitFor(root, "deepward")).toBe(head);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
