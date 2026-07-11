import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerRootGameScript, writeGame } from "./create";
import { diagnose } from "./doctor";
import { parseCreateName } from "./templates";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "jgengine-create-"));
}

describe("parseCreateName", () => {
  test("display name becomes Title-Dash folder and kebab package id", () => {
    expect(parseCreateName("My Game Name")).toEqual({
      displayName: "My Game Name",
      folderName: "My-Game-Name",
      id: "my-game-name",
    });
  });

  test("kebab input title-cases the display name and keeps the folder", () => {
    expect(parseCreateName("maze-muncher")).toEqual({
      displayName: "Maze Muncher",
      folderName: "maze-muncher",
      id: "maze-muncher",
    });
  });

  test("collapses whitespace", () => {
    expect(parseCreateName("  Cool   World  ")).toEqual({
      displayName: "Cool World",
      folderName: "Cool-World",
      id: "cool-world",
    });
  });
});

describe("writeGame", () => {
  test("scaffolds a standalone game that doctor signs off on", () => {
    const dir = join(scratch(), "probe-game");
    writeGame(dir, "probe-game", "Probe Game", "standalone");

    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "src", "game", "ui", "GameUI.tsx"))).toBe(true);
    expect(readFileSync(join(dir, "src", "game.config.ts"), "utf8")).toContain('name: "Probe Game"');

    mkdirSync(join(dir, "node_modules", "@jgengine", "core"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "@jgengine", "core", "package.json"), '{"version":"0.8.0"}');

    const failures = diagnose(dir).filter((finding) => !finding.ok);
    expect(failures).toEqual([]);
  });

  test("display name supersedes into config, HUD, and HTML title", () => {
    const dir = join(scratch(), "My-Game-Name");
    writeGame(dir, "my-game-name", "My Game Name", "standalone");
    expect(readFileSync(join(dir, "src", "game.config.ts"), "utf8")).toContain('name: "My Game Name"');
    expect(readFileSync(join(dir, "src", "game", "ui", "GameUI.tsx"), "utf8")).toContain("My Game Name");
    expect(readFileSync(join(dir, "index.html"), "utf8")).toContain("<title>My Game Name</title>");
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name: string };
    expect(pkg.name).toBe("my-game-name");
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

  test("cwd uses the folder name when it differs from the package id", () => {
    const root = scratch();
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture-root", scripts: {} }));
    expect(registerRootGameScript(root, "my-game-name", "My-Game-Name")).toBe(true);
    const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    }).scripts;
    expect(scripts["games:my-game-name"]).toBe("bun run --cwd Games/My-Game-Name dev");
  });
});
