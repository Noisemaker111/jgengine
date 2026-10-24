import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BROKEN,
  dependencyPlan,
  filterOnly,
  formatTable,
  gamesUnlinked,
  installBroken,
  lockVerdict,
  missingPackages,
  parseWorktreeList,
  planRepair,
  probeInstall,
  removeNodeModules,
  severityOf,
  sortReports,
  statusOf,
  strayDirectories,
  type WorktreeReport,
} from "./worktree-doctor";

function tempDir(prefix: string): string {
  const path = join(fileURLToPath(new URL("..", import.meta.url)), ".scratch", `${prefix}${randomUUID().slice(0, 8)}`);
  mkdirSync(path, { recursive: true });
  return path;
}

function report(overrides: Partial<WorktreeReport> = {}): WorktreeReport {
  const base = {
    repo: "jgengine",
    kind: "engine" as const,
    name: "lane-a",
    path: "C:/repo/.claude/worktrees/lane-a",
    branch: "agent/lane-a",
    directory: true,
    nodeModules: true,
    expectedDeps: 10,
    missingDeps: [] as string[],
    expectedJge: 0,
    missingJge: [] as string[],
    dist: true as boolean | null,
    lock: "match" as const,
    staleInstall: false,
    dirty: false,
    changes: 0,
  };
  const merged = { ...base, ...overrides };
  return { ...merged, severity: severityOf(merged) };
}

describe("parseWorktreeList", () => {
  test("reads path, branch and lock state, including detached HEAD", () => {
    const porcelain = [
      "worktree C:/repo",
      "HEAD 1111111",
      "branch refs/heads/beta",
      "",
      "worktree C:/repo/.claude/worktrees/lane-b",
      "HEAD 2222222",
      "branch refs/heads/agent/lane-b",
      "locked",
      "",
      "worktree C:/repo/.claude/worktrees/lane-c",
      "HEAD 3333333",
      "detached",
      "",
    ].join("\n");
    expect(parseWorktreeList(porcelain)).toEqual([
      { path: "C:/repo", branch: "beta", locked: false },
      { path: "C:/repo/.claude/worktrees/lane-b", branch: "agent/lane-b", locked: true },
      { path: "C:/repo/.claude/worktrees/lane-c", branch: null, locked: false },
    ]);
  });

  test("survives CRLF output and a trailing blank block", () => {
    const porcelain = "worktree C:/repo\r\nHEAD 1111111\r\nbranch refs/heads/beta\r\n\r\n";
    expect(parseWorktreeList(porcelain)).toEqual([{ path: "C:/repo", branch: "beta", locked: false }]);
  });
});

