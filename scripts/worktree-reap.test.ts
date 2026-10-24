import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { livesUnderWorktrees, reap, selectReap, summarise, type ReapCandidate } from "./worktree-reap";

const MAIN = resolve("repo-root");
const WORKTREES = join(MAIN, ".claude", "worktrees");

function refs(names: string[], extra: { locked?: string[]; detached?: string[]; outside?: string[] } = {}) {
  return [
    { path: MAIN, branch: "beta", locked: false },
    ...names.map((name) => ({
      path: join(WORKTREES, name),
      branch: extra.detached?.includes(name) ? null : `agent/${name}`,
      locked: extra.locked?.includes(name) ?? false,
    })),
    ...(extra.outside ?? []).map((path) => ({ path, branch: "agent/stray", locked: false })),
  ];
}

describe("a merged, clean worktree is taken; everything else stays", () => {
  test("the main checkout is never a candidate", () => {
    const plan = selectReap({ refs: refs(["a"]), mainRoot: MAIN, skip: [], isMerged: () => true });
    expect(plan.reap.map((row) => row.name)).toEqual(["a"]);
  });

  test("an unmerged branch keeps its worktree", () => {
    const plan = selectReap({ refs: refs(["a", "b"]), mainRoot: MAIN, skip: [], isMerged: (branch) => branch === "agent/a" });
    expect(plan.reap.map((row) => row.name)).toEqual(["a"]);
    expect(plan.kept).toContainEqual({ name: "b", reason: "not merged into origin/beta" });
  });

  test("a locked worktree is left alone even when merged", () => {
    const plan = selectReap({ refs: refs(["a"], { locked: ["a"] }), mainRoot: MAIN, skip: [], isMerged: () => true });
    expect(plan.reap).toEqual([]);
    expect(plan.kept).toContainEqual({ name: "a", reason: "locked" });
  });

  test("a detached worktree is left alone even when merged", () => {
    const plan = selectReap({ refs: refs(["a"], { detached: ["a"] }), mainRoot: MAIN, skip: [], isMerged: () => true });
    expect(plan.reap).toEqual([]);
    expect(plan.kept).toContainEqual({ name: "a", reason: "detached" });
  });

  test("the session's own worktree is left alone", () => {
    const here = join(WORKTREES, "a");
    const plan = selectReap({ refs: refs(["a"]), mainRoot: MAIN, skip: [here], isMerged: () => true });
    expect(plan.reap).toEqual([]);
    expect(plan.kept).toContainEqual({ name: "a", reason: "this session" });
  });

  test("a worktree outside the worktrees directory is never removed, whatever its branch says", () => {
    const plan = selectReap({
      refs: refs([], { outside: [resolve("somewhere", "else")] }),
      mainRoot: MAIN,
      skip: [],
      isMerged: () => true,
    });
    expect(plan.reap).toEqual([]);
    expect(plan.kept).toContainEqual({ name: "else", reason: "not under .claude/worktrees" });
  });
});

describe("removal asks the tree, not just the branch", () => {
  const plan = (): { reap: ReapCandidate[]; kept: { name: string; reason: string }[] } => ({
    reap: [candidate("a"), candidate("b")],
    kept: [],
  });

  test("an uncommitted tree keeps its worktree, because those changes exist nowhere else", () => {
    const result = reap(plan(), { exists: () => true, isClean: (path) => !path.endsWith("b"), remove: () => true });
    expect(result.removed.map((row) => row.name)).toEqual(["a"]);
    expect(result.kept).toContainEqual({ name: "b", reason: "uncommitted changes" });
  });

  test("a tree that is already gone counts as removed instead of failing the run", () => {
    let asked = 0;
    const result = reap(
      { reap: [candidate("gone")], kept: [] },
      {
        exists: () => false,
        isClean: () => {
          asked += 1;
          return true;
        },
        remove: () => true,
      },
    );
    expect(asked).toBe(0);
    expect(result.removed.map((row) => row.name)).toEqual(["gone"]);
  });

  test("a tree that cannot be deleted is reported, not retried", () => {
    let attempts = 0;
    const result = reap(plan(), {
      exists: () => true,
      isClean: () => true,
      remove: () => {
        attempts += 1;
        return false;
      },
    });
    expect(attempts).toBe(2);
    expect(result.removed).toEqual([]);
    expect(result.kept).toContainEqual({ name: "a", reason: "in use" });
  });
});

describe("the line a lane reads", () => {
  test("names what went", () => {
    expect(summarise({ removed: [candidate("a"), candidate("b")], kept: [] })).toBe(
      "worktree:reap: removed 2 merged worktrees (a, b)",
    );
  });

  test("says nothing to do when nothing was merged", () => {
    expect(summarise({ removed: [], kept: [{ name: "a", reason: "not merged into origin/beta" }] })).toBe(
      "worktree:reap: no merged worktree to remove",
    );
  });

  test("names the merged tree it could not take, so a rerun is explained", () => {
    expect(summarise({ removed: [], kept: [{ name: "a", reason: "uncommitted changes" }] })).toBe(
      "worktree:reap: nothing removed - a (uncommitted changes)",
    );
  });
});

describe("only the worktrees directory belongs to a reap", () => {
  test("inside is inside, a sibling prefix is not", () => {
    expect(livesUnderWorktrees(join(WORKTREES, "a"), MAIN)).toBe(true);
    expect(livesUnderWorktrees(join(MAIN, ".claude", "worktrees-other", "a"), MAIN)).toBe(false);
    expect(livesUnderWorktrees(MAIN, MAIN)).toBe(false);
  });

  test("a real directory is deleted and a real dirty tree is kept", () => {
    // fixture-location: allow two empty directories and one byte of text, no engine import
    const root = join(tmpdir(), `reap-${randomUUID()}`);
    const clean = join(root, "clean");
    const dirty = join(root, "dirty");
    mkdirSync(clean, { recursive: true });
    mkdirSync(dirty, { recursive: true });
    writeFileSync(join(clean, "file.txt"), "x");
    writeFileSync(join(dirty, "file.txt"), "x");
    const result = reap(
      { reap: [candidateAt(clean, "clean"), candidateAt(dirty, "dirty")], kept: [] },
      {
        exists: () => true,
        isClean: (path) => path === clean,
        remove: (path) => {
          rmSync(path, { recursive: true, force: true });
          return true;
        },
      },
    );
    expect(result.removed.map((row) => row.name)).toEqual(["clean"]);
    expect(result.kept).toContainEqual({ name: "dirty", reason: "uncommitted changes" });
    rmSync(root, { recursive: true, force: true });
  });
});

function candidate(name: string): ReapCandidate {
  return candidateAt(join(WORKTREES, name), name);
}

function candidateAt(path: string, name: string): ReapCandidate {
  return { path, name, branch: `agent/${name}` };
}
