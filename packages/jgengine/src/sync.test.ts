import { describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCreate } from "./create";
import { cliVersion, sdkVersion } from "./pkg";
import { readProjectConfig, renderProjectConfig } from "./projectConfig";
import { applySync, planSync, type SyncContext } from "./sync";

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
    const manifest = JSON.parse(manifestWrite!.contents) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
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
    expect((JSON.parse(writes[0]!.contents) as { dependencies: Record<string, string> }).dependencies["@jgengine/ws"]).toBe(`^${sdkVersion()}`);
  });

  test("rejects a config that turns the editor on without its package", async () => {
    const dir = await createdGame();
    editConfig(dir, (config) => {
      config.engine = config.engine.filter((name) => name !== "editor");
    });
    expect(() => planSync(dir, standalone)).toThrow('"editor": true needs "editor" in "engine"');
  });
});