describe("dependencyPlan", () => {
  test("engine repo: root dependencies plus each workspace's own dependencies", () => {
    const root = tempDir("jg-doctor-ws-");
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          workspaces: { packages: ["packages/*", "registry"] },
          devDependencies: { "ts-morph": "^28.0.0" },
        }),
      );
      mkdirSync(join(root, "packages", "react"), { recursive: true });
      writeFileSync(
        join(root, "packages", "react", "package.json"),
        JSON.stringify({ name: "@jgengine/react", dependencies: { three: "^0.182.0", "@jgengine/core": "workspace:*" } }),
      );
      mkdirSync(join(root, "registry"), { recursive: true });
      writeFileSync(join(root, "registry", "package.json"), JSON.stringify({ name: "registry" }));
      expect(dependencyPlan(root)).toEqual({
        root: ["ts-morph"],
        workspaces: [{ dir: "packages/react", deps: ["three", "@jgengine/core"] }],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("games repo: each game's own dependencies, installed inside the game", () => {
    const root = tempDir("jg-doctor-cat-");
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          workspaces: { packages: ["*"], catalog: { "@jgengine/core": "0.27.0" } },
          devDependencies: { "@typescript/native-preview": "^7.0.0" },
        }),
      );
      mkdirSync(join(root, "ember-command"), { recursive: true });
      writeFileSync(
        join(root, "ember-command", "package.json"),
        JSON.stringify({ dependencies: { "@jgengine/core": "catalog:", vite: "^6.2.2" } }),
      );
      expect(dependencyPlan(root)).toEqual({
        root: ["@typescript/native-preview"],
        workspaces: [{ dir: "ember-command", deps: ["@jgengine/core", "vite"] }],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("probeInstall", () => {
  test("counts a half-installed workspace and names what is missing", () => {
    const worktree = tempDir("jg-doctor-probe-");
    try {
      const plan = {
        root: ["ts-morph"],
        workspaces: [{ dir: "ember-command", deps: ["@jgengine/core", "vite"] }],
      };
      mkdirSync(join(worktree, "node_modules", "ts-morph"), { recursive: true });
      writeFileSync(join(worktree, "node_modules", "ts-morph", "package.json"), "{}");
      mkdirSync(join(worktree, "ember-command", "node_modules", "@jgengine", "core"), { recursive: true });
      writeFileSync(join(worktree, "ember-command", "node_modules", "@jgengine", "core", "package.json"), "{}");
      const probe = probeInstall(worktree, plan);
      expect(probe.expected).toBe(3);
      expect(probe.missing).toEqual(["ember-command/vite"]);
      expect(probe.expectedJge).toBe(1);
      expect(probe.missingJge).toEqual([]);
      expect(probeInstall(join(worktree, "nope"), plan).missing).toEqual(["ts-morph", "ember-command/@jgengine/core", "ember-command/vite"]);
    } finally {
      rmSync(worktree, { recursive: true, force: true });
    }
  });
});

describe("missingPackages", () => {
  test("names the entries a half-completed install dropped", () => {
    const root = tempDir("jg-doctor-res-");
    try {
      mkdirSync(join(root, "node_modules", "@jgengine", "core"), { recursive: true });
      writeFileSync(join(root, "node_modules", "@jgengine", "core", "package.json"), "{}");
      expect(missingPackages(root, ["@jgengine/core", "@jgengine/react"])).toEqual(["@jgengine/react"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("lockVerdict", () => {
  test("missing, match and differs", () => {
    const root = tempDir("jg-doctor-lock-");
    try {
      expect(lockVerdict(root, "abc")).toBe("missing");
      writeFileSync(join(root, "bun.lock"), "abc");
      expect(lockVerdict(root, "abc")).toBe("match");
      expect(lockVerdict(root, "other")).toBe("differs");
      expect(lockVerdict(root, null)).toBe("match");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("severityOf", () => {
  test("ranks a missing install worst and a sound tree last", () => {
    expect(report().severity).toBe(0);
    expect(report({ dirty: true, changes: 2 }).severity).toBe(1);
    expect(report({ staleInstall: true }).severity).toBe(2);
    expect(report({ missingDeps: ["@jgengine/core"] }).severity).toBe(BROKEN);
    expect(report({ nodeModules: false, missingDeps: [] }).severity).toBe(5);
  });

  test("a worktree measuring a Games/ that is not the pin is broken, not fine", () => {
    expect(report({ games: "stale", gamesHead: "67f6ed9bc5e66aadc15ad6dee391117f3aace947" }).severity).toBe(BROKEN);
    expect(report({ games: "absent" }).severity).toBe(BROKEN);
    expect(report({ games: "unknown-head" }).severity).toBe(BROKEN);
    expect(report({ games: "at-pin" }).severity).toBe(0);
    expect(report({ games: "no-pin" }).severity).toBe(0);
  });

  test("only an install problem is repaired by reinstalling", () => {
    const stale = report({ games: "stale" });
    expect(installBroken(stale)).toBe(false);
    expect(installBroken(report({ missingDeps: ["vite"] }))).toBe(true);
    expect(gamesUnlinked(stale)).toBe(false);
    expect(gamesUnlinked(report({ games: "absent" }))).toBe(true);
    expect(planRepair([stale]).repair).toHaveLength(0);
  });

  test("a lockfile that differs from the main checkout is reported, not warned about", () => {
    expect(report({ lock: "differs" }).severity).toBe(0);
  });

  test("an unbuilt dist is informational only, not broken", () => {
    expect(report({ dist: false }).severity).toBe(0);
  });

  test("a games worktree has no dist to report", () => {
    expect(report({ kind: "games", repo: "jgengine-games", dist: null }).severity).toBe(0);
  });

  test("status labels", () => {
    expect(statusOf(0)).toBe("ok");
    expect(statusOf(1)).toBe("ok");
    expect(statusOf(2)).toBe("warn");
    expect(statusOf(BROKEN)).toBe("BROKEN");
    expect(statusOf(5)).toBe("NO-INSTALL");
    expect(statusOf(6)).toBe("GONE");
  });

  test("a registered worktree whose directory vanished is reported, not repaired", () => {
    const gone = report({ directory: false, nodeModules: false });
    expect(gone.severity).toBe(6);
    expect(statusOf(gone.severity)).toBe("GONE");
    const { repair, refused } = planRepair([gone]);
    expect(repair).toHaveLength(0);
    expect(refused).toHaveLength(0);
  });
});

describe("sortReports", () => {
  test("worst first, dirty ahead of clean at the same severity", () => {
    const rows = [
      report({ name: "ok-tree" }),
      report({ name: "warn", staleInstall: true }),
      report({ name: "no-install", nodeModules: false }),
      report({ name: "broken-clean", missingDeps: ["@jgengine/core"] }),
      report({ name: "broken-dirty", missingDeps: ["@jgengine/core"], dirty: true, changes: 3 }),
    ];
    expect(sortReports(rows).map((row) => row.name)).toEqual([
      "no-install",
      "broken-dirty",
      "broken-clean",
      "warn",
      "ok-tree",
    ]);
  });
});

describe("formatTable", () => {
  test("prints a header, one row per worktree, worst first", () => {
    const table = formatTable([
      report({ name: "lane-sound" }),
      report({ name: "lane-empty", nodeModules: false, expectedDeps: 0 }),
      report({ name: "lane-half", missingDeps: ["@jgengine/core"], expectedDeps: 2, dirty: true, changes: 4 }),
    ]);
    const lines = table.split("\n");
    expect(lines[0]).toContain("WORKTREE");
    expect(lines[0]).toContain("STATUS");
    expect(lines[0]).toContain("GAMES");
    expect(lines[1]).toContain("lane-empty");
    expect(lines[1]).toContain("NO-INSTALL");
    expect(lines[2]).toContain("lane-half");
    expect(lines[2]).toContain("1/2");
    expect(lines[2]).toContain("dirty(4)");
    expect(lines[3]).toContain("lane-sound");
    expect(lines).toHaveLength(4);
  });

  test("names the Games commit a row measures, and calls a stale one broken", () => {
    const stale = report({ name: "lane-stale", games: "stale", gamesHead: "67f6ed9bc5e66aadc15ad6dee391117f3aace947" });
    const lines = formatTable([stale]).split("\n");
    expect(lines[1]).toContain("stale 67f6ed9");
    expect(lines[1]).toContain("BROKEN");
  });
});

describe("planRepair", () => {
  test("repairs broken clean trees, refuses dirty ones, ignores warn-only trees", () => {
    const rows = [
      report({ name: "broken-clean", missingDeps: ["@jgengine/core"] }),
      report({ name: "broken-dirty", missingDeps: ["@jgengine/core"], dirty: true, changes: 1 }),
      report({ name: "unbuilt", dist: false }),
      report({ name: "sound" }),
      report({ name: "warn-only", lock: "differs" }),
    ];
    const { repair, refused } = planRepair(rows);
    expect(repair.map((row) => row.name)).toEqual(["broken-clean"]);
    expect(refused.map((row) => row.name)).toEqual(["broken-dirty"]);
  });
});

describe("removeNodeModules", () => {
  test("removes a plain directory", () => {
    const worktree = tempDir("jg-doctor-rm-");
    try {
      mkdirSync(join(worktree, "node_modules", "bun-types"), { recursive: true });
      expect(removeNodeModules(worktree)).toBe("removed");
      expect(existsSync(join(worktree, "node_modules"))).toBe(false);
    } finally {
      rmSync(worktree, { recursive: true, force: true });
    }
  });

  test("unlinks a junctioned store without deleting the main checkout's files", () => {
    const main = tempDir("jg-doctor-main-");
    const worktree = tempDir("jg-doctor-link-");
    try {
      mkdirSync(join(main, "node_modules", "ts-morph"), { recursive: true });
      writeFileSync(join(main, "node_modules", "ts-morph", "package.json"), "{}");
      symlinkSync(join(main, "node_modules"), join(worktree, "node_modules"), "junction");
      expect(removeNodeModules(worktree)).toBe("unlinked");
      expect(existsSync(join(worktree, "node_modules"))).toBe(false);
      expect(existsSync(join(main, "node_modules", "ts-morph", "package.json"))).toBe(true);
    } finally {
      rmSync(worktree, { recursive: true, force: true });
      rmSync(main, { recursive: true, force: true });
    }
  });
});

describe("filterOnly", () => {
  test("matches repo/name by substring, keeps everything when no pattern is given", () => {
    const rows = [
      report({ name: "lane-budget-ratchet" }),
      report({ name: "lane-budget-ratchet", repo: "jgengine-games", kind: "games", dist: null }),
      report({ name: "lane-games-pin" }),
    ];
    expect(filterOnly(rows, []).length).toBe(3);
    expect(filterOnly(rows, ["jgengine-games/lane-budget"]).map((row) => row.repo)).toEqual(["jgengine-games"]);
    expect(filterOnly(rows, ["lane-games-pin"]).map((row) => row.name)).toEqual(["lane-games-pin"]);
    expect(filterOnly(rows, ["pin", "ratchet"]).length).toBe(3);
  });
});

describe("strayDirectories", () => {
  test("names directories git does not list as worktrees", () => {
    const root = tempDir("jg-doctor-stray-");
    try {
      mkdirSync(join(root, "lane-real"), { recursive: true });
      mkdirSync(join(root, "lane-orphan"), { recursive: true });
      expect(
        strayDirectories(root, [{ path: join(root, "lane-real"), branch: "agent/lane-real", locked: false }]),
      ).toEqual(["lane-orphan"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
