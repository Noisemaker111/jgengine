import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { content } from "../content";
import { resetSession, session, type UnitRuntime } from "../session";
import { tickTowers } from "./towers";

/** Boot a real headless context whose entity store seeds stats from content, so an `effect("damage")`
 * actually drains the target's `health` pool — the whole tower→damage chain, no GPU. */
function boot(): GameContext {
  const definition = defineGameDefinition({ name: "IronholdTowerTest", multiplayer: "off" });
  return createGameContext({ definition, content, player: { userId: "p1", isNew: true } });
}

function place(
  ctx: GameContext,
  catalogId: string,
  id: string,
  pos: EntityPosition,
  faction: "player" | "enemy",
  kind: UnitRuntime["kind"],
): void {
  ctx.scene.entity.spawn(catalogId, { id, position: pos, role: "npc" });
  session.units.set(id, { id, catalogId, faction, kind, command: { kind: "idle" }, leash: 0, attackCooldown: 0 });
}

function health(ctx: GameContext, id: string): number {
  return ctx.scene.entity.stats.get(id, "health")?.current ?? -1;
}

describe("guard tower auto-fire (real context)", () => {
  beforeEach(() => resetSession());

  test("fires on a hostile inside range and drains its health", () => {
    const ctx = boot();
    place(ctx, "guard_tower", "t1", [0, 0, 0], "player", "building");
    place(ctx, "grunt", "e1", [5, 0, 0], "enemy", "unit"); // inside range (9)
    const before = health(ctx, "e1");
    for (let i = 0; i < 10; i++) tickTowers(ctx, 0.2);
    expect(health(ctx, "e1")).toBeLessThan(before);
  });

  test("holds fire against a hostile out of range", () => {
    const ctx = boot();
    place(ctx, "guard_tower", "t1", [0, 0, 0], "player", "building");
    place(ctx, "grunt", "e1", [20, 0, 0], "enemy", "unit"); // beyond range (9)
    const before = health(ctx, "e1");
    for (let i = 0; i < 10; i++) tickTowers(ctx, 0.2);
    expect(health(ctx, "e1")).toBe(before);
  });

  test("never fires on a friendly unit", () => {
    const ctx = boot();
    place(ctx, "guard_tower", "t1", [0, 0, 0], "player", "building");
    place(ctx, "footman", "f1", [4, 0, 0], "player", "unit");
    const before = health(ctx, "f1");
    for (let i = 0; i < 10; i++) tickTowers(ctx, 0.2);
    expect(health(ctx, "f1")).toBe(before);
  });

  test("respects the fire cooldown — one shot, then a pause before the next", () => {
    const ctx = boot();
    place(ctx, "guard_tower", "t1", [0, 0, 0], "player", "building"); // attackCooldown 1.1s
    place(ctx, "grunt", "e1", [3, 0, 0], "enemy", "unit");
    const start = health(ctx, "e1");
    tickTowers(ctx, 0.2); // first shot lands immediately (cooldown starts at 0)
    const afterFirst = health(ctx, "e1");
    expect(afterFirst).toBeLessThan(start);
    // A tick well within the 1.1s cooldown must not land a second shot.
    tickTowers(ctx, 0.2);
    expect(health(ctx, "e1")).toBe(afterFirst);
  });

  test("an inert building (no damage) never fires", () => {
    const ctx = boot();
    place(ctx, "keep_player", "hold", [0, 0, 0], "player", "building"); // damage 0
    place(ctx, "grunt", "e1", [3, 0, 0], "enemy", "unit");
    const before = health(ctx, "e1");
    for (let i = 0; i < 10; i++) tickTowers(ctx, 0.2);
    expect(health(ctx, "e1")).toBe(before);
  });
});
