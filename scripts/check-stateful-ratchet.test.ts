import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { findStatefulPrimitives } from "./statefulPrimitives";

const SCRIPT = join(import.meta.dir, "check-stateful-ratchet.ts");
const SCRATCH = join(import.meta.dir, "..", ".scratch");

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function key(name: string): string {
  return `packages/core/src/${name}.ts`;
}

/** Probes whose handle snapshots state but cannot take it back — the `downed.ts` shape. */
const SNAPSHOT_ONLY = `export interface Probe {
  tick(dt: number): void;
  snapshot(): number;
}

export function createProbe(): Probe {
  let n = 0;
  return { tick: () => { n += 1; }, snapshot: () => n };
}
`;

const ROUND_TRIP = `export interface Probe {
  tick(dt: number): void;
  snapshot(): number;
  restore(next: number): void;
}

export function createProbe(): Probe {
  let n = 0;
  return { tick: () => { n += 1; }, snapshot: () => n, restore: (next) => { n = next; } };
}
`;

interface Fixture {
  files?: Record<string, string>;
  baseline?: string[] | { ceilings?: Record<string, number>; keys: string[] };
}

function fixtureTree(name: string, { files = {}, baseline }: Fixture): string {
  const root = join(SCRATCH, `stateful-ratchet-${name}-${crypto.randomUUID()}`);
  made.push(root);
  for (const dir of ["scripts", "packages/core/src", "packages/react/src"]) mkdirSync(join(root, dir), { recursive: true });
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
  if (baseline !== undefined) {
    writeFileSync(join(root, "scripts/stateful-primitive-baseline.json"), `${JSON.stringify(baseline, null, 2)}\n`);
  }
  return root;
}

function runGate(root: string, extra: string[] = []): { code: number | null; stdout: string; stderr: string } {
  const result = Bun.spawnSync({
    cmd: [process.execPath, SCRIPT, "--root", root, ...extra],
    cwd: root,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

describe("the stateful ratchet fails the snapshot-without-restore class", () => {
  test("a factory that snapshots but cannot restore fails, and the failure names the invariant", () => {
    const root = fixtureTree("snapshot-only", {
      files: { [key("probe")]: SNAPSHOT_ONLY },
      baseline: [],
    });
    const result = runGate(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`${key("probe")}#createProbe [round-trip]`);
    expect(result.stderr).toContain("AGENTS.md — Stateful primitives");
    expect(result.stderr).toContain("restore(next)");
  });

  test("the same factory passes once it carries restore", () => {
    const root = fixtureTree("round-trip", {
      files: { [key("probe")]: ROUND_TRIP },
      baseline: [],
    });
    const result = runGate(root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("none added");
  });

  test("a baselined round-trip entry cannot pay for a second one — the ceiling only shrinks", () => {
    const root = fixtureTree("ceiling", {
      files: { [key("one")]: SNAPSHOT_ONLY, [key("two")]: SNAPSHOT_ONLY.split("createProbe").join("createSpare") },
      baseline: { ceilings: { "round-trip": 1 }, keys: [`${key("one")}#createProbe`, `${key("two")}#createSpare`] },
    });
    const result = runGate(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("round-trip: 2 live, ceiling 1");
    expect(result.stderr).toContain(`${key("two")}#createSpare`);
  });

  test("--write refuses to raise a ceiling, so a new offender cannot be grandfathered", () => {
    const root = fixtureTree("raise", {
      files: { [key("one")]: SNAPSHOT_ONLY, [key("two")]: SNAPSHOT_ONLY.split("createProbe").join("createSpare") },
      baseline: { ceilings: { "round-trip": 1 }, keys: [`${key("one")}#createProbe`] },
    });
    const result = runGate(root, ["--write"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("a ceiling would rise");
    expect(runGate(root).code).toBe(1);
  });

  test("paying a round-trip entry fails until the smaller baseline is committed", () => {
    const root = fixtureTree("paid", {
      files: { [key("probe")]: ROUND_TRIP },
      baseline: { ceilings: { "round-trip": 0 }, keys: [`${key("probe")}#createProbe`] },
    });
    const result = runGate(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("no longer apply");
  });
});

describe("the scan names which gap a primitive has", () => {
  test("snapshot without restore is the round-trip gap, not plain missing state", () => {
    const root = fixtureTree("gap", { files: { [key("probe")]: SNAPSHOT_ONLY } });
    expect(findStatefulPrimitives(root).map((entry) => [entry.factory, entry.gap])).toEqual([
      ["createProbe", "state-out-only"],
    ]);
  });

  test("a handle with no state-out at all is the other gap", () => {
    const source = `export interface Probe {\n  tick(dt: number): void;\n}\n\nexport function createProbe(): Probe {\n  let n = 0;\n  return { tick: () => { n += 1; } };\n}\n`;
    const root = fixtureTree("no-out", { files: { [key("probe")]: source } });
    expect(findStatefulPrimitives(root).map((entry) => entry.gap)).toEqual(["no-state-out"]);
  });
});
