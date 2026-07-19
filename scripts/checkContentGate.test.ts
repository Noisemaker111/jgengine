import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Acceptance tests for the content-fill half of check-content-gate (#1125): an authored game that
 * fills world content in code via `@jgengine/core/world/features` builders — grass()/building()/
 * road()/pad()/bounded ocean() — must fail the gate independent of coordinate scoring, and legit
 * runtime-only content is exempted through the existing scene-ownership.json declaration (or a
 * shrinking baseline entry). Each case runs the real script against an isolated temp repo so the
 * detection, baseline diff, and ownership exemption are exercised end to end.
 */

const SCRIPT = join(import.meta.dir, "check-content-gate.ts");
const FEATURES = "@jgengine/core/world/features";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "content-gate-"));
  roots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  return root;
}

/** Write one game under Games/<id>. `files` is a map of src-relative path -> contents. */
function writeGame(root: string, id: string, files: Record<string, string>): void {
  const gameDir = join(root, "Games", id);
  mkdirSync(gameDir, { recursive: true });
  writeFileSync(join(gameDir, "package.json"), JSON.stringify({ name: id }));
  for (const [rel, contents] of Object.entries(files)) {
    const full = join(gameDir, "src", rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
}

/** An editor.scene.json with one marker flips the game's `authored` bit on. */
const AUTHORED_SCENE = JSON.stringify({ markers: [{ id: "m1" }] });

function runGate(root: string): { code: number; err: string } {
  const proc = Bun.spawnSync(["bun", SCRIPT], { cwd: root });
  return { code: proc.exitCode, err: proc.stderr.toString() + proc.stdout.toString() };
}

describe("content-fill detection", () => {
  test("authored game calling grass() from features fails the gate", () => {
    const root = makeRoot();
    writeGame(root, "turf-town", {
      "editor.scene.json": AUTHORED_SCENE,
      "world.ts": `import { grass } from "${FEATURES}";\nexport const w = grass({ area: { w: 90, d: 90 }, density: 30 });\n`,
    });
    const { code, err } = runGate(root);
    expect(code).toBe(1);
    expect(err).toContain("grass(...)");
    expect(err).toContain("Games/turf-town/src/world.ts:");
  });

  test("authored game calling building() fails the gate", () => {
    const root = makeRoot();
    writeGame(root, "block-city", {
      "editor.scene.json": AUTHORED_SCENE,
      "world.ts": `import { building } from "${FEATURES}";\nexport const b = building({ count: 9, style: "village" });\n`,
    });
    const { code, err } = runGate(root);
    expect(code).toBe(1);
    expect(err).toContain("building(...)");
  });

  test("bounded ocean() fails, but a default full-world ocean() does not", () => {
    const bounded = makeRoot();
    writeGame(bounded, "bay-town", {
      "editor.scene.json": AUTHORED_SCENE,
      "world.ts": `import { ocean } from "${FEATURES}";\nexport const o = ocean({ bounds: { w: 200, d: 200 }, position: [0, 0] });\n`,
    });
    expect(runGate(bounded).code).toBe(1);

    const ambient = makeRoot();
    writeGame(ambient, "open-sea", {
      "editor.scene.json": AUTHORED_SCENE,
      "world.ts": `import { ocean } from "${FEATURES}";\nexport const o = ocean();\n`,
    });
    expect(runGate(ambient).code).toBe(0);
  });

  test("scene-ownership.json declaring runtime content exempts the game", () => {
    const root = makeRoot();
    writeGame(root, "turf-town", {
      "editor.scene.json": AUTHORED_SCENE,
      "world.ts": `import { grass } from "${FEATURES}";\nexport const w = grass({ area: { w: 90, d: 90 }, density: 30 });\n`,
      "scene-ownership.json": JSON.stringify({
        version: 1,
        declarations: [
          {
            provenance: { kind: "runtime", providerId: "turf", instanceId: "meadow" },
            reason: "procedural grass instanced at runtime; no authored footprint",
          },
        ],
      }),
    });
    expect(runGate(root).code).toBe(0);
  });

  test("a content-builder-baseline.json entry exempts a known offender", () => {
    const root = makeRoot();
    writeGame(root, "turf-town", {
      "editor.scene.json": AUTHORED_SCENE,
      "world.ts": `import { grass } from "${FEATURES}";\nexport const w = grass({ area: { w: 90, d: 90 }, density: 30 });\n`,
    });
    writeFileSync(
      join(root, "scripts", "content-builder-baseline.json"),
      JSON.stringify(["Games/turf-town/src/world.ts:grass"]),
    );
    expect(runGate(root).code).toBe(0);
  });

  test("baseline entry that no longer trips the gate must be removed (shrink-only)", () => {
    const root = makeRoot();
    writeGame(root, "turf-town", {
      "editor.scene.json": AUTHORED_SCENE,
      "world.ts": `export const w = 1;\n`,
    });
    writeFileSync(
      join(root, "scripts", "content-builder-baseline.json"),
      JSON.stringify(["Games/turf-town/src/world.ts:grass"]),
    );
    const { code, err } = runGate(root);
    expect(code).toBe(1);
    expect(err).toContain("only shrinks");
  });

  test("a non-authored (fully procedural) game calling grass() does not trip the gate", () => {
    const root = makeRoot();
    writeGame(root, "proc-world", {
      "world.ts": `import { grass } from "${FEATURES}";\nexport const w = grass({ density: 4 });\n`,
    });
    expect(runGate(root).code).toBe(0);
  });

  test("a local pad() helper not imported from features is not a false positive", () => {
    const root = makeRoot();
    writeGame(root, "hud-game", {
      "editor.scene.json": AUTHORED_SCENE,
      "ui.ts": `function pad(v: number): string { return String(v).padStart(2, "0"); }\nexport const label = pad(5);\n`,
    });
    expect(runGate(root).code).toBe(0);
  });
});
