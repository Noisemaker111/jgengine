import { describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCreate } from "./create";
import { cliVersion, sdkVersion } from "./pkg";
import { readProjectConfig, renderProjectConfig } from "./projectConfig";
import { applySync, planSync, runSync, type SyncContext } from "./sync";

const standalone: SyncContext = { variant: "standalone", engineVersion: sdkVersion(), cliVersion: cliVersion() };

async function createdGame(...flags: string[]): Promise<string> {
  // fixture-location: allow a standalone game must sit outside every workspace, and sync reads plain files
  const parent = mkdtempSync(join(tmpdir(), "jgengine-sync-"));
  const log = spyOn(console, "log").mockImplementation(() => {});
  try {
    expect(await runCreate([join(parent, "Sync Probe"), "--standalone", "--no-install", "--no-skills", "--no-assets", ...flags])).toBe(0);
  } finally {
    log.mockRestore();
  }
  return join(parent, "Sync-Probe");
}

function editConfig(dir: string, change: (config: ReturnType<typeof readProjectConfig>) => void): void {
  const config = readProjectConfig(dir);
  change(config);
  writeFileSync(join(dir, "jgengine.json"), renderProjectConfig(config));
}

describe("jgengine sync", () => {
  test("a freshly created game is already in sync", async () => {
    const dir = await createdGame();
    expect(readProjectConfig(dir)).toMatchObject({ name: "Sync Probe", id: "sync-probe", template: "3d", editor: true });
    expect(planSync(dir, standalone)).toEqual([]);
  });

  test("editing jgengine.json changes the game, then sync is a no-op", async () => {
    const dir = await createdGame();
    editConfig(dir, (config) => {
      config.name = "Renamed Probe";
      config.editor = false;
      config.engine = config.engine.filter((name) => name !== "editor");
    });
    const writes = planSync(dir, standalone);
    expect(writes.map((write) => write.path).sort()).toEqual(["AGENTS.md", "index.html", "package.json", "src/index.css", "src/index.tsx", "src/main.tsx"]);
    applySync(dir, writes);
    expect(readFileSync(join(dir, "index.html"), "utf8")).toContain("<title>Renamed Probe</title>");
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect(manifest.dependencies["@jgengine/editor"]).toBeUndefined();
    expect(readFileSync(join(dir, "src", "main.tsx"), "utf8")).not.toContain("@jgengine/editor");
    expect(planSync(dir, standalone)).toEqual([]);
  });

  test("a newer engine moves the @jgengine pins and the CLI", async () => {
    const dir = await createdGame("--template", "2d");
    const writes = planSync(dir, { ...standalone, engineVersion: "99.0.0", cliVersion: "99.0.1" });
    const manifestWrite = writes.find((write) => write.path === "package.json");
    const manifest = JSON.parse(manifestWrite!.contents!) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(manifest.dependencies["@jgengine/core"]).toBe("^99.0.0");
    expect(manifest.devDependencies["@jgengine/node"]).toBe("^99.0.0");
    expect(manifest.devDependencies.jgengine).toBe("99.0.1");
  });

  test("a file the game owns is left alone", async () => {
    const dir = await createdGame();
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>Mine</title>\n");
    expect(planSync(dir, standalone).map((write) => write.path)).toEqual(["index.html"]);
    editConfig(dir, (config) => {
      config.owns = ["index.html"];
    });
    expect(planSync(dir, standalone)).toEqual([]);
  });

  test("a game with no template keeps its files and syncs its engine packages", async () => {
    const dir = await createdGame();
    editConfig(dir, (config) => {
      delete config.template;
      delete config.editor;
      config.engine = [...config.engine, "ws"];
    });
    writeFileSync(join(dir, "index.html"), "custom\n");
    const writes = planSync(dir, standalone);
    expect(writes.map((write) => write.path)).toEqual(["package.json"]);
    expect((JSON.parse(writes[0]!.contents!) as { dependencies: Record<string, string> }).dependencies["@jgengine/ws"]).toBe(`^${sdkVersion()}`);
  });

  test("rejects a config that turns the editor on without its package", async () => {
    const dir = await createdGame();
    editConfig(dir, (config) => {
      config.engine = config.engine.filter((name) => name !== "editor");
    });
    expect(() => planSync(dir, standalone)).toThrow('"editor": true needs "editor" in "engine"');
  });

  test("a game from an older scaffold loses its harness copies and runs the CLI's shoot and drive", async () => {
    const dir = await createdGame();
    mkdirSync(join(dir, "scripts"), { recursive: true });
    for (const file of ["browser.mjs", "shoot.mjs", "drive.mjs"]) writeFileSync(join(dir, "scripts", file), "// old copy\n");
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { scripts: Record<string, string> };
    manifest.scripts.shoot = "node scripts/shoot.mjs";
    manifest.scripts.drive = "node scripts/drive.mjs";
    writeFileSync(join(dir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const writes = planSync(dir, standalone);
    expect(writes.map((write) => write.path).sort()).toEqual(["package.json", "scripts/browser.mjs", "scripts/drive.mjs", "scripts/shoot.mjs"]);
    applySync(dir, writes);
    expect(existsSync(join(dir, "scripts"))).toBe(false);
    const after = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(after.scripts.shoot).toBe("jgengine shoot");
    expect(after.scripts.drive).toBe("jgengine drive");
    expect(planSync(dir, standalone)).toEqual([]);
  });

  test("a game whose vite.config.ts predates the .jgengine/ watch ignore gets it from sync", async () => {
    const dir = await createdGame();
    writeFileSync(join(dir, "vite.config.ts"), "export default {};\n");
    const writes = planSync(dir, standalone);
    expect(writes.map((write) => write.path)).toEqual(["vite.config.ts"]);
    applySync(dir, writes);
    expect(readFileSync(join(dir, "vite.config.ts"), "utf8")).toContain('ignored: ["**/.jgengine/**"]');
    expect(planSync(dir, standalone)).toEqual([]);
  });
});

describe("jgengine sync at a workspace root", () => {
  async function workspace(catalog: Record<string, string>): Promise<{ root: string; game: string }> {
    // fixture-location: allow a user's workspace must sit outside the engine's own workspace
    const root = mkdtempSync(join(tmpdir(), "jgengine-sync-root-"));
    writeFileSync(
      join(root, "package.json"),
      `${JSON.stringify({ name: "studio", private: true, workspaces: { packages: ["games/*"], catalog } }, null, 2)}\n`,
    );
    mkdirSync(join(root, "games"));
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await runCreate([join(root, "games", "Root Game"), "--standalone", "--no-install", "--no-skills", "--no-assets"])).toBe(0);
    } finally {
      log.mockRestore();
    }
    const game = join(root, "games", "Root-Game");
    const manifest = JSON.parse(readFileSync(join(game, "package.json"), "utf8")) as { dependencies: Record<string, string> };
    for (const name of Object.keys(manifest.dependencies)) if (name.startsWith("@jgengine/")) manifest.dependencies[name] = "catalog:";
    writeFileSync(join(game, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return { root, game };
  }

  async function quietly(run: () => Promise<number>): Promise<{ code: number; out: string }> {
    const lines: string[] = [];
    const log = spyOn(console, "log").mockImplementation((line: unknown) => void lines.push(String(line)));
    const error = spyOn(console, "error").mockImplementation((line: unknown) => void lines.push(String(line)));
    try {
      return { code: await run(), out: lines.join("\n") };
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  }

  test("moves the root catalog's pins to this engine, keeps each game's catalog: declarations, and --check sees it", async () => {
    const { root, game } = await workspace({ "@jgengine/core": "^0.1.0", "@jgengine/react": "0.1.0", react: "19.2.3" });
    const before = readFileSync(join(root, "package.json"), "utf8");
    const checked = await quietly(() => runSync([root, "--check"]));
    expect(checked.code).toBe(1);
    expect(checked.out).toContain("out of date");
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);

    const synced = await quietly(() => runSync([root]));
    expect(synced.code).toBe(0);
    expect(synced.out).toContain(`@jgengine 0.1.0 → ${sdkVersion()}`);
    const catalog = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { workspaces: { catalog: Record<string, string> } }).workspaces.catalog;
    expect(catalog).toEqual({ "@jgengine/core": `^${sdkVersion()}`, "@jgengine/react": sdkVersion(), react: "19.2.3" });
    const manifest = JSON.parse(readFileSync(join(game, "package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect(manifest.dependencies["@jgengine/core"]).toBe("catalog:");
    expect((await quietly(() => runSync([root, "--check"]))).code).toBe(0);
  });

  test("refuses to move a catalog pin newer than this engine", async () => {
    const { root } = await workspace({ "@jgengine/core": "^99.0.0" });
    const before = readFileSync(join(root, "package.json"), "utf8");
    const run = await quietly(() => runSync([root]));
    expect(run.code).toBe(1);
    expect(run.out).toContain("refusing a downgrade");
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
  });
});
