import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { assetLinks, canLinkDeps, ensureWorktreeReady, linkAssets, linkDeps, mainCheckoutRoot, worktreeTarget } from "./agent-worktree";
import { tsgoBin } from "./checkout-ready";

describe("worktreeTarget", () => {
  test("places worktrees under the main checkout's .claude/worktrees", () => {
    const root = resolve("repo");
    expect(worktreeTarget(root, "ui-fix")).toEqual({ path: join(root, ".claude", "worktrees", "ui-fix") });
  });

  test("rejects names that could escape or are not plain", () => {
    for (const name of ["", "../x", "a/b", ".hidden", "x".repeat(65)]) {
      expect("error" in worktreeTarget("/repo", name)).toBe(true);
    }
  });
});

describe("linking a worktree to the main checkout", () => {
  let main: string;
  let target: string;
  const write = (path: string, body = ""): void => {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body);
  };

  beforeEach(() => {
    const base = mkdtempSync(join(tmpdir(), "agent-worktree-"));
    main = join(base, "main");
    target = join(base, "wt");
    for (const root of [main, target]) {
      write(join(root, "bun.lock"), "lock-v1");
      write(join(root, "packages", "core", "package.json"), "{}");
      write(join(root, "packages", "shell", "package.json"), "{}");
    }
    write(tsgoBin(main));
    mkdirSync(join(main, "packages", "shell", "node_modules", "@jgengine"), { recursive: true });
    symlinkSync("../../../core", join(main, "packages", "shell", "node_modules", "@jgengine", "core"));
    write(join(main, "packages", "shell", "node_modules", ".vite", "deps.json"));
  });

  afterEach(() => {
    rmSync(join(main, ".."), { recursive: true, force: true });
  });

  test("links only when the lockfile matches an installed main checkout", () => {
    expect(canLinkDeps(main, target)).toBe(true);
    writeFileSync(join(target, "bun.lock"), "lock-v2");
    expect(canLinkDeps(main, target)).toBe(false);
  });

  test("an install is the platform's own tsgo binary, so a Windows main checkout counts as installed", () => {
    rmSync(join(main, "node_modules", ".bin"), { recursive: true, force: true });
    // What `bun install` leaves on the other platform is not an install here.
    write(join(main, "node_modules", ".bin", process.platform === "win32" ? "tsgo" : "tsgo.exe"));
    expect(canLinkDeps(main, target)).toBe(false);
    write(tsgoBin(main));
    expect(canLinkDeps(main, target)).toBe(true);
  });

  test("shares the root store and copies workspace links so they point at the worktree's own packages", () => {
    expect(linkDeps(main, target)).toEqual(["node_modules", "packages/shell/node_modules"]);
    expect(realpathSync(join(target, "node_modules"))).toBe(realpathSync(join(main, "node_modules")));
    const link = join(target, "packages", "shell", "node_modules", "@jgengine", "core");
    expect(readlinkSync(link)).toBe(join("..", "..", "..", "core"));
    expect(realpathSync(link)).toBe(realpathSync(join(target, "packages", "core")));
    expect(existsSync(join(target, "packages", "shell", "node_modules", ".vite"))).toBe(false);
    expect(linkDeps(main, target)).toEqual([]);
  });

  test("links ignored dev-runner and game assets, never tracked or non-public paths", () => {
    mkdirSync(join(main, "apps", "dev", "public", "models", "pack"), { recursive: true });
    mkdirSync(join(main, "games", "beacon", "public", "models", "pack"), { recursive: true });
    const links = assetLinks(main, ["apps/dev/public/models/pack/", "games/beacon/public/models/pack/", "apps/dev/node_modules/", "apps/web/public/r/", "games/beacon/node_modules/"]);
    expect(links).toEqual(["apps/dev/public/models/pack", "games/beacon/public/models/pack"]);
    expect(linkAssets(main, target, links)).toEqual(links);
    expect(realpathSync(join(target, "games/beacon/public/models/pack"))).toBe(realpathSync(join(main, "games/beacon/public/models/pack")));
    expect(linkAssets(main, target, links)).toEqual([]);
  });

  test("relinks a dangling asset junction instead of leaving the tree unusable", () => {
    const rel = "apps/dev/public/models/pack";
    mkdirSync(join(main, rel), { recursive: true });
    mkdirSync(join(target, "apps", "dev", "public", "models"), { recursive: true });
    symlinkSync(join(main, "gone-checkout"), join(target, rel), "junction");
    expect(linkAssets(main, target, [rel])).toEqual([rel]);
    expect(realpathSync(join(target, rel))).toBe(realpathSync(join(main, rel)));
  });
});

