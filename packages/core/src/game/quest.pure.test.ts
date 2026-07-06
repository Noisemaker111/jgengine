import { describe, expect, test } from "bun:test";

import {
  applyQuestRewards,
  createQuestEvaluator,
  type QuestDef,
  type QuestSnapshotEntry,
} from "./quest";

const defs: QuestDef[] = [
  {
    id: "slay_rats",
    title: "Slay Rats",
    objectives: [{ id: "kill_rats", kind: "kill", target: "rat", count: 3 }],
    rewards: { xp: { amount: 100 }, economy: { coins: 50 }, unlocks: ["recipe_bread"], quests: ["gather_herbs"] },
  },
  {
    id: "gather_herbs",
    title: "Gather Herbs",
    requires: ["slay_rats"],
    objectives: [{ id: "collect_herb", kind: "collect", item: "herb", count: 2 }],
  },
  {
    id: "locked_quest",
    title: "Locked",
    requires: ["master_key"],
    objectives: [{ id: "noop", kind: "collect", item: "x", count: 1 }],
  },
];

function accepted(evaluator: ReturnType<typeof createQuestEvaluator>, questId: string): QuestSnapshotEntry[] {
  const result = evaluator.accept([], questId);
  if (!Array.isArray(result)) throw new Error(`accept rejected: ${result.reason}`);
  return result;
}

describe("pure quest evaluator", () => {
  test("accept requires prerequisites, satisfiable by a completed quest or an unlock", () => {
    const evaluator = createQuestEvaluator(defs);
    expect(evaluator.canAccept([], "gather_herbs")).toEqual({
      reason: 'quest "gather_herbs" requires "slay_rats"',
    });
    expect(evaluator.canAccept([], "locked_quest", { hasUnlock: (id) => id === "master_key" })).toBeNull();
    const completed: QuestSnapshotEntry[] = [{ questId: "slay_rats", status: "completed", progress: {} }];
    expect(evaluator.canAccept(completed, "gather_herbs")).toBeNull();
  });

  test("accept then progress advances and clamps objectives immutably", () => {
    const evaluator = createQuestEvaluator(defs);
    const s0 = accepted(evaluator, "slay_rats");
    const s1 = evaluator.progress(s0, "slay_rats", "kill_rats", 5);
    expect(s0).toEqual([{ questId: "slay_rats", status: "active", progress: {} }]);
    expect(s1[0]!.progress).toEqual({ kill_rats: 3 });
  });

  test("creditKill only advances matching kill objectives on active quests", () => {
    const evaluator = createQuestEvaluator(defs);
    let state = accepted(evaluator, "slay_rats");
    state = evaluator.creditKill(state, "wolf");
    expect(state[0]!.progress).toEqual({});
    state = evaluator.creditKill(state, "rat");
    state = evaluator.creditKill(state, "rat");
    expect(state[0]!.progress).toEqual({ kill_rats: 2 });
  });

  test("turnIn requires complete objectives, returns rewards as data, and unlocks follow-ups", () => {
    const evaluator = createQuestEvaluator(defs);
    let state = accepted(evaluator, "slay_rats");
    expect(evaluator.canTurnIn(state, "slay_rats")).toEqual({ reason: 'objective "kill_rats" incomplete' });

    state = evaluator.creditKill(state, "rat");
    state = evaluator.creditKill(state, "rat");
    state = evaluator.creditKill(state, "rat");

    const result = evaluator.turnIn(state, "slay_rats");
    if ("reason" in result) throw new Error(result.reason);
    expect(result.rewards).toEqual(defs[0]!.rewards!);

    const byId = new Map(result.state.map((e) => [e.questId, e.status]));
    expect(byId.get("slay_rats")).toBe("completed");
    expect(byId.get("gather_herbs")).toBe("active");
  });

  test("creditCollect advances collect objectives", () => {
    const evaluator = createQuestEvaluator(defs);
    const completed: QuestSnapshotEntry[] = [{ questId: "slay_rats", status: "completed", progress: {} }];
    let state = evaluator.accept(completed, "gather_herbs");
    if (!Array.isArray(state)) throw new Error(state.reason);
    state = evaluator.creditCollect(state, "herb", 2);
    const herb = state.find((e) => e.questId === "gather_herbs")!;
    expect(herb.progress).toEqual({ collect_herb: 2 });
    expect(evaluator.canTurnIn(state, "gather_herbs")).toBeNull();
  });

  test("grant completed fills progress and list reports objective completion", () => {
    const evaluator = createQuestEvaluator(defs);
    const state = evaluator.grant([], "slay_rats", { completed: true });
    const instances = evaluator.list(state);
    expect(instances[0]!.status).toBe("completed");
    expect(instances[0]!.objectives[0]).toEqual({
      id: "kill_rats",
      kind: "kill",
      count: 3,
      progress: 3,
      complete: true,
    });
  });

  test("applyQuestRewards fans a reward payload out to injected appliers", () => {
    const calls: string[] = [];
    applyQuestRewards(defs[0]!.rewards!, {
      grantXp: (amount) => calls.push(`xp:${amount}`),
      grantEconomy: (currency, amount) => calls.push(`eco:${currency}:${amount}`),
      grantUnlock: (id) => calls.push(`unlock:${id}`),
    });
    expect(calls).toEqual(["xp:100", "eco:coins:50", "unlock:recipe_bread"]);
  });
});
