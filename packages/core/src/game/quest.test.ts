import { describe, expect, test } from "bun:test";

import { createGameEvents } from "./events";
import { createQuestJournal, type QuestDef, type QuestJournalDeps } from "./quest";

function createHarness(overrides?: Partial<Pick<QuestJournalDeps, "hasUnlock" | "partyMembersNear">>) {
  const events = createGameEvents();
  const xp: { userId: string; amount: number }[] = [];
  const economy: { userId: string; currencyId: string; amount: number }[] = [];
  const items: { userId: string; inventoryId: string; itemId: string; count: number }[] = [];
  const unlocks: { userId: string; unlockId: string }[] = [];

  const journal = createQuestJournal({
    events,
    rewards: {
      grantXp: (userId, amount) => void xp.push({ userId, amount }),
      grantEconomy: (userId, currencyId, amount) => void economy.push({ userId, currencyId, amount }),
      grantItem(userId, inventoryId, itemId, count) {
        items.push({ userId, inventoryId, itemId, count });
        return null;
      },
      grantUnlock: (userId, unlockId) => void unlocks.push({ userId, unlockId }),
    },
    ...overrides,
  });

  return { events, journal, xp, economy, items, unlocks };
}

const clearCamp: QuestDef = {
  id: "quest_clear_mobs",
  title: "Clear the camp",
  objectives: [
    { id: "kill_grunts", kind: "kill", target: "mob_grunt", count: 2 },
    { id: "collect_ore", kind: "collect", item: "iron_ore", count: 3 },
  ],
  rewards: {
    xp: { amount: 250 },
    economy: { gold: 15 },
    items: [{ item: "health_potion", count: 2, inventory: "backpack" }],
    unlocks: ["shop_tier_2"],
    quests: ["quest_next_in_chain"],
  },
};

const nextInChain: QuestDef = {
  id: "quest_next_in_chain",
  title: "Next in chain",
  objectives: [{ id: "kill_elite", kind: "kill", target: "mob_elite", count: 1 }],
};

