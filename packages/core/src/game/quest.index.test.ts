import { describe, expect, test } from "bun:test";
import { createGameEvents } from "./events";
import { createQuestEvaluator, createQuestJournal, type QuestDef, type QuestJournalDeps } from "./quest";

function harness(partyMembersNear?: QuestJournalDeps["partyMembersNear"]) {
  const events = createGameEvents();
  const journal = createQuestJournal({
    events,
    rewards: {
      grantXp() {},
      grantEconomy() {},
      grantItem() { return null; },
      grantUnlock() {},
    },
    partyMembersNear,
  });
  return {
    journal,
    events,
    kill(userId = "alice", target = "wolf") {
      events.emit("entity.died", {
        instanceId: "wolf-1", catalogId: target, position: [0, 0, 0],
        reason: { kind: "player_kill", killerUserId: userId },
      });
    },
    collect(userId = "alice", item = "ore", count = 1) {
      events.emit("inventory.added", { userId, item, count });
    },
  };
}

function quest(id: string, shared = false): QuestDef {
  return {
    id, title: id,
    objectives: [
      { id: "kill", kind: "kill", target: "wolf", count: 10,
        ...(shared ? { partyShare: { radius: 40, credit: "all" as const } } : {}) },
      { id: "collect", kind: "collect", item: "ore", count: 10 },
    ],
  };
}

