import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { combatantDef } from "../catalog";
import { content } from "../content";
import { playerDepot, resetSession, session, type UnitRuntime } from "../session";
import { matchupDamage, matchups } from "../matchups";
import { GOLD } from "../tuning";
import { acquireTarget, tickUnits } from "./units";

function boot(): GameContext {
  const definition = defineGameDefinition({ name: "EmberCommandTargetsTest", multiplayer: "off" });
  return createGameContext({ definition, content, player: { userId: "commander", isNew: true } });
}

function spawn(ctx: GameContext, catalogId: string, id: string, pos: EntityPosition, faction: "player" | "enemy", command: UnitRuntime["command"] = { kind: "idle" }): void {
  ctx.scene.entity.spawn(catalogId, { id, position: pos, role: "npc" });
  const kind = combatantDef(catalogId)?.kind ?? "unit";
  session.units.set(id, { id, catalogId, faction, kind, command, leash: 0, attackCooldown: 0, ...(kind === "building" ? { guardPoint: { x: pos[0], z: pos[2] } } : {}) });
}

function at(ctx: GameContext, id: string): EntityPosition {
  const entity = ctx.scene.entity.get(id);
  if (entity === null) throw new Error(`${id} is gone`);
  return entity.position;
}

describe("who the Marauders go for", () => {
  beforeEach(() => resetSession());

  test("a Marauder passes the footman beside it for the peasant down the road", () => {
    const ctx = boot();
    spawn(ctx, "grunt", "raider", [0, 0, 0], "enemy");
    spawn(ctx, "footman", "guard", [2, 0, 0], "player");
    spawn(ctx, "peasant", "miner", [5, 0, 0], "player");
    expect(acquireTarget(ctx, session.units.get("raider")!, at(ctx, "raider"), 8)).toBe("miner");
  });

  test("a Reaver goes for the building over the soldier, and hits it twice as hard", () => {
    const ctx = boot();
    spawn(ctx, "reaver", "breaker", [0, 0, 0], "enemy");
    spawn(ctx, "footman", "guard", [2, 0, 0], "player");
    spawn(ctx, "farm", "farm", [5, 0, 0], "player");
    expect(acquireTarget(ctx, session.units.get("breaker")!, at(ctx, "breaker"), 9)).toBe("farm");
    const unit = (id: string) => session.units.get(id)!;
    expect(matchupDamage(matchups(ctx), 17, unit("breaker"), unit("farm"), 2)).toBe(34);
    expect(matchupDamage(matchups(ctx), 17, unit("breaker"), unit("guard"), 2)).toBe(17);
    expect(matchupDamage(matchups(ctx), 8, { id: "raider", catalogId: "grunt" }, unit("farm"), 2)).toBe(8);
  });

  test("a preference never reaches past the aggro radius", () => {
    const ctx = boot();
    spawn(ctx, "grunt", "raider", [0, 0, 0], "enemy");
    spawn(ctx, "footman", "guard", [2, 0, 0], "player");
    spawn(ctx, "peasant", "miner", [12, 0, 0], "player");
    expect(acquireTarget(ctx, session.units.get("raider")!, at(ctx, "raider"), 8)).toBe("guard");
  });

  test("player soldiers still take the nearest threat", () => {
    const ctx = boot();
    spawn(ctx, "footman", "guard", [0, 0, 0], "player");
    spawn(ctx, "grunt", "near", [2, 0, 0], "enemy");
    spawn(ctx, "warcamp", "camp", [5, 0, 0], "enemy");
    expect(acquireTarget(ctx, session.units.get("guard")!, at(ctx, "guard"), 8)).toBe("near");
  });
});

describe("harvest logistics", () => {
  beforeEach(() => resetSession());

  test("a Barracks raised by the fields is the nearer drop-off, and a hauled load banks there", () => {
    const ctx = boot();
    spawn(ctx, "keep_player", "keep", [0, 0, 0], "player");
    spawn(ctx, "barracks", "rax", [60, 0, 0], "player");
    expect(playerDepot({ x: 64, z: 0 })?.id).toBe("rax");
    expect(playerDepot({ x: 10, z: 0 })?.id).toBe("keep");
    // A peasant carrying a load next to the Barracks hands it in there instead of walking home.
    spawn(ctx, "peasant", "miner", [62, 0, 0], "player", { kind: "gather", nodeId: "mine", resource: GOLD, phase: "toDepot", carried: 12, timer: 0 });
    const before = ctx.game.economy.balance("commander", GOLD);
    tickUnits(ctx, 0.1);
    expect(ctx.game.economy.balance("commander", GOLD) - before).toBe(12);
    expect(at(ctx, "miner")[0]).toBeGreaterThan(55);
  });

  test("a Farm is not a drop-off", () => {
    const ctx = boot();
    spawn(ctx, "keep_player", "keep", [0, 0, 0], "player");
    spawn(ctx, "farm", "farm", [60, 0, 0], "player");
    expect(playerDepot({ x: 64, z: 0 })?.id).toBe("keep");
  });
});
