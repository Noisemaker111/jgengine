import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { memorySaveBackend, type SaveBackend } from "@jgengine/core/game/saveStore";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { bestRaceStore, continueStore, safehouseStore, startedStore } from "./commands";
import { content } from "./content";
import { normalizeAfterRestore } from "../loop";
import { grantCred } from "./progression/cred";
import { QUESTS } from "./quests/catalog";

function bootContext(backend: SaveBackend): GameContext {
  return createGameContext({
    definition: defineGameDefinition({
      name: "vice-isle-save-test",
      assets: createAssetCatalog(),
      multiplayer: "off",
      persist: true,
      features: { quest: true },
    }),
    content,
    player: { userId: "p1", isNew: true },
    save: { backend, mode: "manual" },
  });
}

describe("vice-isle whole-world save", () => {
  test("cash, cred, quests, safehouse, and best lap survive a reboot", async () => {
    const backend = memorySaveBackend();

    const host = bootContext(backend);
    host.scene.entity.spawn("street_runner", { id: "p1", position: [0, 0, 0], role: "player" });
    host.game.quest!.register(QUESTS);
    host.game.quest!.grant("p1", "m1_welcome");
    host.game.quest!.progress("p1", "m1_welcome", "meet_marco", 1);
    expect(host.game.quest!.turnIn("p1", "m1_welcome")).toBeNull();
    host.game.economy.grant("p1", "cash", 1234);
    grantCred(host, 500);
    safehouseStore.write(host, true);
    bestRaceStore.write(host, 61.4);
    await host.game.save!.save();

    const reboot = bootContext(backend);
    reboot.scene.entity.spawn("street_runner", { id: "p1", position: [0, 0, 0], role: "player" });
    reboot.game.quest!.register(QUESTS);
    expect(await reboot.game.save!.load()).toBe(true);

    expect(reboot.game.economy.balance("p1", "cash")).toBe(1234 + 200);
    expect(reboot.scene.entity.stats.get("p1", "level")?.current).toBeGreaterThanOrEqual(2);
    const journal = reboot.game.quest!.list("p1");
    expect(journal.find((q) => q.questId === "m1_welcome")?.status).toBe("completed");
    expect(journal.find((q) => q.questId === "m2_dock_sweep")?.status).toBe("active");
    expect(safehouseStore.read(reboot)).toBe(true);
    expect(bestRaceStore.read(reboot)).toBe(61.4);
  });

  test("an empty slot loads nothing", async () => {
    const fresh = bootContext(memorySaveBackend());
    expect(await fresh.game.save!.load()).toBe(false);
  });

  test("a restore drops a fresh boot at the title screen", () => {
    const ctx = bootContext(memorySaveBackend());
    ctx.scene.entity.spawn("street_runner", { id: "p1", position: [0, 0, 0], role: "player" });
    normalizeAfterRestore(ctx);
    expect(startedStore.read(ctx)).not.toBe(true);
    expect(continueStore.read(ctx)).toBe(true);
  });

  test("a restore keeps an already-live session live so shoot --mode play does not bounce to the menu", () => {
    const ctx = bootContext(memorySaveBackend());
    ctx.scene.entity.spawn("street_runner", { id: "p1", position: [0, 0, 0], role: "player" });
    // capture.play dispatches game.start before the async restore resolves.
    startedStore.write(ctx, true);
    normalizeAfterRestore(ctx);
    expect(startedStore.read(ctx)).toBe(true);
    expect(continueStore.read(ctx)).toBe(true);
  });
});