describe("quest credit indexes", () => {
  test("100,000 matching catalog definitions visit only the active quest on credit", () => {
    let definitionReads = 0;
    let objectiveReads = 0;
    let partyQueries = 0;
    const { journal, kill, collect } = harness(() => { partyQueries++; return []; });
    const defs = Array.from({ length: 100_000 }, (_, i) => {
      const def = quest(`q${i}`, true);
      const objectives = def.objectives;
      for (const objective of objectives) {
        const id = objective.id;
        Object.defineProperty(objective, "id", { get() { objectiveReads++; return id; } });
      }
      Object.defineProperty(def, "objectives", { get() { definitionReads++; return objectives; } });
      return def;
    });
    journal.register(defs);
    journal.accept("alice", "q99999");
    journal.bind("entity.died");
    journal.bind("inventory.added");
    definitionReads = 0;
    objectiveReads = 0;
    kill();
    collect();
    expect(definitionReads).toBe(2);
    expect(objectiveReads).toBe(5);
    expect(partyQueries).toBe(1);
    expect(journal.snapshot("alice")[0]!.progress).toEqual({ kill: 1, collect: 1 });
    definitionReads = 0;
    objectiveReads = 0;
    kill("alice", "unmatched");
    collect("alice", "unmatched");
    expect(definitionReads).toBe(0);
    expect(objectiveReads).toBe(0);
  });

  test("collect and direct kills exclude other users' active matching quests", () => {
    let definitionReads = 0;
    let objectiveReads = 0;
    const { journal, kill, collect } = harness();
    const defs = Array.from({ length: 1_000 }, (_, i) => {
      const def = quest(`q${i}`);
      const objectives = def.objectives;
      for (const objective of objectives) {
        const id = objective.id;
        Object.defineProperty(objective, "id", { get() { objectiveReads++; return id; } });
      }
      Object.defineProperty(def, "objectives", { get() { definitionReads++; return objectives; } });
      return def;
    });
    journal.register(defs);
    for (const def of defs) journal.accept("bob", def.id);
    journal.accept("alice", "q999");
    journal.bind("entity.died");
    journal.bind("inventory.added");
    definitionReads = 0;
    objectiveReads = 0;
    kill();
    collect();
    expect(definitionReads).toBe(2);
    expect(objectiveReads).toBe(5);
    expect(journal.snapshot("bob").every((entry) => Object.keys(entry.progress).length === 0)).toBe(true);
  });

  test("party credit does not require the killer to have a quest and honors per-objective policy", () => {
    const queries: number[] = [];
    const { journal, kill } = harness((_user, radius) => {
      queries.push(radius);
      return radius === 40 ? ["bob", "bob", "carol"] : [];
    });
    const shared = quest("shared", true);
    shared.objectives.push({ id: "far", kind: "kill", target: "wolf", count: 10,
      partyShare: { radius: 2, credit: "all" } });
    const tagger = quest("tagger");
    tagger.objectives[0]!.partyShare = { radius: 40, credit: "tagger" };
    journal.register([shared, tagger]);
    journal.accept("bob", "shared");
    journal.accept("carol", "shared");
    journal.accept("bob", "tagger");
    journal.bind("entity.died");
    kill();
    expect(queries).toEqual([40, 2]);
    expect(journal.snapshot("bob")[0]!.progress).toEqual({ kill: 1 });
    expect(journal.snapshot("carol")[0]!.progress).toEqual({ kill: 1 });
    expect(journal.snapshot("bob")[1]!.progress).toEqual({});
    journal.accept("alice", "shared");
    kill();
    expect(queries).toEqual([40, 2, 40, 2]);
    expect(journal.snapshot("alice")[0]!.progress).toEqual({ kill: 1, far: 1 });
  });

  test("10,000 users sharing one quest keep one shared objective candidate", () => {
    let queries = 0;
    const { journal, kill } = harness(() => { queries++; return ["u9999"]; });
    journal.register([quest("shared", true)]);
    for (let i = 0; i < 10_000; i++) journal.accept(`u${i}`, "shared");
    journal.bind("entity.died");
    kill();
    expect(queries).toBe(1);
    expect(journal.snapshot("u9999")[0]!.progress).toEqual({ kill: 1 });
    expect(journal.snapshot("u0")[0]!.progress).toEqual({});
    for (let i = 0; i < 9_999; i++) journal.revoke(`u${i}`, "shared");
    kill();
    expect(queries).toBe(2);
    expect(journal.snapshot("u9999")[0]!.progress).toEqual({ kill: 2 });
    journal.revoke("u9999", "shared");
    kill();
    expect(queries).toBe(2);
  });

  test("activation order and replacement retain catalog and objective event order", () => {
    const { journal, events, kill, collect } = harness(() => ["bob"]);
    journal.register([quest("first", true), quest("second", true)]);
    journal.accept("bob", "second");
    journal.accept("alice", "second");
    journal.accept("alice", "first");
    journal.accept("bob", "first");
    journal.register([quest("first", true)]);
    journal.bind("entity.died");
    journal.bind("inventory.added");
    const updates: string[] = [];
    events.on("quest.updated", (e) => { updates.push(`${e.questId}:${e.objectiveId}:${e.userId}`); });
    kill();
    collect();
    expect(updates).toEqual([
      "first:kill:alice", "first:kill:bob", "second:kill:alice", "second:kill:bob",
      "first:collect:alice", "second:collect:alice",
    ]);
  });

  test("definition replacement retargets active users and removes old shared credit", () => {
    let queries = 0;
    const { journal, kill, collect } = harness(() => { queries++; return ["bob"]; });
    journal.register([quest("q", true)]);
    journal.accept("bob", "q");
    journal.bind("entity.died");
    journal.bind("inventory.added");
    const next = quest("q");
    next.objectives[0]!.target = "bear";
    next.objectives[1]!.item = "wood";
    journal.register({ q: next });
    kill();
    collect("bob");
    expect(queries).toBe(0);
    expect(journal.snapshot("bob")[0]!.progress).toEqual({});
    kill("bob", "bear");
    collect("bob", "wood", 2);
    expect(journal.snapshot("bob")[0]!.progress).toEqual({ kill: 1, collect: 2 });
  });

  test("re-registering edited definitions removes their original routing keys", () => {
    let queries = 0;
    const { journal, kill, collect } = harness(() => { queries++; return ["bob"]; });
    const def = quest("q", true);
    journal.register([def]);
    journal.accept("bob", "q");
    journal.bind("entity.died");
    journal.bind("inventory.added");
    def.objectives[0]!.target = "bear";
    def.objectives[0]!.partyShare = { radius: 40, credit: "tagger" };
    def.objectives[1]!.item = "wood";
    journal.register([def]);
    kill("bob");
    collect("bob");
    kill("alice", "bear");
    expect(queries).toBe(0);
    expect(journal.snapshot("bob")[0]!.progress).toEqual({});
    kill("bob", "bear");
    collect("bob", "wood");
    expect(journal.snapshot("bob")[0]!.progress).toEqual({ kill: 1, collect: 1 });
    def.objectives[0]!.kind = "collect";
    def.objectives[0]!.item = "wood";
    journal.register([def]);
    kill("bob", "bear");
    collect("bob", "wood");
    expect(journal.snapshot("bob")[0]!.progress).toEqual({ kill: 2, collect: 2 });
  });

  test("grant, abandon, revoke, completion, and hydration maintain shared index membership", () => {
    let queries = 0;
    const { journal, kill } = harness(() => { queries++; return ["bob"]; });
    journal.register([quest("q", true)]);
    journal.bind("entity.died");
    const assertIndexed = (expected: boolean) => {
      const before = queries;
      kill();
      expect(queries - before).toBe(expected ? 1 : 0);
    };
    journal.grant("bob", "q");
    journal.grant("bob", "q");
    assertIndexed(true);
    expect(journal.snapshot("bob")[0]!.progress).toEqual({ kill: 1 });
    journal.abandon("bob", "q");
    assertIndexed(false);
    journal.accept("bob", "q");
    journal.revoke("bob", "q");
    assertIndexed(false);
    journal.grant("bob", "q");
    journal.grant("bob", "q", { completed: true });
    assertIndexed(false);
    journal.grant("bob", "q");
    journal.progress("bob", "q", "kill", 10);
    journal.progress("bob", "q", "collect", 10);
    expect(journal.turnIn("bob", "q")).toBeNull();
    assertIndexed(false);
    journal.hydrate("bob", [{ questId: "q", status: "active", progress: {} }]);
    assertIndexed(true);
    journal.hydrate("bob", []);
    assertIndexed(false);
    journal.hydrateAll({ bob: [{ questId: "q", status: "active", progress: {} }] });
    assertIndexed(true);
    journal.hydrateAll({ bob: [{ questId: "q", status: "completed", progress: {} }] });
    assertIndexed(false);
    journal.hydrateAll({});
    expect(journal.snapshotAll()).toEqual({});
    assertIndexed(false);
  });

  test("hydrated unknown definitions activate when registered, with duplicate entries using their final status", () => {
    const { journal, kill, collect } = harness(() => ["bob"]);
    journal.hydrate("bob", [{ questId: "q", status: "active", progress: { collect: 2 } }]);
    journal.hydrate("alice", [
      { questId: "q", status: "active", progress: {} },
      { questId: "q", status: "completed", progress: {} },
    ]);
    journal.bind("entity.died");
    journal.bind("inventory.added");
    journal.register([quest("q", true)]);
    kill();
    collect("bob");
    expect(journal.snapshot("bob")[0]!.progress).toEqual({ collect: 3, kill: 1 });
    expect(journal.snapshot("alice")[0]!.progress).toEqual({});
  });

  test("unbind and rebind do not duplicate or lose active candidates", () => {
    const { journal, kill, collect } = harness();
    journal.register([quest("q")]);
    journal.accept("alice", "q");
    const offKill = journal.bind("entity.died");
    const offCollect = journal.bind("inventory.added");
    kill();
    collect();
    offKill();
    offCollect();
    kill();
    collect();
    journal.bind("entity.died");
    journal.bind("inventory.added");
    kill();
    collect();
    expect(journal.snapshot("alice")[0]!.progress).toEqual({ kill: 2, collect: 2 });
  });

  test("reentrant activation starts with the next event and removal does not skip remaining candidates", () => {
    const { journal, events, kill, collect } = harness();
    journal.register([quest("first"), quest("second"), quest("third")]);
    journal.accept("alice", "first");
    journal.accept("alice", "second");
    journal.bind("entity.died");
    journal.bind("inventory.added");
    events.on("quest.updated", (e) => {
      if (e.questId === "first") {
        journal.abandon("alice", "first");
        journal.accept("alice", "third");
      }
    });
    kill();
    expect(journal.snapshot("alice")).toEqual([
      { questId: "second", status: "active", progress: { kill: 1 } },
      { questId: "third", status: "active", progress: {} },
    ]);
    journal.accept("alice", "first");
    journal.revoke("alice", "third");
    collect();
    expect(journal.snapshot("alice")).toEqual([
      { questId: "second", status: "active", progress: { kill: 1, collect: 1 } },
      { questId: "third", status: "active", progress: {} },
    ]);
    kill();
    expect(journal.snapshot("alice")[1]!.progress).toEqual({ kill: 1 });
  });

  test("nested events get independent candidate snapshots", () => {
    const { journal, events, kill } = harness();
    journal.register([quest("first"), quest("second")]);
    journal.accept("alice", "first");
    journal.bind("entity.died");
    let nested = false;
    events.on("quest.updated", () => {
      if (!nested) {
        nested = true;
        journal.accept("alice", "second");
        kill();
      }
    });
    kill();
    expect(journal.snapshot("alice")).toEqual([
      { questId: "first", status: "active", progress: { kill: 2 } },
      { questId: "second", status: "active", progress: { kill: 1 } },
    ]);
  });

  test("bound credit preserves pure evaluator progress across mixed lifecycle operations", () => {
    const defs = [quest("first"), quest("second")];
    const evaluator = createQuestEvaluator(defs);
    const { journal, kill, collect } = harness();
    journal.register(defs);
    journal.bind("entity.died");
    journal.bind("inventory.added");
    let state = evaluator.grant([], "second");
    journal.grant("alice", "second");
    state = evaluator.grant(state, "first");
    journal.grant("alice", "first");
    for (let i = 0; i < 20; i++) {
      kill();
      state = evaluator.creditKill(state, "wolf");
      collect("alice", "ore", i % 2 === 0 ? 2 : -1);
      state = evaluator.creditCollect(state, "ore", i % 2 === 0 ? 2 : -1);
      expect(journal.snapshot("alice")).toEqual(state);
    }
    journal.revoke("alice", "first");
    state = evaluator.revoke(state, "first");
    journal.hydrate("alice", state);
    kill();
    expect(journal.snapshot("alice")).toEqual(evaluator.creditKill(state, "wolf"));
  });
});
