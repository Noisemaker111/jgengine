import { beforeEach, describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { orderSelection } from "./commands";
import { resetSession, session } from "./session";

function ctxWith(positions: Map<string, EntityPosition>): GameContext {
  return {
    scene: { entity: { get: (id: string) => (positions.has(id) ? { id, position: positions.get(id)! } : null) } },
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
});
