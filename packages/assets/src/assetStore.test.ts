import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { assetStoreRoot, linkFromStore, mainCheckoutOf, provisionJobs, seedCandidates, seedStore } from "./assetStore";

const scratch = join(import.meta.dir, "../../../.scratch");
mkdirSync(scratch, { recursive: true });

/** A throwaway checkout: its own `.git`, so the links it makes never reach this repository's exclude file. */
function tree(): string {
  const root = mkdtempSync(join(scratch, "jg-asset-store-"));
  mkdirSync(join(root, ".git", "info"), { recursive: true });
  return root;
}

function git(cwd: string, ...args: string[]): string {
  const run = Bun.spawnSync({ cmd: ["git", ...args], cwd, timeout: 30_000, stdout: "pipe", stderr: "pipe" });
  return run.stdout.toString();
}

describe("store links stay out of git", () => {
  test("a linked pack is not listed as new, in the main checkout or a worktree", () => {
    const root = mkdtempSync(join(scratch, "jg-asset-store-git-"));
    try {
      const repo = join(root, "repo");
      mkdirSync(repo, { recursive: true });
      git(repo, "init", "-q");
      git(repo, "-c", "user.email=t@example.test", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "start");
      const store = join(root, "store", "fonts");
      mkdirSync(store, { recursive: true });
      writeFileSync(join(store, "inter.woff2"), "font");

      expect(linkFromStore(store, join(repo, "games", "mine", "public", "fonts"))).toBe(true);
      expect(git(repo, "status", "--porcelain", "--untracked-files=all")).toBe("");

      const lane = join(root, "lane");
      git(repo, "worktree", "add", "-q", "--detach", lane);
      expect(linkFromStore(store, join(lane, "games", "other", "public", "fonts"))).toBe(true);
      expect(git(lane, "status", "--porcelain", "--untracked-files=all")).toBe("");

      // Linking again adds no second line.
      linkFromStore(store, join(repo, "games", "mine", "public", "fonts"));
      const lines = readFileSync(join(repo, ".git", "info", "exclude"), "utf8").split("\n").filter((line) => line.includes("public/fonts"));
      expect(lines).toEqual(["/games/mine/public/fonts", "/games/other/public/fonts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

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

  // On 2026-11-12 a boat host's store held 45 of a pack's 73 models: the pack grew after the host
  // pulled it, and a store with any file counted as having the pack, so it was never pulled again.
  test("a pack that grew after it was pulled is pulled again, and the game then serves every model", async () => {
    const root = tree();
    try {
      const game = join(root, "games", "mine");
      mkdirSync(join(game, "public"), { recursive: true });
      const store = join(root, "store");
      mkdirSync(join(store, "models", "toon"), { recursive: true });
      writeFileSync(join(store, "models", "toon", "Old.glb"), "old");
      const pulls: string[] = [];
      const job = { target: "toon", dir: join("models", "toon"), files: ["Old.glb", "Sign.glb"] };
      const options = {
        env: { JG_ASSET_STORE: store },
        log: () => {},
        pull: async (target: string, outRoot: string) => {
          pulls.push(target);
          for (const file of ["Old.glb", "Sign.glb"]) writeFileSync(join(outRoot, "models", target, file), "glb");
          return true;
        },
      };
      expect(await provisionJobs(game, [job], options)).toEqual({ linked: ["toon"], pulled: ["toon"], failed: [], absent: [] });
      expect(readFileSync(join(game, "public", "models", "toon", "Sign.glb"), "utf8")).toBe("glb");
      expect(await provisionJobs(game, [job], options)).toEqual({ linked: ["toon"], pulled: [], failed: [], absent: [] });
      expect(pulls).toEqual(["toon"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a pull that still leaves files of the index missing is reported, not taken as done", async () => {
    const root = tree();
    try {
      const game = join(root, "games", "mine");
      mkdirSync(join(game, "public"), { recursive: true });
      const store = join(root, "store");
      const result = await provisionJobs(game, [{ target: "toon", dir: join("models", "toon"), files: ["Old.glb", "Gone.glb"] }], {
        env: { JG_ASSET_STORE: store },
        log: () => {},
        pull: async (target, outRoot) => {
          mkdirSync(join(outRoot, "models", target), { recursive: true });
          writeFileSync(join(outRoot, "models", target, "Old.glb"), "glb");
          return true;
        },
      });
      expect(result.failed).toEqual(["toon"]);
      expect(result.linked).toEqual(["toon"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
