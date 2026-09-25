import { describe, expect, test } from "bun:test";

import { createDecisionGraphRuntime } from "./decisionGraph";
import { createMobBrain, type MobBrainMode, type MobVec3 } from "./mobBrain";
import { mobBrainGraph } from "./mobBrainGraph";

const HOME: MobVec3 = [0, 0, 0];
const config = { aggroRadius: 10, attackRange: 2, leashDistance: 30, wander: false as const };

function harness(players: Record<string, MobVec3 | null>) {
  const state = { mob: HOME as MobVec3, players };
  const brain = createMobBrain(config, {
    home: HOME,
    position: () => state.mob,
    targetPosition: (id) => state.players[id] ?? null,
    candidates: () => Object.keys(state.players),
  });
  let chosen = "";
  const graph = createDecisionGraphRuntime(mobBrainGraph, {
    evade: () => { chosen = "evade"; return "running"; },
    engage: () => { chosen = "engage"; return "running"; },
    chase: () => { chosen = "chase"; return "running"; },
    wanderOrIdle: () => { chosen = "wanderOrIdle"; return "running"; },
  });
  let previousMode: MobBrainMode = "idle";
  let previousTarget: string | null = null;
  const step = (): { brain: MobBrainMode; graph: string } => {
    const result = brain.tick(0.1);
    const fromHome = Math.hypot(state.mob[0] - HOME[0], state.mob[2] - HOME[2]);
    graph.tick({}, {
      evading: previousMode === "evade" && fromHome > 1.2,
      targetId: result.targetId ?? (previousMode === "evade" ? "" : previousTarget ?? ""),
      leashExceeded: fromHome > config.leashDistance,
      inAttackRange: result.inAttackRange,
    }, 0.1);
    previousMode = result.mode;
    previousTarget = result.targetId;
    return { brain: result.mode, graph: chosen };
  };
  return { state, brain, step };
}

const expected: Record<MobBrainMode, string> = { idle: "wanderOrIdle", wander: "wanderOrIdle", chase: "chase", engage: "engage", evade: "evade" };

describe("mobBrainGraph", () => {
  test("chases, engages and idles like mobBrain", () => {
    for (const players of [{ far: [50, 0, 0], near: [5, 0, 0] }, { p: [1.5, 0, 0] }, { p: [11, 0, 0] }] as Record<string, MobVec3>[]) {
      const { step } = harness(players);
      const decision = step();
      expect(decision.graph).toBe(expected[decision.brain]);
    }
  });

  test("leashes, keeps evading, ignores threat, and settles home like mobBrain", () => {
    const { state, brain, step } = harness({ p: [5, 0, 0] });
    const modes: string[] = [];
    const check = () => {
      const decision = step();
      modes.push(decision.brain);
      expect(decision.graph).toBe(expected[decision.brain]);
    };
    check();
    state.mob = [31, 0, 0];
    check();
    brain.addThreat("p", 100);
    check();
    state.mob = [1, 0, 0];
    check();
    expect(modes).toEqual(["chase", "evade", "evade", "idle"]);
  });

  test("follows a target switch when the first target despawns", () => {
    const { state, brain, step } = harness({ a: [3, 0, 0], b: [4, 0, 0] });
    brain.addThreat("a", 10);
    brain.addThreat("b", 5);
    expect(step()).toEqual({ brain: "chase", graph: "chase" });
    state.players["a"] = null;
    expect(step()).toEqual({ brain: "chase", graph: "chase" });
  });
});
