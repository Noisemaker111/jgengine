import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { content } from "../content";
import { resetSession, session, type UnitRuntime } from "../session";
import { tickUnits } from "./units";

/** Boot a real (headless) game context whose entity store seeds stats from our content, so
 * `effect("damage")` actually drains the `health` pool — the whole combat chain, no GPU. */
function bootContext(): GameContext {
  const definition = defineGameDefinition({ name: "EmberCommandTest", multiplayer: "off" });
  return createGameContext({ definition, content, player: { userId: "p1", isNew: true } });
}

function spawn(ctx: GameContext, catalogId: string, id: string, pos: EntityPosition, faction: "player" | "enemy", command: UnitRuntime["command"]): void {
  ctx.scene.entity.spawn(catalogId, { id, position: pos, role: "npc" });
  session.units.set(id, { id, catalogId, faction, kind: "unit", command, leash: 0, attackCooldown: 0 });
}

function health(ctx: GameContext, id: string): number {
  return ctx.scene.entity.stats.get(id, "health")?.current ?? -1;
}

describe("combat integration (real context)", () => {
  beforeEach(() => resetSession());

  test("an adjacent soldier actually drains an enemy's health", () => {
    const ctx = bootContext();
    spawn(ctx, "soldier", "f1", [0, 0, 0], "player", { kind: "idle" });
    spawn(ctx, "raider", "e1", [1.5, 0, 0], "enemy", { kind: "idle" });
    const before = health(ctx, "e1");
    for (let i = 0; i < 15; i++) tickUnits(ctx, 0.2);
    expect(health(ctx, "e1")).toBeLessThan(before);
  });

  test("a unit closes distance to an out-of-reach enemy before it can strike", () => {
    const ctx = bootContext();
    spawn(ctx, "soldier", "f1", [0, 0, 0], "player", { kind: "idle" });
    spawn(ctx, "raider", "e1", [6, 0, 0], "enemy", { kind: "idle" }); // in aggro (8), out of reach
    tickUnits(ctx, 0.3);
    expect(ctx.scene.entity.get("f1")!.position[0]).toBeGreaterThan(0);
  });

  test("both sides trade blows until one runs out of health", () => {
    const ctx = bootContext();
    spawn(ctx, "soldier", "f1", [0, 0, 0], "player", { kind: "idle" });
    spawn(ctx, "raider", "e1", [1.6, 0, 0], "enemy", { kind: "idle" });
    let killed = false;
    for (let i = 0; i < 400 && !killed; i++) {
      tickUnits(ctx, 0.1);
      if (health(ctx, "e1") <= 0 || health(ctx, "f1") <= 0) killed = true;
    }
    expect(killed).toBe(true);
    // The soldier out-damages a lone raider, so it should be the survivor.
    expect(health(ctx, "f1")).toBeGreaterThan(0);
  });

  test("attack-move pursues its destination across the field", () => {
    const ctx = bootContext();
    spawn(ctx, "raider", "e1", [0, 0, -30], "enemy", { kind: "attackMove", x: 0, z: 30 });
    const startZ = ctx.scene.entity.get("e1")!.position[2];
    for (let i = 0; i < 20; i++) tickUnits(ctx, 0.2);
    expect(ctx.scene.entity.get("e1")!.position[2]).toBeGreaterThan(startZ);
  });
});


describe("roster positioning and target choices", () => {
  function hit(attacker: string, target: string, distance: number): number {
    resetSession();
    const ctx = bootContext();
    spawn(ctx, attacker, "attacker", [0, 0, 0], "player", { kind: "attack", targetId: "target" });
    spawn(ctx, target, "target", [distance, 0, 0], "enemy", { kind: "hold" });
    const before = health(ctx, "target");
    tickUnits(ctx, 0.1);
    return before - health(ctx, "target");
  }

  test("rifles win a normal ranged exchange, soldiers win the armored matchup", () => {
    expect(hit("spitter", "raider", 6)).toBeGreaterThan(hit("soldier", "raider", 1.5));
    expect(hit("soldier", "major", 1.5)).toBeGreaterThan(hit("spitter", "major", 6));
  });

  test("letting a raider through the screen cuts rifle damage, without cutting soldier damage", () => {
    const ranged = hit("spitter", "raider", 6);
    expect(hit("spitter", "raider", 1.5)).toBeLessThan(ranged / 2);
    expect(hit("soldier", "raider", 1.5)).toBeGreaterThan(hit("spitter", "raider", 1.5));
  });
});
