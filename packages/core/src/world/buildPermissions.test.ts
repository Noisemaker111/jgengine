import { describe, expect, test } from "bun:test";

import { createContributionPool, createPlotPermissions } from "./buildPermissions";

describe("plot permissions", () => {
  test("owner can always edit; strangers cannot even view", () => {
    const perms = createPlotPermissions({ plotId: "plot-1", ownerId: "alice" });
    expect(perms.canEdit({ userId: "alice" })).toBe(true);
    expect(perms.canView({ userId: "bob" })).toBe(false);
  });

  test("granting editor lets a friend build; viewer cannot", () => {
    const perms = createPlotPermissions({ plotId: "plot-1", ownerId: "alice" });
    perms.grant("bob", "editor");
    perms.grant("cara", "viewer");
    expect(perms.canEdit({ userId: "bob" })).toBe(true);
    expect(perms.canEdit({ userId: "cara" })).toBe(false);
    expect(perms.canView({ userId: "cara" })).toBe(true);
    perms.revoke("bob");
    expect(perms.canEdit({ userId: "bob" })).toBe(false);
  });

  test("guild members inherit the guild role", () => {
    const perms = createPlotPermissions({
      plotId: "plot-1",
      ownerId: "alice",
      guildId: "wolves",
      guildRole: "editor",
    });
    expect(perms.canEdit({ userId: "dan", guildId: "wolves" })).toBe(true);
    expect(perms.canEdit({ userId: "dan", guildId: "rivals" })).toBe(false);
  });

  test("snapshot round-trips the permission grants", () => {
    const perms = createPlotPermissions({ plotId: "plot-1", ownerId: "alice" });
    perms.grant("bob", "editor");
    const snap = perms.snapshot();
    expect(snap.ownerId).toBe("alice");
    expect(snap.roles.bob).toBe("editor");
  });
});

describe("contribution pool", () => {
  test("pooled contributions accept up to the goal and report overflow", () => {
    const pool = createContributionPool({ wood: 100, stone: 50 });
    expect(pool.contribute("alice", "wood", 60)).toEqual({ accepted: 60, overflow: 0, complete: false });
    const capped = pool.contribute("bob", "wood", 60);
    expect(capped.accepted).toBe(40);
    expect(capped.overflow).toBe(20);
    expect(pool.remaining().wood).toBe(0);
  });

  test("completes only when every resource meets its goal", () => {
    const pool = createContributionPool({ wood: 10, stone: 10 });
    pool.contribute("alice", "wood", 10);
    expect(pool.isComplete()).toBe(false);
    const done = pool.contribute("bob", "stone", 10);
    expect(done.complete).toBe(true);
    expect(pool.progress()).toBe(1);
  });

  test("tracks per-contributor totals", () => {
    const pool = createContributionPool({ wood: 100 });
    pool.contribute("alice", "wood", 30);
    pool.contribute("alice", "wood", 20);
    pool.contribute("bob", "wood", 10);
    expect(pool.byContributor("alice").wood).toBe(50);
    expect(pool.byContributor("bob").wood).toBe(10);
    expect(pool.totals().wood).toBe(60);
  });

  test("unknown resources are rejected as overflow", () => {
    const pool = createContributionPool({ wood: 10 });
    expect(pool.contribute("alice", "gold", 5)).toEqual({ accepted: 0, overflow: 5, complete: false });
  });
});
