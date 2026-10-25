import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "../../game/defineGame";
import { createAssetCatalog } from "../../scene/assetCatalog";
import { createGameContext } from "../gameContext";

function makeContext() {
  return createGameContext({
    definition: defineGameDefinition({ name: "Groups", assets: createAssetCatalog(), multiplayer: "off" }),
    content: { entityById: () => ({}), objectById: () => null },
    player: { userId: "user_a", isNew: true },
  });
}

describe("scene.entity.controlGroups", () => {
  test("notifies on change and drops a despawned entity from every group", () => {
    const ctx = makeContext();
    const a = ctx.scene.entity.spawn("unit", { position: [0, 0, 0] });
    const b = ctx.scene.entity.spawn("unit", { position: [1, 0, 0] });
    const before = ctx.version();
    ctx.scene.entity.controlGroups.bind("1", [a, b]);
    ctx.scene.entity.controlGroups.bind("2", [a]);
    expect(ctx.version()).toBeGreaterThan(before);
    ctx.scene.entity.despawn(a);
    expect(ctx.scene.entity.controlGroups.recall("1")).toEqual([b]);
    expect(ctx.scene.entity.controlGroups.has("2")).toBe(false);
  });
});
