import { describe, expect, test } from "bun:test";
import { defineGame } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { content } from "./content";
import { SPAWN_HEADING, SPAWN_POSITION, TRACK_SURFACE_HEIGHT } from "./race/track";
import { onNewPlayer, onTick } from "../loop";
import { world } from "../world";

const STEP = 1 / 60;

function boot(): GameContext {
  const ctx = createGameContext({
    definition: defineGame({ name: "SpeedCircuitTest", assets: createAssetCatalog(), multiplayer: "off", world }),
    content,
    player: { userId: "p1", isNew: true },
  });
  onNewPlayer(ctx);
  return ctx;
}

describe("speed-circuit rest pose", () => {
  test("spawn sits on the embanked track surface above the raw terrain field", () => {
    const ctx = boot();
    const rawGround = ctx.world.groundHeightAt(SPAWN_POSITION[0], SPAWN_POSITION[2]);
    expect(SPAWN_POSITION[1]).toBe(TRACK_SURFACE_HEIGHT + 0.5);
    expect(SPAWN_POSITION[1]).toBeGreaterThan(rawGround);
  });

  test("countdown tick re-asserts the spawn pose after an external grounding write", () => {
    const ctx = boot();
    const rawGround = ctx.world.groundHeightAt(SPAWN_POSITION[0], SPAWN_POSITION[2]);
    ctx.scene.entity.setPose("p1", { position: [SPAWN_POSITION[0], rawGround, SPAWN_POSITION[2]] });

    onTick(ctx, STEP);

    const player = ctx.scene.entity.get("p1");
    expect(player?.position[1]).toBe(SPAWN_POSITION[1]);
    expect(player?.position[0]).toBe(SPAWN_POSITION[0]);
    expect(player?.position[2]).toBe(SPAWN_POSITION[2]);
    expect(player?.rotationY).toBeCloseTo(SPAWN_HEADING, 5);
  });
});
