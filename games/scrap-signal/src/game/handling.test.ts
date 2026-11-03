import { afterEach, describe, expect, test } from "bun:test";
import type { ProjectileShotInput } from "@jgengine/core/combat/projectiles";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { seededRng } from "@jgengine/core/random/rng";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { AMMO_STAT_IDS } from "./ammo";
import { pickCharacter, resetCharacterState } from "./characters";
import { registerCommands } from "./commands";
import { content } from "./content";
import { playerDef } from "./entities/players/catalog";
import { noteEquipped } from "./feel";
import { AIMED_WALK_SCALE, applyWalkSpeed, canSprint, tickHandling } from "./handling";
import { gunById, isReloading, magLoaded, rollGun, startReload, type GunFamily } from "./handroll";
import { inventories } from "./inventories";
import { itemUseHandlers, resetWeaponState } from "./items/use-handlers";
import { session } from "./session";

afterEach(() => {
  resetCharacterState();
  resetWeaponState();
});

interface Rig {
  ctx: GameContext;
  gunId: string;
  shots: ProjectileShotInput[];
  hold(...actions: string[]): void;
  step(seconds: number): void;
  fire(): void;
}

function rig(family: GunFamily = "pistol"): Rig {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "scrap-handling-test", assets: createAssetCatalog(), multiplayer: "off", inventories }),
    content,
    player: { userId: "p1", isNew: true },
  });
  ctx.scene.entity.spawn(playerDef.id, { id: "p1", position: [0, 0, 0] });
  pickCharacter("gunk");
  registerCommands(ctx);
  ctx.item.use.register(itemUseHandlers);
  const gun = rollGun(seededRng(`handling-${family}`), 1, { family });
  ctx.player.inventory.put("hotbar", gun.id, 1, { slot: 0 });
  session.selectSlot(ctx, 0);
  noteEquipped(gun.id);
  ctx.scene.entity.stats.set("p1", AMMO_STAT_IDS[gun.ammo], { current: 400, max: 400 });
  const shots: ProjectileShotInput[] = [];
  const fireProjectile = ctx.scene.entity.fireProjectile.bind(ctx.scene.entity);
  ctx.scene.entity.fireProjectile = (input) => {
    shots.push(input);
    return fireProjectile(input);
  };
  const step = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
      ctx.time.advance(1 / 60);
      tickHandling(ctx, gunById(gun.id) ?? null, 1 / 60);
    }
  };
  return {
    ctx,
    gunId: gun.id,
    shots,
    hold: (...actions) => ctx.input.publish(actions),
    step,
    fire: () => ctx.game.commands.run("fire", { aim: { yaw: 0, pitch: 0 } }),
  };
}

/** The cone the next shot from rest fires into, in degrees, in the stance the rig holds. */
function restingCone(family: GunFamily, ...held: string[]): number {
  const r = rig(family);
  r.hold(...held);
  r.step(0.6);
  r.fire();
  const shot = r.shots.at(-1);
  if (shot === undefined) throw new Error("no shot left the barrel");
  return "spread" in shot.aim && shot.aim.spread !== undefined ? shot.aim.spread : Number.NaN;
}

describe("gun handling", () => {
  test("aiming tightens the cone, most of all on a sniper", () => {
    expect(restingCone("pistol", "aim")).toBeLessThan(restingCone("pistol") * 0.7);
    expect(restingCone("sniper", "aim")).toBeLessThan(restingCone("sniper") * 0.25);
  });

  test("moving widens the cone and a crouched brace narrows it", () => {
    const still = restingCone("rifle");
    expect(restingCone("rifle", "moveForward")).toBeGreaterThan(still * 1.4);
    expect(restingCone("rifle", "crouch")).toBeLessThan(still * 0.8);
  });

  test("held fire blooms the cone, and it settles back after the trigger is let go", () => {
    const r = rig("smg");
    for (let shot = 0; shot < 8; shot += 1) {
      r.fire();
      r.step(0.1);
    }
    const cones = r.shots.map((shot) => ("spread" in shot.aim ? shot.aim.spread ?? 0 : 0));
    expect(cones.length).toBe(8);
    expect(cones.at(-1) ?? 0).toBeGreaterThan((cones[0] ?? 0) * 1.5);
    r.step(1.5);
    r.fire();
    const settled = r.shots.at(-1);
    expect(settled !== undefined && "spread" in settled.aim ? settled.aim.spread : Number.NaN).toBeCloseTo(cones[0] ?? 0, 5);
  });

  test("a sprinting chassis cannot fire, and spends no round trying", () => {
    const r = rig();
    const gun = gunById(r.gunId);
    if (gun === undefined) throw new Error("gun missing");
    const loaded = magLoaded(r.ctx, gun);
    r.hold("sprint", "moveForward");
    r.fire();
    expect(r.shots).toHaveLength(0);
    expect(magLoaded(r.ctx, gun)).toBe(loaded);
    r.hold("moveForward");
    r.fire();
    expect(r.shots).toHaveLength(1);
  });

  test("aiming slows the walk and takes the sprint away", () => {
    const r = rig();
    applyWalkSpeed(r.ctx, false);
    const hip = r.ctx.scene.entity.get("p1")?.movement?.walkSpeed ?? 0;
    expect(canSprint(r.ctx, false)).toBe(true);
    r.hold("aim");
    applyWalkSpeed(r.ctx, false);
    expect(r.ctx.scene.entity.get("p1")?.movement?.walkSpeed ?? 0).toBeCloseTo(hip * AIMED_WALK_SCALE, 1);
    expect(canSprint(r.ctx, false)).toBe(false);
  });

  test("the reload key cancels a reload in flight and keeps the rounds still loaded", () => {
    const r = rig();
    const gun = gunById(r.gunId);
    if (gun === undefined) throw new Error("gun missing");
    r.fire();
    const loaded = magLoaded(r.ctx, gun);
    expect(startReload(r.ctx, gun)).toBe(true);
    r.ctx.game.commands.run("reload", {});
    expect(isReloading(r.ctx, gun)).toBe(false);
    expect(magLoaded(r.ctx, gun)).toBe(loaded);
  });

  test("the trigger cuts a reload short while rounds are loaded, and waits for it on an empty mag", () => {
    const r = rig();
    const gun = gunById(r.gunId);
    if (gun === undefined) throw new Error("gun missing");
    r.fire();
    r.step(1);
    expect(startReload(r.ctx, gun)).toBe(true);
    r.fire();
    expect(isReloading(r.ctx, gun)).toBe(false);
    expect(r.shots).toHaveLength(2);

    while (magLoaded(r.ctx, gun) > 0) {
      r.fire();
      r.step(1);
    }
    const fired = r.shots.length;
    expect(isReloading(r.ctx, gun) || startReload(r.ctx, gun)).toBe(true);
    r.fire();
    expect(r.shots).toHaveLength(fired);
    expect(isReloading(r.ctx, gun)).toBe(true);
  });
});
