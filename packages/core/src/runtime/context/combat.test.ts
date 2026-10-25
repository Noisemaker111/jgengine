import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../../game/defineGame";
import type { ProjectileSettledEvent } from "../../game/events";
import { createAssetCatalog } from "../../scene/assetCatalog";
import { createGameContext } from "../gameContext";

function makeContext() {
  return createGameContext({
    definition: defineGameDefinition({ name: "Impacts", assets: createAssetCatalog(), multiplayer: "off" }),
    content: { entityById: () => ({ stats: { health: { max: 5 } } }), objectById: () => null },
    player: { userId: "user_a", isNew: true },
  });
}

describe("projectile.settled tags", () => {
  test("a shot's item and impact class reach the settled event, so the impact layer can pick its preset", () => {
    const ctx = makeContext();
    const shots: ProjectileSettledEvent[] = [];
    ctx.game.events.on("projectile.settled", (event) => shots.push(event));
    const attacker = ctx.scene.entity.spawn("attacker", { position: [0, 0, 0] });
    ctx.scene.entity.spawn("dummy", { position: [3, 0, 0] });
    const shot = ctx.scene.entity.fireProjectile({
      from: attacker,
      via: { amount: 0 },
      aim: { yaw: Math.PI / 2, pitch: 0 },
      effect: "damage",
      impact: "explosive",
    });
    ctx.scene.entity.settleProjectile(shot);
    expect(shots).toHaveLength(1);
    expect(shots[0]!.impact).toBe("explosive");
    expect(shots[0]!.item).toBeUndefined();
  });
});
