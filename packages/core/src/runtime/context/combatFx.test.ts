import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../../game/defineGame";
import type { CombatVfxEvent } from "../../game/events";
import { createAssetCatalog } from "../../scene/assetCatalog";
import { createGameContext } from "../gameContext";
import type { CombatFx } from "./combatFx";

function makeContext() {
  return createGameContext({
    definition: defineGameDefinition({ name: "Slashes", assets: createAssetCatalog(), multiplayer: "off" }),
    content: { entityById: () => ({}), objectById: () => null },
    player: { userId: "user_a", isNew: true },
  });
}

describe("combat vfx", () => {
  test("a slash with no target sweeps where the attacker faces, not from its body center", () => {
    const ctx = makeContext();
    const events: CombatVfxEvent[] = [];
    ctx.game.events.on("combat.vfx", (event) => events.push(event));
    const fighter = ctx.scene.entity.spawn("fighter", { position: [1, 0, 1], rotationY: Math.PI / 2 });
    const vfx: CombatFx["emitVfx"] = ctx.scene.entity.vfx;
    vfx({ preset: "slash", from: fighter });
    expect(events[0]!.kind).toBe("arc");
    expect(events[0]!.to![0]).toBeCloseTo(2.5, 5);
    expect(events[0]!.to![2]).toBeCloseTo(1, 5);
  });

  test("a slash at a target keeps that target", () => {
    const ctx = makeContext();
    const events: CombatVfxEvent[] = [];
    ctx.game.events.on("combat.vfx", (event) => events.push(event));
    const fighter = ctx.scene.entity.spawn("fighter", { position: [0, 0, 0] });
    ctx.scene.entity.vfx({ preset: "slash", from: fighter, to: [0, 0, -3] });
    expect(events[0]!.to).toEqual([0, 0, -3]);
  });
});
