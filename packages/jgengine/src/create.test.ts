import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerRootGameScript, writeGame } from "./create";
import { diagnose } from "./doctor";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "jgengine-create-"));
}

describe("writeGame", () => {
  test("scaffolds a standalone game that doctor signs off on", () => {
    const dir = join(scratch(), "probe-game");
    writeGame(dir, "probe-game", "Probe Game", "standalone");

    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "src", "game", "ui", "GameUI.tsx"))).toBe(true);

    mkdirSync(join(dir, "node_modules", "@jgengine", "core"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "@jgengine", "core", "package.json"), '{"version":"0.8.0"}');

    const failures = diagnose(dir).filter((finding) => !finding.ok);
    expect(failures).toEqual([]);
  });
});

describe("registerRootGameScript", () => {
  test("inserts games:<id> sorted among existing game scripts", () => {
    const root = scratch();
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "fixture-root",
        scripts: {
          build: "noop",
          "games:annals": "bun run --cwd Games/annals dev",
          "games:voxel-mine": "bun run --cwd Games/voxel-mine dev",
        },
      }),
    );

    expect(registerRootGameScript(root, "probe-game")).toBe(true);
    const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    }).scripts;
    expect(scripts["games:probe-game"]).toBe("bun run --cwd Games/probe-game dev");
    const gameKeys = Object.keys(scripts).filter((key) => key.startsWith("games:"));
    expect(gameKeys).toEqual(["games:annals", "games:probe-game", "games:voxel-mine"]);

    expect(registerRootGameScript(root, "probe-game")).toBe(false);
  });
});
