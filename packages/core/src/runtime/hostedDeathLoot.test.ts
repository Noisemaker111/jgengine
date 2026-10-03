import { expect, test } from "bun:test";
import { defineGameDefinition } from "../game/defineGame";
import { createAssetCatalog } from "../scene/assetCatalog";
import { createHostedWorldSession } from "./hostedWorldSession";
import type { GameContext, GameContextContent } from "./gameContext";
import type { OnDeathSpec } from "../combat/death";

function fixture(onDeath: OnDeathSpec) {
  const content: GameContextContent = {
    entityById: (id) => id === "victim"
      ? { stats: { health: { max: 10 } }, receive: { damage: { order: ["health"] } }, onDeath }
      : { stats: { health: { max: 20 } } },
  };
  const session = createHostedWorldSession({
    host: { userId: "host", isNew: true },
    content,
    definition: defineGameDefinition({
      name: "Hosted loot probe",
      assets: createAssetCatalog(),
      multiplayer: "off",
      features: { players: true },
      inventories: { backpack: { slots: 9 } },
      loop: {
        onInit(ctx: GameContext) {
          ctx.game.loot.register({ id: "goo", entries: [{ item: "goo", count: 2, weight: 1 }] });
          ctx.game.loot.register({ id: "coins", entries: [{ currency: "credits", count: 5, weight: 1 }] });
          ctx.game.loot.register({ id: "unfiltered", entries: [{ item: "unfiltered", count: 7, weight: 1 }] });
          ctx.game.commands.define<{ from?: string; delayed?: boolean }>("strike", {
            apply(state, input) {
              const from = input.from ?? state.player.userId;
              const hit = () => state.scene.entity.effect({ from, to: "victim", effect: "damage", via: { amount: 99 } });
              if (input.delayed) state.time.after(0.1, hit);
              else hit();
            },
          });
          ctx.game.commands.define("inspect", {
            apply(state) {
              state.game.store.set(`bag:${state.player.userId}`, state.player.inventory.count("backpack", "goo"));
            },
          });
        },
        onNewPlayer(ctx: GameContext, player) {
          ctx.scene.entity.spawn("hero", { id: player!.userId });
          ctx.scene.entity.spawn("hero", { id: `pet:${player!.userId}` });
          ctx.player.possession.own(player!.userId, `pet:${player!.userId}`);
        },
      },
    }),
  });
  session.join("alice", true);
  session.join("bob", true);
  const ctx = session.runner().context();
  ctx.scene.entity.spawn("victim", { id: "victim", position: [4, 0, 4] });
  const reasons: unknown[] = [];
  ctx.game.events.on("entity.died", (event) => reasons.push(event.reason));
  const bag = (userId: string) => {
    expect(session.command(userId, "inspect", {}).status).toBe("applied");
    return ctx.game.store.get(`bag:${userId}`);
  };
  const credits = (userId: string) => ctx.game.economy.balance(userId, "credits");
  return { session, ctx, reasons, bag, credits };
}

for (const [name, input] of [
  ["joined remote player", {}],
  ["remote owned pet", { from: "pet:bob" }],
  ["delayed remote-owned damage", { from: "pet:bob", delayed: true }],
] as const) {
  test(`${name} routes bag loot to bob and keeps host/alice isolated`, () => {
    const { session, ctx, reasons, bag } = fixture({ drops: "goo" });
    expect(session.command("bob", "strike", input).status).toBe("applied");
    if ("delayed" in input) {
      expect(ctx.scene.entity.get("victim")).not.toBeNull();
      session.tick(0.2);
    }
    expect(reasons).toEqual([{ kind: "player_kill", killerUserId: "bob" }]);
    expect(bag("bob")).toBe(2);
    expect(bag("alice")).toBe(0);
    expect(ctx.player.inventory.count("backpack", "goo")).toBe(0);
    expect(ctx.player.userId).toBe("host");
    expect(ctx.scene.worldItem.list()).toHaveLength(0);
  });
}

test("remote-player world loot scatters exactly once and never enters host bag", () => {
  const { session, ctx, reasons, bag } = fixture({ drops: "goo", dropMode: "world" });
  expect(session.command("bob", "strike", {}).status).toBe("applied");
  expect(reasons).toEqual([{ kind: "player_kill", killerUserId: "bob" }]);
  expect(ctx.scene.worldItem.list().map((item) => [item.itemId, item.count])).toEqual([["goo", 2]]);
  expect(bag("bob")).toBe(0);
  expect(ctx.player.inventory.count("backpack", "goo")).toBe(0);
  session.command("bob", "strike", {});
  expect(ctx.scene.worldItem.list()).toHaveLength(1);
});

for (const drops of ["goo", [{ table: "goo", when: { reason: "environment" as const } }]]) {
  test("non-player kills keep ordinary world loot disabled", () => {
    const { session, ctx } = fixture({ drops, dropMode: "world" });
    expect(session.command("bob", "strike", { from: "environment:trap" }).status).toBe("applied");
    expect(ctx.scene.worldItem.list()).toHaveLength(0);
    expect(ctx.player.inventory.count("backpack", "goo")).toBe(0);
  });
}

test("explicit any-death world rule drops environmental loot without enabling unfiltered rules", () => {
  const { session, ctx, reasons, bag } = fixture({
    dropMode: "world",
    drops: [{ table: "goo", when: { reason: "any" } }, { table: "unfiltered" }],
  });
  expect(session.command("bob", "strike", { from: "environment:trap" }).status).toBe("applied");
  expect(reasons).toEqual([{ kind: "environment", source: "effect" }]);
  expect(ctx.scene.worldItem.list().map((item) => [item.itemId, item.count])).toEqual([["goo", 2]]);
  expect(bag("bob")).toBe(0);
  expect(bag("alice")).toBe(0);
  expect(ctx.player.inventory.count("backpack", "goo")).toBe(0);
  expect(ctx.player.userId).toBe("host");
  expect(session.command("bob", "strike", { from: "environment:trap" }).status).toBe("applied");
  expect(ctx.scene.worldItem.list()).toHaveLength(1);
  expect(reasons).toHaveLength(1);
});

for (const dropMode of ["grant", "world"] as const) {
  test(`non-player any-death ${dropMode} never grants bag or currency loot`, () => {
    const { session, ctx, bag, credits } = fixture({
      dropMode,
      drops: [{ table: "goo", when: { reason: "any" } }, { table: "coins", when: { reason: "any" } }],
    });
    session.command("bob", "strike", { from: "environment:trap" });
    expect(ctx.scene.worldItem.list().map((item) => [item.itemId, item.count])).toEqual(dropMode === "world" ? [["goo", 2]] : []);
    expect(bag("bob")).toBe(0);
    expect(bag("alice")).toBe(0);
    expect(credits("bob")).toBe(0);
    expect(credits("alice")).toBe(0);
    expect(ctx.player.inventory.count("backpack", "goo")).toBe(0);
    expect(credits("host")).toBe(0);
  });
}

test("player any-death world rules preserve ordinary tables and currency recipient", () => {
  const { session, ctx, credits } = fixture({
    dropMode: "world",
    drops: [{ table: "goo", when: { reason: "any" } }, { table: "unfiltered" }, { table: "coins", when: { reason: "any" } }],
  });
  session.command("bob", "strike", {});
  expect(ctx.scene.worldItem.list().map((item) => [item.itemId, item.count])).toEqual([["goo", 2], ["unfiltered", 7]]);
  expect(credits("bob")).toBe(5);
  expect(credits("alice")).toBe(0);
  expect(credits("host")).toBe(0);
});
