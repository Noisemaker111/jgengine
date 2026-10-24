import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { assetLinks, canLinkDeps, linkAssets, linkDeps, worktreeTarget } from "./agent-worktree";

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
    write(join(main, "node_modules", ".bin", "tsgo"));
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

  test("shares the root store and copies workspace links so they point at the worktree's own packages", () => {
    expect(linkDeps(main, target)).toEqual(["node_modules", "packages/shell/node_modules"]);
    expect(realpathSync(join(target, "node_modules"))).toBe(realpathSync(join(main, "node_modules")));
    const link = join(target, "packages", "shell", "node_modules", "@jgengine", "core");
    expect(readlinkSync(link)).toBe(join("..", "..", "..", "core"));
    expect(realpathSync(link)).toBe(realpathSync(join(target, "packages", "core")));
    expect(existsSync(join(target, "packages", "shell", "node_modules", ".vite"))).toBe(false);
    expect(linkDeps(main, target)).toEqual([]);
  });

  test("links Games and ignored dev-runner assets, never tracked or non-public paths", () => {
    mkdirSync(join(main, "Games", "beacon"), { recursive: true });
    mkdirSync(join(main, "apps", "dev", "public", "models", "pack"), { recursive: true });
    const links = assetLinks(main, ["apps/dev/public/models/pack/", "apps/dev/node_modules/", "apps/web/public/r/"]);
    expect(links).toEqual(["Games", "apps/dev/public/models/pack"]);
    expect(linkAssets(main, target, links)).toEqual(links);
    expect(lstatSync(join(target, "Games")).isSymbolicLink()).toBe(true);
    expect(realpathSync(join(target, "apps/dev/public/models/pack"))).toBe(realpathSync(join(main, "apps/dev/public/models/pack")));
    expect(linkAssets(main, target, links)).toEqual([]);
  });
});
