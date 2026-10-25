import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  describeServedEngine,
  engineRecord,
  readServedEngine,
  resolveEngineIdentity,
} from "./engineIdentity";
import { buildShotRecord, shotSidecarPath, writeShotRecord, readShotRecord } from "./shotProvenance";
/**
 * The dev runner serves engine source from this checkout, so every capture names what it served.
 */
const scratch = join(import.meta.dir, "..", ".scratch");
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});
function fixture(): string {
  mkdirSync(scratch, { recursive: true });
  const dir = join(scratch, `engine-identity-${process.pid}-${dirs.length}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  dirs.push(dir);
  return dir;
}
/** A checkout that looks like this repo to the identity read: package source plus one commit. */
function checkout(version: string): string {
  const root = join(fixture(), "jgengine");
  mkdirSync(join(root, "packages", "core"), { recursive: true });
  writeFileSync(join(root, "packages", "core", "package.json"), `${JSON.stringify({ name: "@jgengine/core", version }, null, 2)}\n`);
  writeFileSync(join(root, "README.md"), "fixture\n");
  for (const args of [
    ["init", "--quiet"],
    ["add", "."],
    ["-c", "user.email=fixture@example.com", "-c", "user.name=fixture", "commit", "--quiet", "-m", "fixture"],
  ]) {
    const run = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 30_000 });
    if (run.status !== 0) throw new Error(`fixture git ${args.join(" ")}: ${run.stderr}`);
  }
  return root;
}

function headOf(root: string): string {
  const run = spawnSync("git", ["rev-parse", "--short=8", "HEAD"], { cwd: root, encoding: "utf8", timeout: 30_000 });
  return run.stdout.trim();
}

describe("engine identity", () => {
  test("the printed line names the version and the served commit", () => {
    const root = checkout("0.38.0");
    const identity = resolveEngineIdentity({ root });
    expect(identity.line).toContain("@jgengine/core 0.38.0");
    expect(identity.line).toContain(headOf(root));
  });

  test("no engine checkout is named, not guessed", () => {
    expect(resolveEngineIdentity({ root: fixture() }).line).toContain("engine: unknown");
  });

  test("uncommitted engine edits are named, so the commit is not read as the whole story", () => {
    const root = checkout("0.38.0");
    writeFileSync(join(root, "packages", "core", "extra.ts"), "export {};\n");
    expect(readServedEngine(root)).toMatchObject({ version: "0.38.0", dirty: true });
    expect(describeServedEngine(readServedEngine(root)!)).toContain("+uncommitted edits");
  });

  test("a saved shot carries the served engine, so the record can be audited later", () => {
    const root = checkout("0.36.0");
    const record = buildShotRecord({
      bytes: new Uint8Array([137, 80, 78, 71]),
      command: "bun run shoot demo",
      capturedAt: "2026-10-24T00:00:00.000Z",
      engine: engineRecord(resolveEngineIdentity({ root }))!,
    });
    const out = join(fixture(), "shot.png");
    writeShotRecord(out, record);
    expect(readShotRecord(out)?.engine).toMatchObject({ package: "@jgengine/core", version: "0.36.0", dirty: false });
    expect(shotSidecarPath(out).endsWith(".shot.json")).toBe(true);
  });
});

describe("shoot prints the engine before the browser starts", () => {
  test("the engine line comes first", () => {
    const result = spawnSync(process.execPath, [join(import.meta.dir, "shoot-dev.ts"), "demo", "--quick", "--connect", "1", "--timeout", "1"], {
      encoding: "utf8",
      timeout: 120_000,
    });
    expect(result.stderr).toContain("engine: serving engine source");
  }, 130_000);
});
