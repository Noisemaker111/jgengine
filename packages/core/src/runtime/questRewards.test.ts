import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "../game/defineGame";
import type { QuestRewards } from "../game/quest";
import { createAssetCatalog } from "../scene/assetCatalog";
import { createGameContext } from "./gameContext";

function harness(items: NonNullable<QuestRewards["items"]>) {
  const ctx = createGameContext({
    definition: defineGameDefinition({
      name: "QuestRewards",
      assets: createAssetCatalog(),
      multiplayer: "off",
      features: { quest: true, unlocks: true },
      inventories: {
        bag: { slots: 2, traits: { stackLimit: () => 1, kind: (id) => id === "blocked" ? "other" : "reward" } },
        stash: { slots: 1, accepts: "reward" },
      },
    }),
    content: {},
    player: { userId: "alice", isNew: true },
  });
  const quest = ctx.game.quest!;
  quest.register([
    { id: "q", title: "Reward", objectives: [], rewards: {
      items, xp: { amount: 10 }, economy: { coins: 5 }, unlocks: ["next"], quests: ["follow"],
    } },
    { id: "follow", title: "Follow", requires: ["q"], objectives: [] },
  ]);
  quest.accept("alice", "q");
  const completed: string[] = [];
  ctx.game.events.on("quest.completed", ({ questId }) => { completed.push(questId); });
  return { ctx, quest, inventory: ctx.player.inventoryFor("alice"), completed };
}

describe("runtime quest reward batches", () => {
  test("stages cumulative same-bag capacity and grants exactly once after retry", () => {
    const { ctx, quest, inventory, completed } = harness([
      { item: "one", inventory: "bag", count: 1 },
      { item: "two", inventory: "bag", count: 1 },
    ]);
    inventory.put("bag", "occupied", 1);
    const before = inventory.state("bag");
    expect(quest.turnIn("alice", "q")).toEqual({ reason: "no-space" });
    expect(inventory.state("bag")).toBe(before);
    expect(inventory.count("bag", "one")).toBe(0);
    expect(ctx.game.economy.balance("alice", "coins")).toBe(0);
    expect(ctx.scene.entity.stats.get("alice", "xp")).toBeNull();
    expect(ctx.game.unlocks!.has("alice", "next")).toBe(false);
    expect(quest.list("alice").map(({ status }) => status)).toEqual(["active"]);
    expect(completed).toEqual([]);

    inventory.take("bag", "occupied", 1);
    expect(quest.turnIn("alice", "q")).toBeNull();
    expect(inventory.count("bag", "one")).toBe(1);
    expect(inventory.count("bag", "two")).toBe(1);
    expect(ctx.game.economy.balance("alice", "coins")).toBe(5);
    expect(ctx.scene.entity.stats.get("alice", "xp")?.current).toBe(10);
    expect(ctx.game.unlocks!.has("alice", "next")).toBe(true);
    expect(quest.list("alice").map(({ status }) => status)).toEqual(["completed", "active"]);
    expect(quest.turnIn("alice", "q")).toEqual({ reason: 'quest "q" is not active' });
    expect(inventory.count("bag", "one")).toBe(1);
    expect(ctx.game.economy.balance("alice", "coins")).toBe(5);
    expect(ctx.scene.entity.stats.get("alice", "xp")?.current).toBe(10);
    expect(completed).toEqual(["q"]);
  });

  test("rejects a later inventory without changing an earlier inventory", () => {
    const { quest, inventory } = harness([
      { item: "one", inventory: "bag", count: 1 },
      { item: "two", inventory: "stash", count: 1 },
    ]);
    inventory.put("stash", "occupied", 1);
    const bag = inventory.state("bag");
    const stash = inventory.state("stash");
    expect(quest.turnIn("alice", "q")).toEqual({ reason: "no-space" });
    expect(inventory.state("bag")).toBe(bag);
    expect(inventory.state("stash")).toBe(stash);
    inventory.take("stash", "occupied", 1);
    expect(quest.turnIn("alice", "q")).toBeNull();
    expect(inventory.count("bag", "one")).toBe(1);
    expect(inventory.count("stash", "two")).toBe(1);
  });

  test("validates every reward inventory before any commit", () => {
    const { quest, inventory } = harness([
      { item: "one", inventory: "bag", count: 1 },
      { item: "two", inventory: "missing", count: 1 },
    ]);
    expect(quest.turnIn("alice", "q")).toEqual({ reason: 'unknown inventory "missing"' });
    expect(inventory.count("bag", "one")).toBe(0);
  });

  test("uses declared shared item traits when checking inventory kinds", () => {
    const { quest, inventory } = harness([
      { item: "one", inventory: "bag", count: 1 },
      { item: "blocked", inventory: "stash", count: 1 },
    ]);
    expect(quest.turnIn("alice", "q")).toEqual({ reason: "wrong-kind" });
    expect(inventory.count("bag", "one")).toBe(0);
    expect(inventory.count("stash", "blocked")).toBe(0);
  });
});
