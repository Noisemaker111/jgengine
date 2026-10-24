import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import {
  ALLOW_MISMATCH_FLAG,
  compareEngineVersions,
  describeServedEngine,
  engineRecord,
  readEnginePin,
  readServedEngine,
  resolveEngineIdentity,
} from "./engineIdentity";
import { buildShotRecord, shotSidecarPath, writeShotRecord, readShotRecord } from "./shotProvenance";

/**
 * The trap these tests close: the dev runner serves engine source from this checkout, so a capture
 * proves whatever is on disk, not the version the game's catalog pins. A lane proved its fix on an
 * engine two releases old, got identical pixels, and nearly recorded "the fix does not work".
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
    const run = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (run.status !== 0) throw new Error(`fixture git ${args.join(" ")}: ${run.stderr}`);
  }
  return root;
}

/** A games checkout whose workspace catalog pins `@jgengine/core` at `version`. */
function games(version: string): string {
  const root = join(fixture(), "games");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ name: "games", workspaces: { catalog: { "@jgengine/core": version } } }, null, 2)}\n`);
  return root;
}

function headOf(root: string): string {
  const run = spawnSync("git", ["rev-parse", "--short=8", "HEAD"], { cwd: root, encoding: "utf8" });
  return run.stdout.trim();
}

describe("engine identity", () => {
  test("a matching pin proceeds and the printed line names the version and the served commit", () => {
    const root = checkout("0.38.0");
    const identity = resolveEngineIdentity({ root, gamesDir: games("0.38.0"), tool: "shoot" });
    expect(identity.verdict).toBe("match");
    expect(identity.allowed).toBe(true);
    expect(identity.refusal).toBeNull();
    expect(identity.line).toContain("engine: serving engine source " + headOf(root));
    expect(identity.line).toContain("@jgengine/core 0.38.0");
    expect(identity.line).toContain("game pins @jgengine/core 0.38.0");
  });

  test("older served source stops the run, naming both versions and both ways forward", () => {
    const root = checkout("0.36.0");
    const identity = resolveEngineIdentity({ root, gamesDir: games("0.38.0"), tool: "shoot" });
    expect(identity.verdict).toBe("behind");
    expect(identity.allowed).toBe(false);
    const refusal = identity.refusal ?? "";
    expect(refusal).toContain("shoot: refusing to capture");
    expect(refusal).toContain(`serving engine source ${headOf(root)}`);
    expect(refusal).toContain("@jgengine/core 0.36.0");
    expect(refusal).toContain("game pins @jgengine/core 0.38.0");
    expect(refusal).toContain(`git -C ${root} pull --ff-only origin beta`);
    expect(refusal).toContain(ALLOW_MISMATCH_FLAG);
  });

  test("--allow-engine-mismatch proceeds and records that it did", () => {
    const root = checkout("0.36.0");
    const identity = resolveEngineIdentity({ root, gamesDir: games("0.38.0"), allowMismatch: true, tool: "drive" });
    expect(identity.verdict).toBe("behind");
    expect(identity.allowed).toBe(true);
    expect(identity.mismatchAllowed).toBe(true);
    expect(identity.refusal).toBeNull();
    expect(identity.line).toContain(`older engine allowed by ${ALLOW_MISMATCH_FLAG}`);
    expect(engineRecord(identity)).toMatchObject({ version: "0.36.0", pin: "0.38.0", verdict: "behind", mismatchAllowed: true });
  });

  test("source ahead of the pin is the engine-lane state: it proceeds and says it is ahead", () => {
    const root = checkout("0.39.0-next.0");
    const identity = resolveEngineIdentity({ root, gamesDir: games("0.38.0"), tool: "perf" });
    expect(identity.verdict).toBe("ahead");
    expect(identity.allowed).toBe(true);
    expect(identity.line).toContain("ahead of the pin");
    expect(identity.refusal).toBeNull();
  });

  test("no games checkout means no pin to compare: the run proceeds with the pin named unknown", () => {
    const root = checkout("0.38.0");
    const identity = resolveEngineIdentity({ root, gamesDir: join(root, "absent"), tool: "shoot" });
    expect(identity.verdict).toBe("unknown");
    expect(identity.allowed).toBe(true);
    expect(identity.line).toContain("game pin unknown");
  });

  test("uncommitted engine edits are named, so the commit is not read as the whole story", () => {
    const root = checkout("0.38.0");
    writeFileSync(join(root, "packages", "core", "extra.ts"), "export {};\n");
    expect(readServedEngine(root)).toMatchObject({ version: "0.38.0", dirty: true });
    expect(describeServedEngine(readServedEngine(root)!)).toContain("+uncommitted edits");
  });

  test("the pin is read from the catalog, and a game's own dependency is the fallback", () => {
    const root = games("0.38.0");
    expect(readEnginePin(root, "ember-command")).toMatchObject({ version: "0.38.0", path: join(root, "package.json") });
    mkdirSync(join(root, "own"), { recursive: true });
    writeFileSync(join(root, "own", "package.json"), `${JSON.stringify({ dependencies: { "@jgengine/core": "0.37.2" } })}\n`);
    const bare = join(fixture(), "bare");
    mkdirSync(join(bare, "own"), { recursive: true });
    writeFileSync(join(bare, "own", "package.json"), `${JSON.stringify({ dependencies: { "@jgengine/core": "0.37.2" } })}\n`);
    expect(readEnginePin(bare, "own")).toMatchObject({ version: "0.37.2" });
  });

  test("a prerelease sorts below its release, so a game on the stable pin is not proven on a next build", () => {
    expect(compareEngineVersions("0.38.0-next.2", "0.38.0")).toBe(-1);
    expect(compareEngineVersions("0.38.0", "0.38.0")).toBe(0);
    expect(compareEngineVersions("0.39.0", "0.38.0")).toBe(1);
    expect(compareEngineVersions("not-a-version", "0.38.0")).toBeNull();
  });

  test("a saved shot carries the served engine, so the record can be audited later", () => {
    const root = checkout("0.36.0");
    const identity = resolveEngineIdentity({ root, gamesDir: games("0.38.0"), allowMismatch: true, tool: "shoot" });
    const record = buildShotRecord({
      bytes: new Uint8Array([137, 80, 78, 71]),
      command: "bun run shoot demo",
      capturedAt: "2026-10-24T00:00:00.000Z",
      engine: engineRecord(identity)!,
    });
    const out = join(fixture(), "shot.png");
    writeShotRecord(out, record);
    expect(readShotRecord(out)?.engine).toMatchObject({ package: "@jgengine/core", version: "0.36.0", pin: "0.38.0", mismatchAllowed: true });
    expect(shotSidecarPath(out).endsWith(".shot.json")).toBe(true);
  });
});

/** The refusal has to arrive before a browser exists, or the lane pays for a wrong capture first. */
describe("shoot refuses the wrong engine before the browser starts", () => {
  const shoot = join(import.meta.dir, "shoot-dev.ts");

  function run(args: string[], gamesDir: string) {
    return spawnSync(process.execPath, [shoot, ...args], {
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env, JG_GAMES_DIR: gamesDir },
    });
  }

  test("an older pin stops the run with both versions named", () => {
    const result = run(["demo", "--quick"], games("9.9.9"));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("refusing to capture");
    expect(result.stderr).toContain("game pins @jgengine/core 9.9.9");
    expect(result.stderr).toContain(ALLOW_MISMATCH_FLAG);
    expect(result.stderr).not.toContain("warm: reused");
    expect(result.stderr).not.toContain("webgl2");
  }, 130_000);

  test("a matching pin passes the gate and prints the engine line", () => {
    const served = readServedEngine(join(import.meta.dir, ".."))!.version;
    const result = run(["demo", "--quick", "--connect", "1", "--timeout", "1"], games(served));
    expect(result.stderr).toContain("engine: serving engine source");
    expect(result.stderr).not.toContain("refusing to capture");
  }, 130_000);

  test("--allow-engine-mismatch passes the gate and says the older engine was allowed", () => {
    const result = run(["demo", "--quick", "--connect", "1", "--timeout", "1", ALLOW_MISMATCH_FLAG], games("9.9.9"));
    expect(result.stderr).toContain("engine: serving engine source");
    expect(result.stderr).toContain(`older engine allowed by ${ALLOW_MISMATCH_FLAG}`);
    expect(result.stderr).not.toContain("refusing to capture");
  }, 130_000);
});
