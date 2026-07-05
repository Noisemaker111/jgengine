import { describe, expect, test } from "bun:test";

import { createAssetCatalog } from "../scene/assetCatalog";
import { flat } from "../world/features";
import { defineGame } from "./defineGame";

const VALID = {
  name: "TestGame",
  assets: createAssetCatalog(),
  multiplayer: "off" as const,
};

describe("defineGame", () => {
  test("keeps the definition and attaches a scene entity store", () => {
    const game = defineGame(VALID);
    expect(game.name).toBe(VALID.name);
    expect(game.assets).toBe(VALID.assets);
    expect(game.multiplayer).toBe(VALID.multiplayer);
    const id = game.scene.spawn("bench", { position: [1, 0, 2] });
    expect(game.scene.get(id)?.name).toBe("bench");
  });

  test("each definition owns its own scene store", () => {
    const first = defineGame(VALID);
    const second = defineGame(VALID);
    first.scene.spawn("bench");
    expect(second.scene.list()).toEqual([]);
  });

  test("rejects empty names", () => {
    expect(() => defineGame({ ...VALID, name: "  " })).toThrow("name");
  });

  test("carries platform config through untouched", () => {
    const loop = { onInit: () => {} };
    const game = defineGame({
      ...VALID,
      world: flat(),
      physics: { gravity: -32 },
      inventories: { backpack: { slots: 9, accepts: ["ammo", "consumable"] } },
      input: { jump: ["space"], crouch: { hold: ["KeyC"], toggle: ["KeyZ"] } },
      server: "persistent",
      save: { auto: "5m", scope: "player+chunks" },
      ui: "GameUI",
      loop,
    });
    expect(game.world).toEqual({ kind: "flat" });
    expect(game.physics).toEqual({ gravity: -32 });
    expect(game.inventories?.backpack?.slots).toBe(9);
    expect(game.input?.jump).toEqual(["space"]);
    expect(game.server).toBe("persistent");
    expect(game.save).toEqual({ auto: "5m", scope: "player+chunks" });
    expect(game.ui).toBe("GameUI");
    expect(game.loop).toBe(loop);
  });
});
