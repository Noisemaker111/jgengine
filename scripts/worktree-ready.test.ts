import { describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ensureGameAssets, ensureLaneReady, gameAssetGaps } from "./worktree-ready";

const scratch = join(import.meta.dir, "..", ".scratch");

function write(path: string, body = ""): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
}

/** A main checkout with a complete install, and a bare worktree that has none. */
function bareWorktree(name: string): { base: string; main: string; target: string } {
  const base = join(scratch, name);
  rmSync(base, { recursive: true, force: true });
  const main = join(base, "main");
  const target = join(base, "wt");
  for (const root of [main, target]) {
    write(join(root, "bun.lock"), "lock-v1");
    write(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*", "apps/*"], dependencies: { three: "^0.1.0" } }));
    write(join(root, "apps", "dev", "package.json"), JSON.stringify({ name: "@jgengine/dev" }));
  }
  write(join(main, "node_modules", ".bin", "tsgo"));
  write(join(main, "node_modules", "three", "package.json"), "{}");
  write(join(main, "apps", "dev", "node_modules", ".bin", "vite"));
  mkdirSync(join(main, ".git", "worktrees", "wt"), { recursive: true });
  mkdirSync(join(main, "Games", "harbor-heat", "src"), { recursive: true });
  write(join(target, ".git"), `gitdir: ${join(main, ".git", "worktrees", "wt")}\n`);
  return { base, main, target };
}

describe("lane readiness in a tree made by a plain git worktree add", () => {
  test("links dependencies and Games, names the main checkout's commit, then goes quiet", () => {
    const { base, main, target } = bareWorktree("worktree-ready-link");
    try {
      const first = ensureLaneReady(target, { ignored: () => [] });
      expect(first.state).toBe("linked");
      expect(first.linked).toEqual(["node_modules", "apps/dev/node_modules", "Games"]);
      expect(first.message).toContain("linked node_modules, apps/dev/node_modules, Games");
      expect(first.message).toContain("git status unchanged");
      expect(realpathSync(join(target, "node_modules"))).toBe(realpathSync(join(main, "node_modules")));
      expect(realpathSync(join(target, "Games"))).toBe(realpathSync(join(main, "Games")));

      const second = ensureLaneReady(target, {
        ignored: () => {
          throw new Error("a ready tree must not list ignored files again");
        },
      });
      expect(second.state).toBe("ready");
      expect(second.message).toBe("");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("the main checkout itself is left alone and prints nothing", () => {
    const { base, main } = bareWorktree("worktree-ready-main");
    try {
      const outcome = ensureLaneReady(main);
      expect(outcome.state).toBe("main");
      expect(outcome.message).toBe("");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("refuses to link from a main checkout whose own install is half-finished", () => {
    const { base, main, target } = bareWorktree("worktree-ready-half");
    try {
      rmSync(join(main, "node_modules", "three"), { recursive: true, force: true });
      const outcome = ensureLaneReady(target, { ignored: () => [] });
      expect(outcome.state).toBe("broken");
      expect(outcome.problem).toContain("three");
      expect(outcome.fix).toContain("worktree:doctor --repair");
      expect(outcome.linked).toEqual([]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("game assets", () => {
  const sources = [
    { id: "kaykit-adventurers", kind: "model" },
    { id: "ambientcg-ground025", kind: "material" },
    { id: "kaykit-unused-pack", kind: "model" },
  ];

  function game(name: string): { base: string; games: string; dir: string } {
    const base = join(scratch, name);
    rmSync(base, { recursive: true, force: true });
    const games = join(base, "Games");
    const dir = join(games, "harbor-heat");
    write(join(dir, "src", "game", "models.ts"), 'const PACK = "kaykit-adventurers";\nconst URL = new URL("../../art/palm.glb", import.meta.url);\n');
    write(join(dir, "src", "game", "assets.ts"), 'const MATERIAL = "ambientcg-ground025";\n');
    write(join(dir, "public", "materials", "ambientcg-ground025", "map.png"), "png");
    write(join(dir, "src", "art", "palm.glb"), "glb");
    return { base, games, dir };
  }

  test("names the game and the missing directory instead of serving an empty scene", () => {
    const { base, games, dir } = game("game-assets-missing");
    try {
      rmSync(join(dir, "src", "art", "palm.glb"), { force: true });
      const gaps = gameAssetGaps(dir, sources);
      expect(gaps.map((gap) => gap.expected).sort()).toEqual([
        "public/models/kaykit-adventurers",
        "src/art/palm.glb",
      ]);

      const outcome = ensureGameAssets("harbor-heat", games, { sources });
      expect(outcome.ok).toBe(false);
      expect(outcome.message).toContain("harbor-heat");
      expect(outcome.message).toContain("public/models/kaykit-adventurers");
      expect(outcome.message).toContain("bun run provision harbor-heat");
      expect(outcome.message).toContain("needs the network");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("passes once the declared packs and art are on disk", () => {
    const { base, games, dir } = game("game-assets-ready");
    try {
      mkdirSync(join(dir, "public", "models", "kaykit-adventurers"), { recursive: true });
      write(join(dir, "public", "models", "kaykit-adventurers", "Rogue.glb"), "glb");
      const outcome = ensureGameAssets("harbor-heat", games, { sources });
      expect(outcome.ok).toBe(true);
      expect(outcome.message).toBe("");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("ignores packs the game never declares", () => {
    const { base, games } = game("game-assets-unused");
    try {
      mkdirSync(join(games, "harbor-heat", "public", "models", "kaykit-adventurers"), { recursive: true });
      write(join(games, "harbor-heat", "public", "models", "kaykit-adventurers", "Rogue.glb"), "glb");
      const outcome = ensureGameAssets("harbor-heat", games, { sources });
      expect(outcome.ok).toBe(true);
      expect(outcome.gaps).toEqual([]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
