import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ensureGames, pinnedRef } from "./ensure-games";

const roots: string[] = [];

function scratch(name: string): string {
  const root = join(import.meta.dir, "..", ".scratch", `${name}-${randomUUID().slice(0, 8)}`);
  roots.push(root);
  mkdirSync(root, { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe", timeout: 60_000 });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

/**
 * A games repo with two commits and a clone of its first one, which is the state
 * every stale-checkout bug started from: `Games/` on the old commit, pin ahead.
 */
function staleClone(): { source: string; root: string; old: string; next: string } {
  const source = scratch("games-source");
  git(source, ["init", "--quiet", "-b", "stable"]);
  git(source, ["config", "uploadpack.allowAnySHA1InWant", "true"]);
  git(source, ["-c", "user.email=a@b", "-c", "user.name=a", "commit", "--allow-empty", "-m", "one"]);
  const old = git(source, ["rev-parse", "HEAD"]);
  writeFileSync(join(source, "GAME.md"), "one\n");
  git(source, ["add", "."]);
  git(source, ["-c", "user.email=a@b", "-c", "user.name=a", "commit", "-m", "two"]);
  const next = git(source, ["rev-parse", "HEAD"]);

  const root = scratch("games-checkout");
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "games-ref.txt"), `${next}\n`);
  git(root, ["clone", "--quiet", source, "Games"]);
  git(join(root, "Games"), ["checkout", "--quiet", "--detach", old]);
  return { source, root, old, next };
}

describe("pinnedRef", () => {
  test("reads the SHA the repo pins, and refuses one that is not a commit", () => {
    const root = scratch("games-pin");
    mkdirSync(join(root, "scripts"), { recursive: true });
    const sha = "7fe11849dcb84f04f0c564ecd9c77cb1aed22da5";
    writeFileSync(join(root, "scripts", "games-ref.txt"), `${sha}\n`);
    expect(pinnedRef(root, "")).toBe(sha);
    writeFileSync(join(root, "scripts", "games-ref.txt"), "beta\n");
    expect(() => pinnedRef(root, "")).toThrow(/full commit SHA/);
  });
});

describe("games:clone never keeps an older checkout", () => {
  test("moves an existing clone to the pin and reports both commits", () => {
    const { source, root, old, next } = staleClone();
    const result = ensureGames(root, next, { url: source });
    expect(result.action).toBe("moved");
    expect(result.from).toBe(old);
    expect(result.to).toBe(next);
    expect(git(join(root, "Games"), ["rev-parse", "HEAD"])).toBe(next);
  });

  test("says nothing to do when the clone is already at the pin", () => {
    const { source, root, next } = staleClone();
    expect(ensureGames(root, next, { url: source }).action).toBe("moved");
    const again = ensureGames(root, next, { url: source });
    expect(again.action).toBe("already");
    expect(again.to).toBe(next);
  });

  test("clones when Games/ is absent", () => {
    const { source, root, next } = staleClone();
    rmSync(join(root, "Games"), { recursive: true, force: true });
    const result = ensureGames(root, next, { url: source });
    expect(result.action).toBe("cloned");
    expect(existsSync(join(root, "Games", "GAME.md"))).toBe(true);
    expect(git(join(root, "Games"), ["rev-parse", "HEAD"])).toBe(next);
  });

  test("a move that cannot happen names the commit it is stuck on", () => {
    const { root, old, next } = staleClone();
    expect(() => ensureGames(root, next, { url: join(root, "no-such-repo") })).toThrow(new RegExp(`${old.slice(0, 7)}.*${next.slice(0, 7)}|${next.slice(0, 7)}.*${old.slice(0, 7)}`));
    expect(git(join(root, "Games"), ["rev-parse", "HEAD"])).toBe(old);
  });
});

describe("ensure-games --check", () => {
  test("exits 1 naming both commits when the clone is off the pin", () => {
    const { root, old, next } = staleClone();
    copyFileSync(join(import.meta.dir, "ensure-games.ts"), join(root, "scripts", "ensure-games.ts"));
    const proc = Bun.spawnSync(["bun", join(root, "scripts", "ensure-games.ts"), "--check"], { cwd: root, timeout: 60_000 });
    const output = proc.stdout.toString() + proc.stderr.toString();
    expect(proc.exitCode).toBe(1);
    expect(output).toContain(old.slice(0, 7));
    expect(output).toContain(next.slice(0, 7));
    expect(output).toContain("games:update");
  });

  test("exits 0 when the clone is at the pin", () => {
    const { root, next } = staleClone();
    git(join(root, "Games"), ["checkout", "--quiet", "--detach", next]);
    copyFileSync(join(import.meta.dir, "ensure-games.ts"), join(root, "scripts", "ensure-games.ts"));
    const proc = Bun.spawnSync(["bun", join(root, "scripts", "ensure-games.ts"), "--check"], { cwd: root, timeout: 60_000 });
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain("Games/ at pinned");
  });
});

