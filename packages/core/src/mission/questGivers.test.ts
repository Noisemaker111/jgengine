import { describe, expect, test } from "bun:test";

import { createGameEvents } from "../game/events";
import { createQuestJournal, type QuestDef } from "./quest";
import { giverOffer, questTurnInTo } from "./questGivers";

const catalog: QuestDef[] = [
  { id: "first", title: "First", giver: "bolt", objectives: [{ id: "k", kind: "kill", target: "brat", count: 1 }] },
  { id: "second", title: "Second", giver: "bolt", requires: ["first"], objectives: [{ id: "k", kind: "kill", target: "brat", count: 1 }] },
  { id: "late", title: "Late", giver: "bolt", objectives: [{ id: "k", kind: "kill", target: "boss", count: 1 }] },
  { id: "radio", title: "Radio", giver: "bolt", turnIn: "rigg", requires: ["second"], objectives: [{ id: "k", kind: "kill", target: "brat", count: 1 }] },
];

function journal() {
  const quests = createQuestJournal({
    events: createGameEvents(),
    rewards: { grantXp() {}, grantEconomy() {}, grantItem: () => null, grantUnlock() {} },
  });
  quests.register(catalog);
  return quests;
}

describe("giverOffer", () => {
  test("a giver hands out one quest at a time, in catalog order, and takes it back when done", () => {
    const quests = journal();
    const late = { eligible: (def: QuestDef) => def.id !== "late" };
    expect(giverOffer(quests, "p", "bolt", catalog, late)).toEqual({ kind: "give", questId: "first" });
    quests.accept("p", "first");
    expect(giverOffer(quests, "p", "bolt", catalog, late)).toEqual({ kind: "busy", questId: "first" });
    quests.progress("p", "first", "k", 1);
    expect(giverOffer(quests, "p", "bolt", catalog, late)).toEqual({ kind: "turnIn", questId: "first" });
    quests.turnIn("p", "first");
    expect(giverOffer(quests, "p", "bolt", catalog, late)).toEqual({ kind: "give", questId: "second" });
    expect(giverOffer(quests, "p", "bolt", catalog)).toEqual({ kind: "give", questId: "second" });
  });

  test("a quest is turned in to its turnIn giver, not the one that gave it", () => {
    const quests = journal();
    for (const id of ["first", "second"]) {
      quests.accept("p", id);
      quests.progress("p", id, "k", 1);
      quests.turnIn("p", id);
    }
    quests.accept("p", "radio");
    quests.progress("p", "radio", "k", 1);
    const radio = catalog.find((def) => def.id === "radio");
    expect(radio === undefined ? undefined : questTurnInTo(radio)).toBe("rigg");
    expect(giverOffer(quests, "p", "rigg", catalog)).toEqual({ kind: "turnIn", questId: "radio" });
    expect(giverOffer(quests, "p", "bolt", catalog)).toEqual({ kind: "busy", questId: "radio" });
    expect(giverOffer(quests, "p", "nobody", catalog)).toEqual({ kind: "none" });
  });
});
