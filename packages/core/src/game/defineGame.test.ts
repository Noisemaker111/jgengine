import { describe, expect, test } from "bun:test";

import { createAssetCatalog } from "../scene/assetCatalog";
import { createGameContext } from "../runtime/gameContext";
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

  test("two contexts from one definition own isolated entity stores (#632)", () => {
    const definition = defineGame(VALID);
    const world1 = createGameContext({ definition, content: {}, player: { userId: "a", isNew: true } });
    const world2 = createGameContext({ definition, content: {}, player: { userId: "b", isNew: true } });

    world1.scene.entity.spawn("goblin", { id: "mob-1", position: [0, 0, 0] });

    expect(world1.scene.entity.get("mob-1")?.name).toBe("goblin");
    expect(world2.scene.entity.get("mob-1")).toBeNull(); // no bleed across worlds on one host
  });

  test("omitted assets resolve to an empty catalog", () => {
    const game = defineGame({ name: "NoAssets", multiplayer: "off" as const });
    expect(game.assets.ids()).toEqual([]);
    expect(game.assets.resolve("anything")).toBeNull();
    game.assets.register("crate", { url: "crate.glb" });
    expect(game.assets.ids()).toEqual(["crate"]);
    expect(defineGame({ name: "Other", multiplayer: "off" as const }).assets.ids()).toEqual([]);
  });

  test("rejects empty names", () => {
    expect(() => defineGame({ ...VALID, name: "  " })).toThrow("name");
  });

  test("defaults to an empty asset catalog when assets is omitted", () => {
    const { assets: _assets, ...withoutAssets } = VALID;
    const game = defineGame(withoutAssets);
    expect(game.assets.ids()).toEqual([]);
    expect(game.assets.has("anything")).toBe(false);
    game.assets.register("sword", { url: "sword.glb" });
    expect(game.assets.resolve("sword")).toEqual({ url: "sword.glb" });
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
