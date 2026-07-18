import { afterEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { memorySaveBackend, type SaveBackend } from "@jgengine/core/game/saveStore";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { activeCharacter, pickCharacter, resetCharacterState, talentTree } from "./characters";
import { resumeBuild } from "./commands";
import { characterIdStore, talentRanksStore } from "./stores";

afterEach(() => resetCharacterState());

function bootContext(backend: SaveBackend): GameContext {
  return createGameContext({
    definition: defineGameDefinition({
      name: "the-robots-save-test",
      assets: createAssetCatalog(),
      multiplayer: "off",
      persist: true,
      features: { quest: true },
    }),
    content: {},
    player: { userId: "p1", isNew: true },
    save: { backend, mode: "manual" },
  });
}

describe("the-robots whole-world save", () => {
  test("pick + spend -> reload -> resume restores the character and talent build", async () => {
    const backend = memorySaveBackend();

    const host = bootContext(backend);
    host.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
    pickCharacter("gunk");
    const tree = talentTree();
    if (tree === null) throw new Error("expected an active talent tree");
    tree.grantPoints(3);
    tree.allocate("sal_locked_loaded");
    tree.allocate("sal_locked_loaded");
    characterIdStore.write(host, "gunk");
    talentRanksStore.write(host, tree.snapshot().ranks);
    host.scene.entity.stats.set("p1", "skillPoints", { current: tree.pointsAvailable(), max: 30 });
    host.game.economy.grant("p1", "cores", 12);
    await host.game.save!.save();

    resetCharacterState();
    expect(activeCharacter()).toBeNull();

    const reboot = bootContext(backend);
    expect(await reboot.game.save!.load()).toBe(true);
    expect(resumeBuild(reboot)).toBe(true);

    expect(activeCharacter()?.id).toBe("gunk");
    const restored = talentTree();
    if (restored === null) throw new Error("expected a restored talent tree");
    expect(restored.snapshot().ranks["sal_locked_loaded"]).toBe(2);
    expect(restored.pointsAvailable()).toBe(1);
    expect(reboot.game.economy.balance("p1", "cores")).toBe(12);
  });

  test("an empty slot resumes to no build (character select)", async () => {
    const fresh = bootContext(memorySaveBackend());
    expect(await fresh.game.save!.load()).toBe(false);
    expect(resumeBuild(fresh)).toBe(false);
    expect(activeCharacter()).toBeNull();
  });
});
