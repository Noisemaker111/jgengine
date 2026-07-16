/**
 * CUTLIST acceptance — structural checks on the shipped surface diet.
 * Drives real files and collectAdoption; fails if the cut regresses.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { collectAdoption } from "./apiAdoption";

const root = join(import.meta.dir, "..");

describe("CUTLIST surface diet", () => {
  test("orphan baseline is under 400", () => {
    const path = join(root, "scripts/api-orphan-baseline.json");
    expect(existsSync(path)).toBe(true);
    const orphans = JSON.parse(readFileSync(path, "utf8")) as string[];
    expect(Array.isArray(orphans)).toBe(true);
    expect(orphans.length).toBeLessThan(400);
  });

  test("core package root only re-exports version/changelog surface", () => {
    const src = readFileSync(join(root, "packages/core/src/index.ts"), "utf8");
    expect(src).toMatch(/\bVERSION\b/);
    expect(src).toMatch(/\bCHANGELOG\b/);
    expect(src).not.toMatch(/createGameRuntime/);
    expect(src).not.toMatch(/createWorldMirror/);
    expect(src).not.toMatch(/hostedGameRunner/);
    expect(src).not.toMatch(/from\s+["']\.\/runtime\//);
    // dist if built must match the same contract
    const dist = join(root, "packages/core/dist/index.js");
    if (existsSync(dist)) {
      const js = readFileSync(dist, "utf8");
      expect(js).not.toMatch(/createGameRuntime/);
      expect(js).toMatch(/VERSION|CHANGELOG/);
    }
  });

  test("desktop default game id is a tracked real game, not a missing id", () => {
    const desktop = readFileSync(join(root, "apps/desktop/src/main.tsx"), "utf8");
    expect(desktop).toMatch(/DEFAULT_GAME_ID\s*=\s*"studio-showcase"/);
    expect(desktop).not.toMatch(/"voxel-mine"/);
    const gamesDir = join(root, "Games");
    const tracked = readdirSync(gamesDir).filter((name) => {
      const pkg = join(gamesDir, name, "package.json");
      return existsSync(pkg) && statSync(join(gamesDir, name)).isDirectory();
    });
    expect(tracked).toContain("studio-showcase");
    expect(existsSync(join(gamesDir, "studio-showcase", "src", "index.tsx"))).toBe(true);
  });

  test("README sample uses createGameContext and a real games: script id", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    expect(readme).toMatch(/createGameContext/);
    expect(readme).toMatch(/games:studio-showcase/);
    expect(readme).not.toMatch(/createGameRuntime/);
    expect(readme).not.toMatch(/games:voxel-mine/);
  });

  test("orphan adoption counts packages/*/src cross-package imports", () => {
    const adoptionSrc = readFileSync(join(root, "scripts/apiAdoption.ts"), "utf8");
    expect(adoptionSrc).toMatch(/packages\/\*\/src\/\*\*\/\*\.ts/);
    // Real path: ws host imports createGameRuntime from core — must register as adopted.
    const adoption = collectAdoption(root);
    expect(adoption.names.has("createGameRuntime")).toBe(true);
    expect(adoption.names.has("createGameContext") || adoption.names.has("defineGame")).toBe(true);
  });

  test("skill routing omits tooling packages github and jgengine CLI", () => {
    const routing = readFileSync(join(root, "scripts/skillRouting.ts"), "utf8");
    // PACKAGE_SKILLS must not map github / jgengine CLI into skill api.md.
    const block = routing.slice(routing.indexOf("PACKAGE_SKILLS"), routing.indexOf("PACKAGE_DOMAIN_OVERRIDES"));
    expect(block).not.toMatch(/github\s*:/);
    expect(block).not.toMatch(/jgengine\s*:/);
    expect(block).toMatch(/shell\s*:/);
    expect(block).toMatch(/react\s*:/);
  });

  test("CRITIQUE-ACTIONS.md is the living backlog", () => {
    const path = join(root, "CRITIQUE-ACTIONS.md");
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toMatch(/## P0/);
    expect(text).toMatch(/H1/);
    expect(text).toMatch(/resolveAuthority|isPresenceOnly|boundActionDispatch/);
  });

  test("core package.json does not market ECS as a keyword", () => {
    const pkg = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8")) as {
      keywords?: string[];
    };
    expect(pkg.keywords ?? []).not.toContain("ecs");
  });
});
