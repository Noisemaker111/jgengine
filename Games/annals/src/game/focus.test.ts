import { describe, expect, test } from "bun:test";
import { defineGame } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { content } from "./content";
import { spawnCaravan } from "./caravans";
import { onInit } from "../loop";

function makeContext() {
  return createGameContext({
    definition: defineGame({ name: "The Annals", assets: createAssetCatalog(), multiplayer: "off" }),
    content,
    player: { userId: "observer", isNew: true },
  });
}

describe("click-to-follow via possession", () => {
  test("focusing a caravan swaps the active possessed entity; empty ground releases it", () => {
    const ctx = makeContext();
    onInit(ctx);
    const userId = ctx.player.userId;
    expect(ctx.player.possession.active(userId)).toBe(userId);

    spawnCaravan(ctx);
    const caravan = ctx.scene.entity.list().find((entity) => entity.name === "caravan");
    expect(caravan).toBeDefined();

    ctx.game.commands.run("annals.focus", { point: { x: 0, y: 0, z: 0 }, entity: caravan!.id, object: null });
    expect(ctx.player.possession.active(userId)).toBe(caravan!.id);

    ctx.game.commands.run("annals.focus", { point: { x: 0, y: 0, z: 0 }, entity: null, object: null });
    expect(ctx.player.possession.active(userId)).toBe(userId);
  });
});
