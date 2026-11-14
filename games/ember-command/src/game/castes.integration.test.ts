import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { forageHoldsAtLane, tickUnits } from "./ai/units";
import { YARD } from "./yardInstance";
import { combatantDef } from "./catalog";
import { content } from "./content";
import { beamSpeedAt, BEAM_SPEED } from "./hazards";
import { raiseAlarm } from "./pheromone";
import { resetSession, session, type UnitRuntime } from "./session";
import { ACID_SECONDS } from "./tuning";

function boot(): GameContext {
  const definition = defineGameDefinition({ name: "LawnOrderCastesTest", multiplayer: "off" });
  return createGameContext({ definition, content, player: { userId: "commander", isNew: true } });
}

function spawn(ctx: GameContext, catalogId: string, id: string, pos: EntityPosition, faction: "player" | "enemy", command: UnitRuntime["command"] = { kind: "idle" }): void {
  ctx.scene.entity.spawn(catalogId, { id, position: pos, role: "npc" });
  const kind = combatantDef(catalogId)?.kind ?? "unit";
  session.units.set(id, { id, catalogId, faction, kind, command, leash: 0, attackCooldown: 0 });
}

function health(ctx: GameContext, id: string): number {
  return ctx.scene.entity.stats.get(id, "health")?.current ?? 0;
}

describe("caste depth", () => {
  beforeEach(() => resetSession());

  test("a spitter's acid leaves its target slowed for a moment", () => {
    const ctx = boot();
    spawn(ctx, "spitter", "spit", [0, 0, 0], "player");
    spawn(ctx, "raider", "victim", [5, 0, 0], "enemy", { kind: "hold" });
    for (let i = 0; i < 10 && session.acid["victim"] === undefined; i += 1) tickUnits(ctx, 0.2);
    expect(session.acid["victim"]).toBeGreaterThan(session.elapsed);
    expect(session.acid["victim"]! - session.elapsed).toBeLessThanOrEqual(ACID_SECONDS);
  });

  test("a soldier inside an alarm cloud bites harder than one outside it", () => {
    const hits: number[] = [];
    for (const alarmed of [false, true]) {
      resetSession();
      const ctx = boot();
      spawn(ctx, "soldier", "bite", [0, 0, 0], "player");
      spawn(ctx, "major", "target", [1.5, 0, 0], "enemy", { kind: "hold" });
      if (alarmed) raiseAlarm(session.alarms, 0, 0, session.elapsed);
      const before = health(ctx, "target");
      for (let i = 0; i < 3; i += 1) tickUnits(ctx, 0.1);
      hits.push(before - health(ctx, "target"));
    }
    expect(hits[0]).toBeGreaterThan(0);
    expect(hits[1]! / hits[0]!).toBeCloseTo(1.25, 2);
  });

  test("foragers wait at the mower lane's edge while it warns, and walk on once it has passed", () => {
    const lane = YARD.mowerLane!;
    const forager: UnitRuntime = { id: "w", catalogId: "worker", faction: "player", kind: "unit", command: { kind: "gather", nodeId: "n", resource: "sugar", phase: "toNode", carried: 0, timer: 0 }, leash: 0, attackCooldown: 0 };
    const edge: [number, number, number] = [0, 0, lane.from.z + lane.halfWidth + 1];
    const across = { x: 0, z: lane.from.z - 20 };
    expect(forageHoldsAtLane(forager, edge, across.x, across.z)).toBe(false);
    session.hazards.mower.phase = "warning";
    expect(forageHoldsAtLane(forager, edge, across.x, across.z)).toBe(true);
    // Already inside the lane: the commander has to save it.
    expect(forageHoldsAtLane(forager, [0, 0, lane.from.z], across.x, across.z)).toBe(false);
    // Soldiers march wherever they are ordered.
    expect(forageHoldsAtLane({ ...forager, command: { kind: "move", x: 0, z: -20 } }, edge, across.x, across.z)).toBe(false);
  });

  test("the kid gets impatient: the beam drags faster as the battle wears on, up to double", () => {
    expect(beamSpeedAt(0)).toBe(BEAM_SPEED);
    expect(beamSpeedAt(120)).toBeGreaterThan(BEAM_SPEED);
    expect(beamSpeedAt(10_000)).toBe(BEAM_SPEED * 2);
  });
});
