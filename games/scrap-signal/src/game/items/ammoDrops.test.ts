import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { seededRng } from "@jgengine/core/random/rng";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { rollGun } from "../handroll";
import { inventories } from "../inventories";
import { ammoPackFor, ammoRollsFor, ammoStarved } from "./ammoDrops";

function bootContext(): GameContext {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "scrap-ammo-drops-test", assets: createAssetCatalog(), multiplayer: "off", inventories }),
    content: {},
    player: { userId: "p1", isNew: true },
  });
  ctx.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
  ctx.scene.entity.stats.set("p1", "ammo_pistol", { current: 180, max: 200 });
  ctx.scene.entity.stats.set("p1", "ammo_shotgun", { current: 10, max: 80 });
  return ctx;
}

describe("scrap-signal ammo drops", () => {
  test("no gun carried, no ammo drops", () => {
    expect(ammoPackFor(bootContext())).toBeNull();
  });

  test("ammo drops for the carried gun whose pool is emptiest", () => {
    const ctx = bootContext();
    const rng = seededRng("ammo-drops");
    ctx.player.inventory.put("hotbar", rollGun(rng, 1, { family: "pistol", rarity: "common" }).id, 1, { slot: 0 });
    expect(ammoPackFor(ctx)).toBe("ammo_pistol_pack");
    ctx.player.inventory.put("hotbar", rollGun(rng, 1, { family: "shotgun", rarity: "common" }).id, 1, { slot: 1 });
    expect(ammoPackFor(ctx)).toBe("ammo_shotgun_pack");
  });

  test("bosses always drop ammo, the rest only sometimes, and every kill while you are short", () => {
    expect(ammoRollsFor({ family: "boss", elite: true }, 0.99, false)).toBe(2);
    expect(ammoRollsFor({ family: "scrapjack", elite: false }, 0.1, false)).toBe(1);
    expect(ammoRollsFor({ family: "scrapjack", elite: false }, 0.9, false)).toBe(0);
    expect(ammoRollsFor({ family: "scrapjack", elite: false }, 0.9, true)).toBe(1);
  });

  test("short means a carried gun's pool is under a fifth full", () => {
    const ctx = bootContext();
    const rng = seededRng("starved");
    ctx.player.inventory.put("hotbar", rollGun(rng, 1, { family: "pistol", rarity: "common" }).id, 1, { slot: 0 });
    expect(ammoStarved(ctx)).toBe(false);
    ctx.player.inventory.put("hotbar", rollGun(rng, 1, { family: "shotgun", rarity: "common" }).id, 1, { slot: 1 });
    expect(ammoStarved(ctx)).toBe(true);
  });
});
