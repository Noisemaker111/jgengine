import { afterEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { seededRng } from "@jgengine/core/random/rng";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { activeCharacter, pickCharacter, resetCharacterState, talentTree } from "./characters";
import { resolveGunHit, syncCombatTargets, isFluxed } from "./combat/hitModel";
import { earn, cashEntries } from "./cash";
import {
  consumeRound,
  enterDowned,
  gunById,
  magLoaded,
  reserveSave,
  rollGun,
  type GunDef,
} from "./handroll";
import { createScrapSave, armWorldSave, followWorldSave, scrapSave } from "./save";
import { inventories } from "./inventories";
import { session } from "./session";
import { characterIdStore, reserveStore, selectedSlotStore, talentRanksStore } from "./stores";

afterEach(() => resetCharacterState());

const KEY = "jgengine:save:scrap-document";

function boot(backend = memorySaveBackend()): GameContext {
  return createGameContext({
    definition: defineGameDefinition({
      name: "scrap-signal-save-document-test",
      assets: createAssetCatalog(),
      multiplayer: "off",
      persist: true,
      features: { quest: true, trade: true },
      inventories,
    }),
    content: {},
    player: { userId: "p1", isNew: true },
    save: { backend, key: KEY, mode: "manual" },
  });
}

function fluxGun(): GunDef {
  return {
    id: "gun_test_flux",
    kind: "gun",
    name: "Fluxed Test",
    family: "pistol",
    manufacturer: "Apex",
    rarity: "common",
    element: "flux",
    level: 1,
    ammo: "pistol",
    auto: false,
    ammoPerShot: 1,
    magSize: 8,
    reloadMs: 900,
    elementChance: 4,
    elementDps: 4,
    use: "fireGun",
    weapon: { damage: 7, range: 40, spread: 1, fireIntervalMs: 200, critChance: 0.1, critMult: 2 },
  };
}

function runState(ctx: GameContext) {
  const picked = rollGun(seededRng("save-document-gun"), 4, { family: "pistol" });
  ctx.player.inventory.put("hotbar", picked.id, 1, { slot: 0 });
  for (let shot = 0; shot < 5; shot += 1) consumeRound(ctx, picked);
  session.selectSlot(ctx, 2);
  enterDowned(ctx);
  return picked;
}

describe("scrap-signal save document", () => {
  test("round trip restores the systems the run mounts", async () => {
    const backend = memorySaveBackend();
    const host = boot(backend);
    host.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
    host.scene.entity.spawn("husk", { id: "enemy-1", position: [4, 0, 0] });
    syncCombatTargets(host);

    pickCharacter("gunk");
    const tree = talentTree();
    if (tree === null) throw new Error("expected a talent tree");
    tree.grantPoints(3);
    tree.allocate("gunk_hot_chamber");
    tree.allocate("gunk_hot_chamber");

    const gun = runState(host);
    const loadedBefore = magLoaded(host, gun);
    expect(loadedBefore).toBeLessThan(gun.magSize);
    const flux = fluxGun();
    expect(resolveGunHit(host, flux, "p1", "enemy-1", 4).damage).toBeGreaterThan(0);
    expect(isFluxed(host, "enemy-1")).toBe(true);
    earn(host, "cores", 9, "kill-cores", "husk");

    const hostDocument = createScrapSave(host, { backend, slot: "relay" });
    const digestBefore = hostDocument.digest();
    await host.game.save!.save();
    await hostDocument.save();

    resetCharacterState();
    const reboot = boot(backend);
    reboot.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
    reboot.scene.entity.spawn("husk", { id: "enemy-1", position: [4, 0, 0] });
    const rebootDocument = createScrapSave(reboot, { backend, slot: "relay" });
    await reboot.game.save!.load();
    await rebootDocument.load();

    expect(activeCharacter()?.id).toBe("gunk");
    expect(talentTree()?.snapshot().ranks["gunk_hot_chamber"]).toBe(2);
    expect(talentTree()?.pointsAvailable()).toBe(1);
    expect(characterIdStore.read(reboot)).toBe("gunk");
    expect(talentRanksStore.read(reboot)["gunk_hot_chamber"]).toBe(2);

    expect(session.selectedSlot()).toBe(2);
    expect(selectedSlotStore.read(reboot)).toBe(2);
    expect(reserveSave(reboot)["p1"]?.phase).toBe("downed");
    expect(reserveStore.read(reboot).phase).toBe("downed");

    // The rolled gun and its loaded rounds: the hotbar shows 7 of 12, not a refilled magazine.
    expect(gunById(gun.id)).toBeDefined();
    expect(magLoaded(reboot, gun)).toBe(loadedBefore);

    // A carried flux debuff survives, so the next hit on that body is still amplified.
    expect(isFluxed(reboot, "enemy-1")).toBe(true);

    // The journal came back with its reasons, aligned to the restored wallet.
    expect(cashEntries(reboot).some((entry) => entry.reason === "kill-cores")).toBe(true);
    expect(reboot.game.economy.balance("p1", "cores")).toBe(9);

    // Same state-bearing document on both sides: nothing hand-written drifted between save and load.
    expect(createScrapSave(reboot, { backend, slot: "relay" }).digest()).toBe(digestBefore);
  });

  test("a reload mid-run restores what the HUD shows, not a fresh magazine", async () => {
    const backend = memorySaveBackend();
    const host = boot(backend);
    host.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
    pickCharacter("nyx");
    const gun = runState(host);
    const loaded = magLoaded(host, gun);
    await createScrapSave(host, { backend, slot: "mid-run" }).save();

    const reboot = boot(backend);
    reboot.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
    await createScrapSave(reboot, { backend, slot: "mid-run" }).load();

    expect(activeCharacter()?.id).toBe("nyx");
    expect(magLoaded(reboot, gun)).toBe(loaded);
    expect(reserveStore.read(reboot).phase).toBe("downed");
    expect(selectedSlotStore.read(reboot)).toBe(2);
  });

  test("the document mirrors world saves only after boot has applied", async () => {
    const backend = memorySaveBackend();
    const ctx = boot(backend);
    ctx.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
    const document = scrapSave(ctx);
    const stop = followWorldSave(ctx);

    // A world *load* notifies subscribers too; before arming, that must not overwrite the mid-run slot.
    const before = document.revision();
    await ctx.game.save!.save();
    expect(document.revision()).toBe(before);

    armWorldSave(ctx);
    await ctx.game.save!.save();
    expect(document.revision()).toBeGreaterThan(before);
    stop();
  });

  test("an empty slot resets the mounted systems instead of leaving the last run behind", async () => {    const backend = memorySaveBackend();
    const host = boot(backend);
    host.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
    pickCharacter("cipher");
    session.selectSlot(host, 3);
    await createScrapSave(host, { backend, slot: "empty" }).save();

    resetCharacterState();
    const fresh = boot(backend);
    fresh.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
    await createScrapSave(fresh, { backend, slot: "other-slot" }).load();
    expect(activeCharacter()).toBeNull();
    expect(session.selectedSlot()).toBe(0);
  });
});


