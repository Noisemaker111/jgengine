import { describe, expect, test } from "bun:test";

import { defineGame } from "../game/defineGame";
import { createAssetCatalog } from "../scene/assetCatalog";
import type { SceneEntity } from "../scene/entityStore";
import { createGameContext, type GameContext } from "./gameContext";
import { composeWorldSnapshot, type SnapshotModule } from "./worldSnapshot";
import {
  policyProjectsViewers,
  projectByVisibleIds,
  projectEntitiesForViewer,
  projectPerUserForViewer,
  visibleEntityIds,
} from "./worldProjection";

function ent(id: string, x: number): SceneEntity {
  return { id, name: id, position: [x, 0, 0] } as unknown as SceneEntity;
}

describe("world projection helpers", () => {
  test("projectEntitiesForViewer keeps the viewer's own entity plus those inside the radius", () => {
    const entities = [ent("alice", 0), ent("carl", 2), ent("bob", 100)];
    const seen = projectEntitiesForViewer(entities, { userId: "alice" }, 5).map((e) => e.id);
    expect(seen).toEqual(["alice", "carl"]);
    expect(seen).not.toContain("bob");
  });

  test("projectEntitiesForViewer fails open when the viewer has no locatable entity", () => {
    const entities = [ent("carl", 2), ent("bob", 100)];
    expect(projectEntitiesForViewer(entities, { userId: "ghost" }, 5)).toHaveLength(2);
  });

  test("projectPerUserForViewer returns only the viewer's own entry", () => {
    const byUser = { alice: { gold: 1 }, bob: { gold: 2 } };
    expect(projectPerUserForViewer(byUser, { userId: "alice" })).toEqual({ alice: { gold: 1 } });
    expect(projectPerUserForViewer(byUser, { userId: "nobody" })).toEqual({});
  });

  test("projectByVisibleIds drops entries whose id is not in the visible set", () => {
    const byId = { alice: 1, bob: 2, carl: 3 };
    const visible = visibleEntityIds([ent("alice", 0), ent("carl", 2), ent("bob", 100)], { userId: "alice" }, 5);
    expect(projectByVisibleIds(byId, visible)).toEqual({ alice: 1, carl: 3 });
  });

  test("policyProjectsViewers is false for an absent or no-op policy", () => {
    expect(policyProjectsViewers(undefined)).toBe(false);
    expect(policyProjectsViewers({})).toBe(false);
    expect(policyProjectsViewers({ privatePerUser: true })).toBe(true);
    expect(policyProjectsViewers({ aoiRadius: 10 })).toBe(true);
  });
});

describe("composeWorldSnapshot projection", () => {
  test("a module projector may cross-reference another module via the raw world argument", () => {
    const modules: SnapshotModule[] = [
      { key: "entities", snapshot: () => [ent("alice", 0), ent("bob", 100)] },
      {
        key: "stats",
        snapshot: () => ({ alice: { hp: 1 }, bob: { hp: 1 } }),
        project: (data, viewer, world) =>
          projectByVisibleIds(
            data as Record<string, unknown>,
            visibleEntityIds((world["entities"] ?? []) as SceneEntity[], viewer, 5),
          ),
      },
    ].map((m) => ({ hydrate: () => {}, ...m }));

    const global = composeWorldSnapshot(modules);
    expect(Object.keys(global["stats"] as object)).toEqual(["alice", "bob"]);

    const forAlice = composeWorldSnapshot(modules, { userId: "alice" });
    expect(Object.keys(forAlice["stats"] as object)).toEqual(["alice"]);
  });
});

function hostContext(): GameContext {
  return createGameContext({
    definition: defineGame({
      name: "Projected",
      assets: createAssetCatalog(),
      multiplayer: "off",
      features: { players: true },
      inventories: { backpack: { slots: 9 } },
    }),
    content: { entityById: () => ({}) },
    player: { userId: "host", isNew: true },
    replication: { privatePerUser: true, aoiRadius: 5 },
  });
}

describe("ctx.snapshot per-viewer projection (through the descriptor contract)", () => {
  test("a viewer never receives another player's private inventory, and AOI culls distant entities + their stats", () => {
    const ctx = hostContext();
    ctx.scene.entity.spawn("unit", { id: "alice", position: [0, 0, 0] });
    ctx.scene.entity.spawn("unit", { id: "carl", position: [2, 0, 0] });
    ctx.scene.entity.spawn("unit", { id: "bob", position: [100, 0, 0] });
    ctx.player.inventoryFor("alice").put("backpack", "apple", 3);
    ctx.player.inventoryFor("bob").put("backpack", "sword", 1);
    ctx.scene.entity.stats.set("bob", "health", { max: 5, current: 5, min: 0 });

    const unprojected = ctx.snapshot();
    expect(Object.keys(unprojected["inventory"] as object).sort()).toEqual(["alice", "bob"]);
    expect((unprojected["entities"] as SceneEntity[]).map((e) => e.id).sort()).toEqual(["alice", "bob", "carl"]);

    const forAlice = ctx.snapshot({ userId: "alice" });
    expect(Object.keys(forAlice["inventory"] as object)).toEqual(["alice"]);
    const aliceEntityIds = (forAlice["entities"] as SceneEntity[]).map((e) => e.id).sort();
    expect(aliceEntityIds).toEqual(["alice", "carl"]);
    expect(aliceEntityIds).not.toContain("bob");
    expect(Object.prototype.hasOwnProperty.call(forAlice["stats"] as object, "bob")).toBe(false);
    expect(ctx.replicatesPerViewer()).toBe(true);
  });

  test("with no replication policy the viewer argument is a no-op — every client sees the whole world", () => {
    const ctx = createGameContext({
      definition: defineGame({
        name: "Plain",
        assets: createAssetCatalog(),
        multiplayer: "off",
        features: { players: true },
        inventories: { backpack: { slots: 9 } },
      }),
      content: { entityById: () => ({}) },
      player: { userId: "host", isNew: true },
    });
    ctx.scene.entity.spawn("unit", { id: "alice", position: [0, 0, 0] });
    ctx.scene.entity.spawn("unit", { id: "bob", position: [100, 0, 0] });
    ctx.player.inventoryFor("bob").put("backpack", "sword", 1);

    expect(ctx.replicatesPerViewer()).toBe(false);
    expect(ctx.snapshot({ userId: "alice" })).toEqual(ctx.snapshot());
  });
});
