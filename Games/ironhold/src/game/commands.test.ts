import { beforeEach, describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { canTrain, orderSelection } from "./commands";
import { activeJobs, queuedJobs } from "@jgengine/core/gameplay";
import { resetSession, session } from "./session";

function ctxWith(positions: Map<string, EntityPosition>, wallet: Record<string, number> = {}): GameContext {
  const balances = { ...wallet };
  return {
    player: { userId: "commander" },
    scene: { entity: { get: (id: string) => (positions.has(id) ? { id, position: positions.get(id)! } : null) } },
    game: {
      economy: {
        balance: (_u: string, c: string) => balances[c] ?? 0,
        charge: (_u: string, c: string, a: number) => {
          balances[c] = (balances[c] ?? 0) - a;
          return null;
        },
      },
    },
  } as unknown as GameContext;
}

function addPlayerUnit(id: string): void {
  session.units.set(id, { id, catalogId: "footman", faction: "player", kind: "unit", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
}

function addEnemy(id: string): void {
  session.units.set(id, { id, catalogId: "grunt", faction: "enemy", kind: "unit", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
}

describe("right-click order routing", () => {
  beforeEach(() => resetSession());

  test("empty ground orders the group to move", () => {
    addPlayerUnit("f1");
    addPlayerUnit("f2");
    const ctx = ctxWith(new Map<string, EntityPosition>([["f1", [0, 0, 0]], ["f2", [2, 0, 0]]]));
    orderSelection(ctx, { selection: ["f1", "f2"], point: [10, 0, 10] });
    expect(session.units.get("f1")!.command.kind).toBe("move");
    expect(session.units.get("f2")!.command.kind).toBe("move");
  });

  test("clicking a hostile focus-fires it", () => {
    addPlayerUnit("f1");
    addEnemy("e1");
    const ctx = ctxWith(new Map<string, EntityPosition>([["f1", [0, 0, 0]], ["e1", [10, 0, 10]]]));
    orderSelection(ctx, { selection: ["f1"], point: [10, 0, 10] });
    const command = session.units.get("f1")!.command;
    expect(command.kind).toBe("attack");
    expect(command.kind === "attack" && command.targetId).toBe("e1");
  });

  test("armed attack-move issues an attack-move order and disarms", () => {
    addPlayerUnit("f1");
    session.attackMoveArmed = true;
    const ctx = ctxWith(new Map<string, EntityPosition>([["f1", [0, 0, 0]]]));
    orderSelection(ctx, { selection: ["f1"], point: [10, 0, 10] });
    expect(session.units.get("f1")!.command.kind).toBe("attackMove");
    expect(session.attackMoveArmed).toBe(false);
  });

  test("orders never touch enemy units in the selection", () => {
    addEnemy("e1");
    const ctx = ctxWith(new Map<string, EntityPosition>([["e1", [0, 0, 0]]]));
    orderSelection(ctx, { selection: ["e1"], point: [10, 0, 10] });
    expect(session.units.get("e1")!.command.kind).toBe("idle");
  });

  test("right-clicking a resource node sends a peasant to gather it", () => {
    session.units.set("w1", { id: "w1", catalogId: "peasant", faction: "player", kind: "unit", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
    session.nodes.set("mine", { id: "mine", resource: "gold", x: 10, z: 10 });
    const ctx = ctxWith(new Map<string, EntityPosition>([["w1", [0, 0, 0]]]));
    orderSelection(ctx, { selection: ["w1"], point: [10, 0, 10] });
    const command = session.units.get("w1")!.command;
    expect(command.kind).toBe("gather");
    expect(command.kind === "gather" && command.resource).toBe("gold");
  });

  test("a footman right-clicking a node just moves (cannot gather)", () => {
    addPlayerUnit("f1");
    session.nodes.set("mine", { id: "mine", resource: "gold", x: 10, z: 10 });
    const ctx = ctxWith(new Map<string, EntityPosition>([["f1", [0, 0, 0]]]));
    orderSelection(ctx, { selection: ["f1"], point: [10, 0, 10] });
    expect(session.units.get("f1")!.command.kind).toBe("move");
  });
});

describe("base building", () => {
  beforeEach(() => resetSession());

  test("an armed right-click on a valid spot queues construction and charges", () => {
    const ctx = ctxWith(new Map<string, EntityPosition>(), { gold: 500, lumber: 500 });
    session.buildArmed = "barracks";
    orderSelection(ctx, { selection: [], point: [10, 0, 10] });
    expect(activeJobs(session.buildQueue).length + queuedJobs(session.buildQueue).length).toBe(1);
    expect(session.buildArmed).toBeNull();
    expect(ctx.game.economy.balance("commander", "gold")).toBeLessThan(500);
  });

  test("placement is rejected in the enemy half", () => {
    const ctx = ctxWith(new Map<string, EntityPosition>(), { gold: 500, lumber: 500 });
    session.buildArmed = "farm";
    orderSelection(ctx, { selection: [], point: [0, 0, -30] });
    expect(activeJobs(session.buildQueue).length + queuedJobs(session.buildQueue).length).toBe(0);
  });

  test("Footman/Rifleman need a Barracks; Peasant does not", () => {
    session.units.set("hall", { id: "hall", catalogId: "keep_player", faction: "player", kind: "building", command: { kind: "idle" }, guardPoint: { x: 0, z: 0 }, leash: 0, attackCooldown: 0 });
    const ctx = ctxWith(new Map<string, EntityPosition>(), { gold: 500, lumber: 500 });
    expect(canTrain(ctx, "peasant")).toBe(true);
    expect(canTrain(ctx, "footman")).toBe(false);
    session.units.set("br", { id: "br", catalogId: "barracks", faction: "player", kind: "building", command: { kind: "idle" }, guardPoint: { x: 5, z: 5 }, leash: 0, attackCooldown: 0 });
    expect(canTrain(ctx, "footman")).toBe(true);
  });
});