describe("readiness for a worktree nobody linked", () => {
  let base: string;
  let main: string;
  let target: string;
  const write = (path: string, body = ""): void => {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body);
  };

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "agent-ready-"));
    main = join(base, "main");
    target = join(base, "wt");
    for (const root of [main, target]) {
      write(join(root, "bun.lock"), "lock-v1");
      write(join(root, "packages", "core", "package.json"), "{}");
    }
    write(tsgoBin(main));
    mkdirSync(join(main, ".git", "worktrees", "wt"), { recursive: true });
    mkdirSync(join(main, "apps", "dev", "public", "models", "pack"), { recursive: true });
    // `git worktree add` writes `.git` as a file; that is the only marker this needs.
    write(join(target, ".git"), `gitdir: ${join(main, ".git", "worktrees", "wt")}\n`);
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  const ignored = (): string[] => ["apps/dev/public/models/pack/"];

  test("finds the main checkout from the .git file and only for linked worktrees", () => {
    expect(mainCheckoutRoot(target)).toBe(main);
    expect(mainCheckoutRoot(main)).toBeNull();
    write(join(base, "plain", "package.json"), "{}");
    expect(mainCheckoutRoot(join(base, "plain"))).toBeNull();
  });

  test("a bare worktree gets dependencies and the asset links, and a second call changes nothing", () => {
    const first = ensureWorktreeReady(target, { ignored });
    expect(first).toMatchObject({ installed: false, unchanged: false, assets: ["apps/dev/public/models/pack"] });
    expect(first?.deps).toContain("node_modules");
    expect(existsSync(tsgoBin(target))).toBe(true);
    expect(realpathSync(join(target, "apps/dev/public/models/pack"))).toBe(realpathSync(join(main, "apps/dev/public/models/pack")));

    const second = ensureWorktreeReady(target, { ignored: () => { throw new Error("second call must not list ignored files"); } });
    expect(second).toMatchObject({ unchanged: true, deps: [], assets: [] });
  });

  test("installs only when the locks differ, and links nothing from the stale store", () => {
    writeFileSync(join(target, "bun.lock"), "lock-v2");
    mkdirSync(join(target, "node_modules", ".bin"), { recursive: true });
    writeFileSync(tsgoBin(target), "");
    rmSync(join(target, "node_modules"), { recursive: true, force: true });
    let installed = 0;
    const result = ensureWorktreeReady(target, {
      ignored,
      install: (dir) => {
        installed += 1;
        expect(dir).toBe(target);
        write(tsgoBin(target));
      },
    });
    expect(installed).toBe(1);
    expect(result).toMatchObject({ installed: true, deps: [] });
  });

  test("a linked tree whose lock moved on gets its own install, and the main store is untouched", () => {
    expect(ensureWorktreeReady(target, { ignored })?.deps).toContain("node_modules");
    writeFileSync(join(target, "bun.lock"), "lock-v2");
    let installed = 0;
    const result = ensureWorktreeReady(target, {
      ignored,
      install: () => {
        installed += 1;
        expect(lstatSync(join(target, "node_modules"), { throwIfNoEntry: false })).toBeUndefined();
        write(tsgoBin(target));
      },
    });
    expect(installed).toBe(1);
    expect(result).toMatchObject({ installed: true, deps: [] });
    expect(lstatSync(join(target, "node_modules")).isSymbolicLink()).toBe(false);
    expect(existsSync(tsgoBin(main))).toBe(true);
  });

  test("the main checkout itself is left alone", () => {
    expect(ensureWorktreeReady(main)).toBeNull();
  });
});
