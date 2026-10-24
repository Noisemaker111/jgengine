import { describe, expect, test } from "bun:test";

import { FRAME_GAMES, gameScope, isInertPath, REPRESENTATIVE_GAME, scopePattern, testsNeeded } from "./ci-scope";

describe("game scope", () => {
  test("a docs, skill or change-notes diff runs no game", () => {
    for (const path of ["README.md", "AGENTS.md", "changes/lane-ci-scope.md", ".claude/skills/workflow/SKILL.md"]) {
      expect(gameScope([path, "changes/other.md"]).scope).toBe("none");
    }
  });

  test("a test file runs no game: it ships nothing a game boots", () => {
    expect(gameScope(["packages/core/src/combat/damage.test.ts"]).scope).toBe("none");
    expect(gameScope(["packages/shell/src/render/sceneWarmupCover.test.ts"]).scope).toBe("none");
    expect(isInertPath("scripts/verify-fast.test.ts")).toBe(true);
  });

  test("frame work measures every reference game", () => {
    for (const path of [
      "packages/core/src/sim/population.ts",
      "packages/core/src/movement/characterController.ts",
      "packages/core/src/game/systemRuntime.ts",
      "packages/shell/src/render/SceneModels.tsx",
      "Games/harbor-heat/src/main.ts",
      ".github/workflows/ci.yml",
      "scripts/games-ref.txt",
      "scripts/perf-gate.ts",
      "CHANGELOG.md",
    ]) {
      expect(gameScope([path]).scope).toBe("full");
    }
    expect(gameScope(["packages/core/src/sim/population.ts"]).games).toEqual([...FRAME_GAMES]);
  });

  test("a shared surface boots the one representative game, not all eight", () => {
    for (const path of [
      "packages/react/src/gameMenu.tsx",
      "packages/core/src/combat/projectiles.ts",
      "packages/core/src/run/runLoop.ts",
      "packages/editor/src/CreatorApp.tsx",
      "packages/assets/models/crate.glb",
      "packages/navbake/src/bake.ts",
      "packages/rapier/src/world.ts",
      "packages/jgengine/src/index.ts",
      "apps/dev/src/main.tsx",
    ]) {
      const verdict = gameScope([path]);
      expect(verdict.scope).toBe("surface");
      expect(verdict.games).toEqual([REPRESENTATIVE_GAME]);
    }
  });

  test("a path the map has never seen measures every game rather than skipping", () => {
    expect(gameScope(["packages/brand-new/src/index.ts"]).scope).toBe("full");
    expect(gameScope(["tools/unknown/thing.ts"]).scope).toBe("full");
    // A dependency or compiler change reaches every package a game loads: one game boots it.
    expect(gameScope(["bun.lock"]).scope).toBe("surface");
  });

  test("a mixed diff takes the heaviest verdict", () => {
    expect(gameScope(["packages/react/src/hudTheme.ts", "packages/core/src/sim/population.ts"]).scope).toBe("full");
    expect(gameScope(["README.md", "packages/react/src/hudTheme.ts"]).scope).toBe("surface");
    expect(gameScope(["changes/a.md", "README.md"]).scope).toBe("none");
  });

  test("the matrix is never empty, so a skipped job still expands", () => {
    expect(gameScope(["README.md"]).games.length).toBeGreaterThan(0);
    expect(gameScope([]).games.length).toBeGreaterThan(0);
  });

  test("the local verify:fast pattern is the same list", () => {
    const pattern = scopePattern();
    expect(pattern.test("packages/react/src/gameMenu.tsx")).toBe(true);
    expect(pattern.test("packages/core/src/sim/population.ts")).toBe(true);
    expect(pattern.test("scripts/lookArg.ts")).toBe(false);
    expect(pattern.test("README.md")).toBe(false);
  });

  test("a verdict says what it decided and why", () => {
    expect(gameScope(["packages/react/src/gameMenu.tsx"]).reason).toContain("packages/react/src/gameMenu.tsx");
    expect(gameScope(["changes/a.md"]).reason).toContain("no runtime change");
  });
});

describe("test shards", () => {
  test("change notes and examples run no shard: no test reads them", () => {
    expect(testsNeeded(["changes/lane-ci-scope.md"])).toBe("none");
    expect(testsNeeded(["changes/a.md", "examples/x/README.md"])).toBe("none");
  });

  test("everything else keeps every shard", () => {
    for (const path of [
      "README.md",
      "AGENTS.md",
      ".claude/skills/workflow/SKILL.md",
      "packages/core/src/combat/damage.test.ts",
      "packages/shell/src/render/SceneModels.tsx",
      "scripts/land.ts",
    ]) {
      expect(testsNeeded([path])).toBe("all");
    }
    expect(testsNeeded([])).toBe("all");
  });

  test("a game verdict carries the shard verdict for the same diff", () => {
    expect(gameScope(["changes/a.md"]).tests).toBe("none");
    expect(gameScope(["changes/a.md", "README.md"]).tests).toBe("all");
  });
});