describe("quest journal", () => {
  test("canAccept rejects unknown, active, completed, and unmet requires", () => {
    const { journal } = createHarness();
    journal.register([clearCamp, { ...nextInChain, requires: ["quest_clear_mobs"] }]);

    expect(journal.canAccept("alice", "nope")).toEqual({ reason: 'unknown quest "nope"' });
    expect(journal.canAccept("alice", "quest_next_in_chain")).toEqual({
      reason: 'quest "quest_next_in_chain" requires "quest_clear_mobs"',
    });
    expect(journal.accept("alice", "quest_clear_mobs")).toBeNull();
    expect(journal.canAccept("alice", "quest_clear_mobs")).toEqual({
      reason: 'quest "quest_clear_mobs" already active',
    });
    journal.grant("alice", "quest_clear_mobs", { completed: true });
    expect(journal.canAccept("alice", "quest_clear_mobs")).toEqual({
      reason: 'quest "quest_clear_mobs" already completed',
    });
    expect(journal.canAccept("alice", "quest_next_in_chain")).toBeNull();
  });

  test("entity.died bind advances kill objectives for the killer only on player kills", () => {
    const { events, journal } = createHarness();
    journal.register([clearCamp]);
    journal.accept("alice", "quest_clear_mobs");
    journal.bind("entity.died");

    const died = {
      instanceId: "e1",
      catalogId: "mob_grunt",
      position: [0, 0, 0] as [number, number, number],
    };
    events.emit("entity.died", { ...died, reason: { kind: "environment", source: "lava" } });
    events.emit("entity.died", { ...died, reason: { kind: "player_kill", killerUserId: "alice" } });
    events.emit("entity.died", { ...died, catalogId: "mob_other", reason: { kind: "player_kill", killerUserId: "alice" } });

    const instance = journal.list("alice").find((quest) => quest.questId === "quest_clear_mobs")!;
    expect(instance.objectives.find((objective) => objective.id === "kill_grunts")!.progress).toBe(1);
  });

  test("partyShare credit all extends kill credit to nearby party members", () => {
    const { events, journal } = createHarness({ partyMembersNear: () => ["bob", "alice"] });
    const sharedQuest: QuestDef = {
      id: "quest_shared",
      title: "Shared",
      objectives: [
        { id: "kill_elite", kind: "kill", target: "mob_elite", count: 1, partyShare: { radius: 40, credit: "all" } },
      ],
    };
    journal.register([sharedQuest]);
    journal.accept("alice", "quest_shared");
    journal.accept("bob", "quest_shared");
    journal.bind("entity.died");

    events.emit("entity.died", {
      instanceId: "e2",
      catalogId: "mob_elite",
      position: [0, 0, 0],
      reason: { kind: "player_kill", killerUserId: "alice" },
    });

    expect(journal.list("alice")[0]!.objectives[0]!.complete).toBe(true);
    expect(journal.list("bob")[0]!.objectives[0]!.complete).toBe(true);
  });

  test("inventory.added bind advances collect objectives", () => {
    const { events, journal } = createHarness();
    journal.register([clearCamp]);
    journal.accept("alice", "quest_clear_mobs");
    journal.bind("inventory.added");

    events.emit("inventory.added", { userId: "alice", item: "iron_ore", count: 2 });
    events.emit("inventory.added", { userId: "alice", item: "coal", count: 5 });

    const instance = journal.list("alice")[0]!;
    expect(instance.objectives.find((objective) => objective.id === "collect_ore")!.progress).toBe(2);
  });

  test("turnIn applies every reward kind and chains follow-up quests", () => {
    const harness = createHarness();
    const { journal, events } = harness;
    journal.register([clearCamp, nextInChain]);
    journal.accept("alice", "quest_clear_mobs");

    const completedEvents: string[] = [];
    const acceptedEvents: string[] = [];
    events.on("quest.completed", (event) => void completedEvents.push(event.questId));
    events.on("quest.accepted", (event) => void acceptedEvents.push(event.questId));

    expect(journal.turnIn("alice", "quest_clear_mobs")).toEqual({ reason: 'objective "kill_grunts" incomplete' });

    journal.progress("alice", "quest_clear_mobs", "kill_grunts", 2);
    journal.progress("alice", "quest_clear_mobs", "collect_ore", 3);
    expect(journal.canTurnIn("alice", "quest_clear_mobs")).toBeNull();
    expect(journal.turnIn("alice", "quest_clear_mobs")).toBeNull();

    expect(harness.xp).toEqual([{ userId: "alice", amount: 250 }]);
    expect(harness.economy).toEqual([{ userId: "alice", currencyId: "gold", amount: 15 }]);
    expect(harness.items).toEqual([{ userId: "alice", inventoryId: "backpack", itemId: "health_potion", count: 2 }]);
    expect(harness.unlocks).toEqual([{ userId: "alice", unlockId: "shop_tier_2" }]);
    expect(completedEvents).toEqual(["quest_clear_mobs"]);
    expect(acceptedEvents).toEqual(["quest_next_in_chain"]);

    const statuses = Object.fromEntries(journal.list("alice").map((quest) => [quest.questId, quest.status]));
    expect(statuses).toEqual({ quest_clear_mobs: "completed", quest_next_in_chain: "active" });
  });

  test("snapshot and hydrate round-trip per-user quest state", () => {
    const { journal } = createHarness();
    journal.register([clearCamp]);
    journal.accept("alice", "quest_clear_mobs");
    journal.progress("alice", "quest_clear_mobs", "kill_grunts", 1);

    const { journal: restored } = createHarness();
    restored.register([clearCamp]);
    restored.hydrate("alice", journal.snapshot("alice"));

    const instance = restored.list("alice")[0]!;
    expect(instance.status).toBe("active");
    expect(instance.objectives.find((objective) => objective.id === "kill_grunts")!.progress).toBe(1);
  });

  test("turnIn fails when inventory cannot accept reward items", () => {
    const events = createGameEvents();
    const completedEvents: string[] = [];
    events.on("quest.completed", (event) => void completedEvents.push(event.questId));
    const journal = createQuestJournal({
      events,
      rewards: {
        grantXp: () => undefined,
        grantEconomy: () => undefined,
        grantItem: () => ({ reason: "inventory full" }),
        grantUnlock: () => undefined,
      },
    });
    journal.register([clearCamp]);
    journal.accept("alice", "quest_clear_mobs");
    journal.progress("alice", "quest_clear_mobs", "kill_grunts", 2);
    journal.progress("alice", "quest_clear_mobs", "collect_ore", 3);

    expect(journal.turnIn("alice", "quest_clear_mobs")).toEqual({ reason: "inventory full" });
    expect(journal.list("alice")[0]!.status).toBe("active");
    expect(completedEvents).toEqual([]);
  });
});
