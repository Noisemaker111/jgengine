import { describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readPromotedScene, registerRootGameScript, runCreate, writeGame } from "./create";
import { diagnose } from "./doctor";
import { cliVersion, sdkVersion } from "./pkg";
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

  test("writeGame options thread through: --world adds world modules, --no-editor drops scene files", () => {
    const worldDir = join(scratch(), "world-game");
    writeGame(worldDir, "world-game", "World Game", "standalone", undefined, { world: true });
    expect(existsSync(join(worldDir, "src", "world.ts"))).toBe(true);
    expect(existsSync(join(worldDir, "src", "game", "models.ts"))).toBe(true);

    const hudDir = join(scratch(), "hud-game");
    writeGame(hudDir, "hud-game", "Hud Game", "standalone", undefined, { editor: false });
    expect(existsSync(join(hudDir, "src", "editor.scene.json"))).toBe(false);
    expect(existsSync(join(hudDir, "src", "editorLayers.ts"))).toBe(false);
    expect(readFileSync(join(hudDir, "src", "main.tsx"), "utf8")).not.toContain("editor=");
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

  test("standalone scaffold pins @jgengine/* deps to a caret range on the resolved sdk version", () => {
    const dir = join(scratch(), "caret-game");
    writeGame(dir, "caret-game", "Caret Game", "standalone");
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    const version = sdkVersion();
    expect(pkg.dependencies["@jgengine/core"]).toBe(`^${version}`);
    expect(pkg.dependencies["@jgengine/assets"]).toBe(`^${version}`);
  });
});

describe("runCreate", () => {
  test("prints the resolved sdk version scaffolded for standalone games", () => {
    const target = join(scratch(), "Version Probe");
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = runCreate([target, "--standalone", "--no-install", "--no-skills"]);
      expect(code).toBe(0);
      const lines = log.mock.calls.map((call) => String(call[0]));
      expect(lines).toContain(`  scaffolding @jgengine/* ^${sdkVersion()} (jgengine CLI ${cliVersion()})`);
    } finally {
      log.mockRestore();
    }
  });
});

describe("readPromotedScene", () => {
  test("reads editor.scene.json from a folder and keeps its authored spawn", () => {
    const dir = scratch();
    writeFileSync(
      join(dir, "editor.scene.json"),
      JSON.stringify({
        version: 1,
        markers: [
          { id: "player_spawn", kind: "player_spawn", position: { x: 5, y: 0, z: 5 } },
          { id: "rock", kind: "prop", position: { x: 1, y: 0, z: 1 }, catalogId: "rock" },
        ],
      }),
    );

    const scene = readPromotedScene(dir);
    const spawn = scene.markers?.find((marker) => marker.kind === "player_spawn");
    expect(spawn?.position).toEqual({ x: 5, y: 0, z: 5 });
    expect(scene.markers).toHaveLength(2);
  });

  test("injects a spawn at the origin when the authored scene has none", () => {
    const file = join(scratch(), "authored.json");
    writeFileSync(file, JSON.stringify({ markers: [{ id: "obelisk", kind: "prop", position: { x: 2, y: 0, z: 2 } }] }));

    const scene = readPromotedScene(file);
    const spawn = scene.markers?.find((marker) => marker.kind === "player_spawn");
    expect(spawn?.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(scene.markers).toHaveLength(2);
  });

  test("errors clearly when the folder has no editor.scene.json", () => {
    expect(() => readPromotedScene(scratch())).toThrow(/no editor\.scene\.json/);
  });

  test("errors clearly on malformed JSON", () => {
    const file = join(scratch(), "broken.json");
    writeFileSync(file, "{ not json");
    expect(() => readPromotedScene(file)).toThrow(/not valid JSON/);
  });
});

describe("writeGame from a promoted scene", () => {
  test("bakes the authored scene into editor.scene.json and a passing scene test", () => {
    const src = scratch();
    writeFileSync(
      join(src, "editor.scene.json"),
      JSON.stringify({
        version: 1,
        markers: [
          { id: "player_spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 12 } },
          { id: "totem", kind: "prop", position: { x: 3, y: 0, z: 0 }, catalogId: "totem" },
        ],
      }),
    );

    const dir = join(scratch(), "promoted-game");
    writeGame(dir, "promoted-game", "Promoted Game", "standalone", readPromotedScene(src));

    const baked = JSON.parse(readFileSync(join(dir, "src", "editor.scene.json"), "utf8")) as {
      markers: { id: string; position: { z: number } }[];
    };
    expect(baked.markers.find((marker) => marker.id === "player_spawn")?.position.z).toBe(12);

    // A scene with no win-goal must not generate the goal assertion (it would fail).
    const test = readFileSync(join(dir, "src", "editorLayers.test.ts"), "utf8");
    expect(test).toContain("player_spawn marker the runtime honors");
    expect(test).not.toContain("wins on enter");
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
