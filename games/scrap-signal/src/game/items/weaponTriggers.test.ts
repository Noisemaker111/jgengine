import { afterEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { seededRng } from "@jgengine/core/random/rng";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { AMMO_LABELS, AMMO_STAT_IDS } from "../ammo";
import { pickCharacter, resetCharacterState } from "../characters";
import { registerCommands } from "../commands";
import { content } from "../content";
import { playerDef } from "../entities/players/catalog";
import { lastShot, noteEquipped } from "../feel";
import { effectiveMagSize, effectiveReloadMs, gunById, isReloading, magLoaded, rollGun, tickReloads, type GunDef } from "../handroll";
import { inventories } from "../inventories";
import { session } from "../session";
import { itemUseHandlers, weaponTriggers } from "./use-handlers";

afterEach(() => resetCharacterState());

interface Rig {
  ctx: GameContext;
  gun: GunDef;
  shots: number[];
  sounds: number;
  projectiles: number;
  warnings: string[];
  fire(): void;
  wait(seconds: number): void;
  reserve(): number;
}

function rig(reserve: number): Rig {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "scrap-triggers-test", assets: createAssetCatalog(), multiplayer: "off", inventories }),
    content,
    player: { userId: "p1", isNew: true },
  });
  ctx.scene.entity.spawn(playerDef.id, { id: "p1", position: [0, 0, 0] });
  pickCharacter("gunk");
  registerCommands(ctx);
  ctx.item.use.register(itemUseHandlers);
  const gun = gunById(rollGun(seededRng("triggers-pistol"), 1, { family: "pistol" }).id)!;
  ctx.player.inventory.put("hotbar", gun.id, 1, { slot: 0 });
  session.selectSlot(ctx, 0);
  noteEquipped(gun.id);
  ctx.scene.entity.stats.set("p1", AMMO_STAT_IDS[gun.ammo], { current: reserve, max: 400 });
  const r: Rig = {
    ctx,
    gun,
    shots: [],
    sounds: 0,
    projectiles: 0,
    warnings: [],
    fire: () => ctx.game.commands.run("fire", { aim: { yaw: 0, pitch: 0 } }),
    wait(seconds) {
      for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
        ctx.time.advance(1 / 60);
        tickReloads(ctx, 1 / 60);
      }
    },
    reserve: () => ctx.scene.entity.stats.get("p1", AMMO_STAT_IDS[gun.ammo])?.current ?? Number.NaN,
  };
  const fireProjectile = ctx.scene.entity.fireProjectile.bind(ctx.scene.entity);
  ctx.scene.entity.fireProjectile = (input) => {
    r.projectiles += 1;
    return fireProjectile(input);
  };
  weaponTriggers(ctx).onShot((shot) => r.shots.push(shot.shot));
  ctx.game.events.on("audio.play", () => { r.sounds += 1; });
  ctx.game.events.on("entity.floatText", (event) => { if (event.text.startsWith("NO ")) r.warnings.push(event.text); });
  return r;
}

describe("scrap-signal weapon triggers", () => {
  test("a magazine on the shared ammo stat counts every round through fire, dry pulls and reloads", () => {
    const probe = rig(0);
    const capacity = effectiveMagSize(probe.gun);
    const perShot = probe.gun.ammoPerShot;
    const shotsPerMag = Math.floor(capacity / perShot);
    const r = rig(capacity + perShot);
    const cycle = r.gun.weapon.fireIntervalMs / 1000 + 0.05;
    const reload = effectiveReloadMs(r.gun) / 1000 + 0.05;

    // A full magazine empties one ammoPerShot at a time; the reserve stat is not touched.
    for (let shot = 1; shot <= shotsPerMag; shot += 1) {
      r.fire();
      expect(magLoaded(r.ctx, r.gun)).toBe(capacity - shot * perShot);
      expect(r.reserve()).toBe(capacity + perShot);
      r.wait(cycle);
    }
    // The dry pull starts a reload instead of a shot.
    r.fire();
    expect(isReloading(r.ctx, r.gun)).toBe(true);
    expect(r.shots).toHaveLength(shotsPerMag);
    r.wait(reload);
    const refilled = shotsPerMag * perShot;
    expect(magLoaded(r.ctx, r.gun)).toBe(capacity);
    expect(r.reserve()).toBe(capacity + perShot - refilled);

    // Empty it again: the second reload only has what is left in the pool.
    for (let shot = 0; shot < shotsPerMag; shot += 1) {
      r.fire();
      r.wait(cycle);
    }
    const leftInMag = capacity - shotsPerMag * perShot;
    r.fire();
    r.wait(reload);
    const drawn = Math.min(capacity - leftInMag, capacity + perShot - refilled);
    expect(magLoaded(r.ctx, r.gun)).toBe(leftInMag + drawn);
    expect(r.reserve()).toBe(capacity + perShot - refilled - drawn);

    // Every shot that left the barrel was presented once: one trigger shot, one report, one projectile.
    expect(r.shots).toEqual(Array.from({ length: 2 * shotsPerMag }, (_, i) => i + 1));
    expect(r.sounds).toBe(r.shots.length);
    expect(r.projectiles).toBe(r.shots.length);
    expect(lastShot().family).toBe(r.gun.family);
    expect(r.warnings).toEqual([]);
  });

  test("the trigger waits out its interval, and an empty pool warns instead of presenting a shot", () => {
    const r = rig(0);
    r.fire();
    r.fire();
    expect(r.shots).toEqual([1]);
    expect(magLoaded(r.ctx, r.gun)).toBe(effectiveMagSize(r.gun) - r.gun.ammoPerShot);
    // Spend the magazine; with nothing in the pool the dry pull cannot reload and says so.
    for (let i = 0; i < 64 && magLoaded(r.ctx, r.gun) >= r.gun.ammoPerShot; i += 1) {
      r.wait(r.gun.weapon.fireIntervalMs / 1000 + 0.05);
      r.fire();
    }
    const fired = r.shots.length;
    r.wait(1);
    r.fire();
    expect(isReloading(r.ctx, r.gun)).toBe(false);
    expect(r.warnings).toEqual([`NO ${AMMO_LABELS[r.gun.ammo].toUpperCase()} AMMO`]);
    expect(r.shots).toHaveLength(fired);
    expect(r.sounds).toBe(fired);
  });
});
