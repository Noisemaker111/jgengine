import { beforeEach, describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { canTrain, orderSelection, trainUnit } from "./commands";
import { createNoticeFeed, type Notice } from "@jgengine/core/game/notices";
import { activeJobs, queuedJobs, enqueue } from "@jgengine/core/gameplay";
import { TRAINING_CONFIG } from "./production";
import { resetSession, session } from "./session";

function ctxWith(positions: Map<string, EntityPosition>, wallet: Record<string, number> = {}): GameContext {
  const balances = { ...wallet };
  return {
    player: { userId: "commander" },
    scene: { entity: { get: (id: string) => (positions.has(id) ? { id, position: positions.get(id)! } : null) } },
    game: {
      audio: { play: () => {} },
      notices: createNoticeFeed(),
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

/** The newest field report the order pushed to the notice feed. */
function lastNotice(ctx: GameContext): Notice | undefined {
  return ctx.game.notices.list().at(-1);
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
    expect(session.units.get("f1")!.guardPoint?.x).toBeGreaterThan(5);
    expect(session.units.get("f1")!.guardPoint?.z).toBeGreaterThan(5);
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

  test("an accepted gather order reports the assignment", () => {
    session.units.set("w1", { id: "w1", catalogId: "peasant", faction: "player", kind: "unit", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
    session.nodes.set("mine", { id: "mine", resource: "gold", x: 10, z: 10 });
    const ctx = ctxWith(new Map<string, EntityPosition>([["w1", [0, 0, 0]]]));
    orderSelection(ctx, { selection: ["w1"], point: [10, 0, 10] });
    expect(lastNotice(ctx)?.text).toBe("Gathering gold: 1 worker assigned.");
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

  test("a bare right-click with nothing selected says to select troops", () => {
    const ctx = ctxWith(new Map<string, EntityPosition>(), { gold: 500, lumber: 500 });
    orderSelection(ctx, { point: [10, 0, 10] });
    expect(lastNotice(ctx)?.text).toStartWith("Select your troops first");
    expect(lastNotice(ctx)?.tone).toBe("deny");
  });

  test("the selection-less secondary right-click still places an armed building", () => {
    const ctx = ctxWith(new Map<string, EntityPosition>(), { gold: 500, lumber: 500 });
    session.buildArmed = "barracks";
    orderSelection(ctx, { point: [10, 0, 10] });
    expect(activeJobs(session.buildQueue).length + queuedJobs(session.buildQueue).length).toBe(1);
    expect(session.buildArmed).toBeNull();
  });

  test("placement is rejected in the enemy half", () => {
    const ctx = ctxWith(new Map<string, EntityPosition>(), { gold: 500, lumber: 500 });
    session.buildArmed = "farm";
    orderSelection(ctx, { selection: [], point: [0, 0, -30] });
    expect(activeJobs(session.buildQueue).length + queuedJobs(session.buildQueue).length).toBe(0);
    expect(session.buildArmed).toBe("farm"); // keep the tool armed for a retry
  });

  test("construction reserves its footprint before a building appears", () => {
    const ctx = ctxWith(new Map<string, EntityPosition>(), { gold: 500, lumber: 500 });
    session.buildArmed = "farm";
    orderSelection(ctx, { selection: [], point: [10, 0, 10] });
    session.buildArmed = "farm";
    orderSelection(ctx, { selection: [], point: [11, 0, 10] });
    expect(activeJobs(session.buildQueue).length + queuedJobs(session.buildQueue).length).toBe(1);
    expect(session.buildArmed).toBe("farm");
  });

  test("queued recruits reserve supply and paused orders cannot spend gold", () => {
    session.units.set("hall", { id: "hall", catalogId: "keep_player", faction: "player", kind: "building", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
    session.supplyCap = 1;
    const result = enqueue(session.production, TRAINING_CONFIG, { unitId: "peasant" });
    if (!result.ok) throw new Error("Failed to queue a peasant");
    session.production = result.state;
    const ctx = ctxWith(new Map<string, EntityPosition>(), { gold: 500, lumber: 500 });
    expect(canTrain(ctx, "peasant")).toBe(false);
    session.paused = true;
    session.buildArmed = "farm";
    orderSelection(ctx, { selection: [], point: [10, 0, 10] });
    expect(ctx.game.economy.balance("commander", "gold")).toBe(500);
    expect(activeJobs(session.buildQueue).length).toBe(0);
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

describe("order and train feedback", () => {
  beforeEach(() => {
    resetSession();
    session.started = true;
  });

  test("a refused train order explains itself as a deny notice", () => {
    addKeep();
    const ctx = ctxWith(new Map<string, EntityPosition>(), { gold: 10 });
    trainUnit(ctx, "peasant");
    expect(lastNotice(ctx)).toMatchObject({ text: "Not enough gold for Peasant.", tone: "deny" });
  });

  test("a footman without a Barracks is told what it needs", () => {
    addKeep();
    const ctx = ctxWith(new Map<string, EntityPosition>(), { gold: 500, lumber: 500 });
    trainUnit(ctx, "footman");
    expect(lastNotice(ctx)?.text).toBe("Footman needs a Barracks first.");
  });

  test("an accepted train order confirms what is training and where", () => {
    addKeep();
    const ctx = ctxWith(new Map<string, EntityPosition>(), { gold: 500 });
    trainUnit(ctx, "peasant");
    expect(lastNotice(ctx)?.text).toBe("Training Peasant at the Town Hall.");
  });

  test("order notices count units with the right noun", () => {
    addPlayerUnit("f1");
    const ctx = ctxWith(new Map<string, EntityPosition>([["f1", [0, 0, 0]]]));
    orderSelection(ctx, { selection: ["f1"], point: [10, 0, 10] });
    expect(lastNotice(ctx)?.text).toBe("Move ordered: 1 trooper.");
  });
});

function addKeep(): void {
  session.units.set("keep", { id: "keep", catalogId: "keep_player", faction: "player", kind: "building", command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
}
