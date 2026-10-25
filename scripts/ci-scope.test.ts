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
      ".github/workflows/ci.yml",
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
      "packages/core/src/run/sessionLoop.ts",
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

describe("games in this repo", () => {
  const workspace = {
    games: [
      { id: "harbor-heat", engine: ["core", "shell", "react"] },
      { id: "fernwild", engine: ["core", "shell"] },
      { id: "llmville", engine: ["core", "convex"] },
    ],
  };

  test("a change inside a reference game measures that game only", () => {
    const verdict = gameScope(["games/harbor-heat/src/main.ts"], workspace);
    expect(verdict.scope).toBe("surface");
    expect(verdict.games).toEqual(["harbor-heat"]);
    expect(verdict.gameChecks).toEqual(["harbor-heat"]);
  });

  test("a game outside the frame set runs its checks and no frame budget", () => {
    const verdict = gameScope(["games/fernwild/src/game/garden.ts"], workspace);
    expect(verdict.scope).toBe("none");
    expect(verdict.gameChecks).toEqual(["fernwild"]);
  });

  test("an engine package change checks every game that declares it", () => {
    expect(gameScope(["packages/convex/src/index.ts"], workspace).gameChecks).toEqual(["llmville"]);
    expect(gameScope(["packages/shell/src/render/SceneModels.tsx"], workspace).gameChecks).toEqual(["fernwild", "harbor-heat"]);
    expect(gameScope(["packages/core/src/combat/damage.test.ts"], workspace).gameChecks).toEqual([]);
  });

  test("what every game resolves checks every game", () => {
    for (const path of ["bun.lock", "games/shared/viteEngineSource.ts", "games/scripts/framework-check.ts", "tsconfig.base.json"]) {
      expect(gameScope([path], workspace).gameChecks).toEqual(["fernwild", "harbor-heat", "llmville"]);
    }
    expect(gameScope(["games/shared/viteEngineSource.ts"], workspace).scope).toBe("full");
  });

  test("prose and engine tooling check no game", () => {
    expect(gameScope(["README.md", "scripts/lane-close.ts"], workspace).gameChecks).toEqual([]);
    expect(gameScope(["games/docs/new-game.md"], workspace).scope).toBe("none");
  });
});
