import { beforeEach, describe, expect, test } from "bun:test";
import { defineGame } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { content } from "../content";
import { resetSession, session, type UnitRuntime } from "../session";
import { tickUnits } from "./units";

/** Boot a real (headless) game context whose entity store seeds stats from our content, so
 * `effect("damage")` actually drains the `health` pool — the whole combat chain, no GPU. */
function bootContext(): GameContext {
  const definition = defineGame({ name: "IronholdTest", multiplayer: "off" });
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

  test("an adjacent footman actually drains an enemy's health", () => {
    const ctx = bootContext();
    spawn(ctx, "footman", "f1", [0, 0, 0], "player", { kind: "idle" });
    spawn(ctx, "grunt", "e1", [1.5, 0, 0], "enemy", { kind: "idle" });
    const before = health(ctx, "e1");
    for (let i = 0; i < 15; i++) tickUnits(ctx, 0.2);
    expect(health(ctx, "e1")).toBeLessThan(before);
  });

  test("a unit closes distance to an out-of-reach enemy before it can strike", () => {
    const ctx = bootContext();
    spawn(ctx, "footman", "f1", [0, 0, 0], "player", { kind: "idle" });
    spawn(ctx, "grunt", "e1", [6, 0, 0], "enemy", { kind: "idle" }); // in aggro (8), out of reach
    tickUnits(ctx, 0.3);
    expect(ctx.scene.entity.get("f1")!.position[0]).toBeGreaterThan(0);
  });

  test("both sides trade blows until one runs out of health", () => {
    const ctx = bootContext();
    spawn(ctx, "footman", "f1", [0, 0, 0], "player", { kind: "idle" });
    spawn(ctx, "grunt", "e1", [1.6, 0, 0], "enemy", { kind: "idle" });
    let killed = false;
    for (let i = 0; i < 400 && !killed; i++) {
      tickUnits(ctx, 0.1);
      if (health(ctx, "e1") <= 0 || health(ctx, "f1") <= 0) killed = true;
    }
    expect(killed).toBe(true);
    // The footman out-damages a lone grunt, so it should be the survivor.
    expect(health(ctx, "f1")).toBeGreaterThan(0);
  });

  test("attack-move pursues its destination across the field", () => {
    const ctx = bootContext();
    spawn(ctx, "grunt", "e1", [0, 0, -30], "enemy", { kind: "attackMove", x: 0, z: 30 });
    const startZ = ctx.scene.entity.get("e1")!.position[2];
    for (let i = 0; i < 20; i++) tickUnits(ctx, 0.2);
    expect(ctx.scene.entity.get("e1")!.position[2]).toBeGreaterThan(startZ);
  });
});
