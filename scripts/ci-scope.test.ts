import { describe, expect, test } from "bun:test";

import { gameScope, isInertPath, scopePattern } from "./ci-scope";

describe("game scope", () => {
  test("a docs, skill or change-notes diff skips the game matrix", () => {
    for (const path of ["README.md", "AGENTS.md", "changes/lane-ci-scope.md", ".claude/skills/workflow/SKILL.md"]) {
      expect(gameScope([path, "changes/other.md"]).scope).toBe("none");
    }
  });

  test("a test file skips the game matrix: it ships nothing a game boots", () => {
    expect(gameScope(["packages/core/src/combat/damage.test.ts"]).scope).toBe("none");
    expect(gameScope(["packages/shell/src/render/sceneWarmupCover.test.ts"]).scope).toBe("none");
    expect(isInertPath("scripts/verify-fast.test.ts")).toBe(true);
  });

  test("every package a game loads runs smoke and the frame budgets", () => {
    for (const path of [
      "packages/core/src/combat/projectiles.ts",
      "packages/core/src/run/runLoop.ts",
      "packages/shell/src/render/SceneModels.tsx",
      "packages/react/src/gameMenu.tsx",
      "packages/assets/models/crate.glb",
      "packages/navbake/src/bake.ts",
      "packages/rapier/src/world.ts",
      "packages/jgengine/src/index.ts",
      "Games/harbor-heat/src/main.ts",
      ".github/workflows/ci.yml",
      "scripts/games-ref.txt",
      "scripts/perf-gate.ts",
      "CHANGELOG.md",
    ]) {
      expect(gameScope([path]).scope).toBe("full");
    }
  });

  test("the editor boots every game but moves no game's budget", () => {
    expect(gameScope(["packages/editor/src/CreatorApp.tsx"]).scope).toBe("smoke");
    expect(gameScope(["packages/editor/src/CreatorApp.tsx", "changes/lane.md"]).scope).toBe("smoke");
    expect(gameScope(["packages/editor/src/CreatorApp.tsx", "packages/core/src/sim/population.ts"]).scope).toBe("full");
  });

  test("a path the map has never seen runs the full matrix rather than skipping", () => {
    expect(gameScope(["packages/brand-new/src/index.ts"]).scope).toBe("full");
    expect(gameScope(["tools/unknown/thing.ts"]).scope).toBe("full");
    expect(gameScope(["bun.lock"]).scope).toBe("full");
  });

  test("a mixed diff takes the heaviest verdict", () => {
    expect(gameScope(["README.md", "packages/react/src/hudTheme.ts"]).scope).toBe("full");
    expect(gameScope(["changes/a.md", "packages/editor/src/x.ts"]).scope).toBe("smoke");
  });

  test("the local verify:fast pattern is the same list", () => {
    const pattern = scopePattern();
    expect(pattern.test("packages/react/src/gameMenu.tsx")).toBe(true);
    expect(pattern.test("packages/editor/src/CreatorApp.tsx")).toBe(true);
    expect(pattern.test("scripts/lookArg.ts")).toBe(false);
    expect(pattern.test("README.md")).toBe(false);
  });

  test("a verdict says what it decided and why", () => {
    const verdict = gameScope(["packages/react/src/gameMenu.tsx", "README.md"]);
    expect(verdict.reason).toContain("packages/react/src/gameMenu.tsx");
    expect(gameScope(["changes/a.md"]).reason).toContain("no runtime change");
  });
});
