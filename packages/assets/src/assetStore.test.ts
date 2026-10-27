import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { assetStoreRoot, linkFromStore, mainCheckoutOf, provisionJobs, seedCandidates, seedStore } from "./assetStore";

const scratch = join(import.meta.dir, "../../../.scratch");
mkdirSync(scratch, { recursive: true });

function tree(): string {
  return mkdtempSync(join(scratch, "jg-asset-store-"));
}

describe("the shared asset store", () => {
  test("a worktree resolves the store beside its main checkout; JG_ASSET_STORE moves it", () => {
    const main = tree();
    try {
      mkdirSync(join(main, ".git", "worktrees", "lane"), { recursive: true });
      const worktree = join(main, ".claude", "worktrees", "lane");
      mkdirSync(worktree, { recursive: true });
      writeFileSync(join(worktree, ".git"), `gitdir: ${join(main, ".git", "worktrees", "lane")}\n`);
      expect(mainCheckoutOf(worktree)).toBe(main);
      expect(mainCheckoutOf(main)).toBeNull();
      expect(assetStoreRoot(worktree, {})).toBe(join(main, ".asset-store"));
      expect(assetStoreRoot(main, {})).toBe(join(main, ".asset-store"));
      expect(assetStoreRoot(worktree, { JG_ASSET_STORE: join(main, "elsewhere") })).toBe(join(main, "elsewhere"));
    } finally {
      rmSync(main, { recursive: true, force: true });
    }
  });

  test("seeds from a pack a checkout already pulled, then links the game to it", () => {
    const root = tree();
    try {
      const pulled = join(root, "games", "other", "public", "models", "pack");
      mkdirSync(pulled, { recursive: true });
      writeFileSync(join(pulled, "a.glb"), "glb");
      const store = join(root, ".asset-store", "models", "pack");
      expect(seedStore(store, seedCandidates([root], join("models", "pack")))).toBe(true);
      expect(readFileSync(join(store, "a.glb"), "utf8")).toBe("glb");

      const empty = join(root, "games", "mine", "public", "models", "pack");
      mkdirSync(empty, { recursive: true });
      expect(linkFromStore(store, empty)).toBe(true);
      expect(lstatSync(empty).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(empty, "a.glb"), "utf8")).toBe("glb");
      // Idempotent: a linked path is left as it is.
      expect(linkFromStore(store, empty)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an empty store links nothing and seeds nothing", () => {
    const root = tree();
    try {
      const store = join(root, ".asset-store", "models", "none");
      expect(seedStore(store, seedCandidates([root], join("models", "none")))).toBe(false);
      expect(linkFromStore(store, join(root, "public", "models", "none"))).toBe(false);
      expect(existsSync(join(root, "public", "models", "none"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("provisionJobs pulls into the store only what no checkout has, then links it; a failed pull is reported", async () => {
    const root = tree();
    try {
      const game = join(root, "games", "mine");
      mkdirSync(join(game, "public"), { recursive: true });
      const store = join(root, "store");
      const pulls: string[] = [];
      const result = await provisionJobs(game, [{ target: "fresh", dir: join("models", "fresh") }, { target: "broken", dir: join("models", "broken") }], {
        env: { JG_ASSET_STORE: store },
        log: () => {},
        pull: async (target, outRoot) => {
          pulls.push(target);
          if (target === "broken") return false;
          mkdirSync(join(outRoot, "models", target), { recursive: true });
          writeFileSync(join(outRoot, "models", target, "a.glb"), "glb");
          return true;
        },
      });
      expect(pulls).toEqual(["fresh", "broken"]);
      expect(result).toEqual({ linked: ["fresh"], pulled: ["fresh"], failed: ["broken"], absent: [] });
      expect(readFileSync(join(game, "public", "models", "fresh", "a.glb"), "utf8")).toBe("glb");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
