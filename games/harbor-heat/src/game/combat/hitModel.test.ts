import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { readDamageTable } from "@jgengine/core/combat/damageTable";
import { UnknownTargetProfileError } from "@jgengine/core/combat/damageRuntime";

import { game } from "../../game.config";
import { loop } from "../../loop";
import { content } from "../content";
import { ENEMIES } from "../entities/enemies/catalog";
import { WEAPONS, weaponById } from "../items/weapons/catalog";
import { DAMAGE_TABLE, harborDamage, landExplosion, landHit, landWeaponHit, profileFor, registerAsTarget, weaponHit } from "./hitModel";

const HERO = "damage-hero";

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: HERO, isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  return ctx;
}

/** One shot per weapon cycle, as the fire handler has always spaced them. */
function intervalSeconds(weaponId: string): number {
  return (weaponById(weaponId)?.fireIntervalMs ?? 0) / 1000;
}

function healthOf(ctx: GameContext, id: string): number {
  return ctx.scene.entity.stats.get(id, "health")?.current ?? 0;
}

/** Three pairs the game actually fields: a street pistol, the SMG, and the boardwalk shotgun. */
const PAIRS = [
  { name: "Harbor 9 vs dock ganger", weaponId: "pistol_vice", target: "ganger_dock" },
  { name: "Carmine SMG vs patrol cop", weaponId: "smg_carmine", target: "cop_patrol" },
  { name: "Boardwalk 12g vs kingpin", weaponId: "shotgun_boardwalk", target: "kingpin_sal" },
] as const;

describe("harbor-heat damage table", () => {
  test("every street weapon lands the same integer the local hit path did, at the same time to kill", () => {
    const ctx = boot();
    const damage = harborDamage(ctx);
    for (const pair of PAIRS) {
      const weapon = weaponById(pair.weaponId)!;
      const enemy = ENEMIES.find((row) => row.id === pair.target)!;
      ctx.scene.entity.spawn(pair.target, { id: `target_${pair.weaponId}`, position: [0, 0, 0], role: "npc" });
      registerAsTarget(ctx, `target_${pair.weaponId}`);
      const hit = weaponHit(pair.weaponId)!;

      // Before: the old path drained `weapon.weapon.damage` per shot from the health pool.
      // After: the shared chart resolves the same base against flesh with no armor.
      expect(hit.base).toBe(weapon.weapon.damage);
      const resolution = damage.hit({ target: `target_${pair.weaponId}`, type: hit.type, base: hit.base });
      expect(resolution.damage).toBe(weapon.weapon.damage);
      expect(resolution.multiplier).toBe(1);
      expect(resolution.mitigation).toBe(0);
      expect(resolution.zone.multiplier).toBe(1);
      expect(resolution.zone.crit).toBe(false);

      // Before: shots = ceil(health / damage), kill time = (shots - 1) x fire interval.
      const shots = Math.ceil(enemy.health / weapon.weapon.damage);
      const quote = damage.timeToKill({
        target: `target_${pair.weaponId}`,
        type: hit.type,
        base: hit.base,
        hp: enemy.health,
        intervalSeconds: intervalSeconds(pair.weaponId),
        crit: false,
      });
      expect(quote.damagePerShot).toBe(weapon.weapon.damage);
      expect(quote.shots).toBe(shots);
      expect(quote.seconds).toBeCloseTo((shots - 1) * intervalSeconds(pair.weaponId), 6);
    }
  });

  test("the damage table is readable data, so a balance change is visible without firing", () => {
    const rows = readDamageTable(DAMAGE_TABLE, { base: 14, armor: { flesh: 0, chassis: 0 } });
    expect(rows.map((row) => row.type)).toEqual([
      "ballistic",
      "ballistic",
      "pellet",
      "pellet",
      "blast",
      "blast",
      "impact",
      "impact",
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({ multiplier: 1, armor: 0, mitigation: 0, net: 1, damage: 14 });
    }
    expect(WEAPONS.every((weapon) => weaponHit(weapon.id) !== null)).toBe(true);
  });

  test("a hit on a target with no registered profile is refused, not dealt as zero", () => {
    const ctx = boot();
    expect(() => harborDamage(ctx).hit({ target: "nobody", type: "ballistic", base: 14 })).toThrow(
      UnknownTargetProfileError,
    );
    expect(profileFor("ganger_dock")).toEqual({ resistance: "flesh", armor: 0 });
    expect(profileFor("car_compact")).toEqual({ resistance: "chassis", armor: 0 });
    expect(profileFor("obj_delivery_1")).toBeNull();
  });

  test("a landed shot drains the health pool through the engine effect system, unchanged", () => {
    const ctx = boot();
    ctx.scene.entity.spawn("ganger_dock", { id: "ganger_target", position: [0, 0, 0], role: "npc" });
    expect(healthOf(ctx, "ganger_target")).toBe(45);

    const first = landWeaponHit(ctx, { from: HERO, to: "ganger_target", weaponId: "pistol_vice" });
    expect(first?.damage).toBe(14);
    expect(healthOf(ctx, "ganger_target")).toBe(31);

    landWeaponHit(ctx, { from: HERO, to: "ganger_target", weaponId: "pistol_vice" });
    landWeaponHit(ctx, { from: HERO, to: "ganger_target", weaponId: "pistol_vice" });
    expect(healthOf(ctx, "ganger_target")).toBe(3);
    // Four shots at 14 is the kill the old per-hit subtraction produced, never a fifth.
    const kill = landWeaponHit(ctx, { from: HERO, to: "ganger_target", weaponId: "pistol_vice" });
    expect(kill?.damage).toBe(14);
    expect(ctx.scene.entity.get("ganger_target")).toBeNull();
  });

  test("a player hit lands through the chart and still drains armor before health", () => {
    const ctx = boot();
    ctx.scene.entity.stats.set(HERO, "armor", { current: 100 });
    expect(landHit(ctx, { from: "ganger_x", to: HERO, type: "ballistic", base: 6 })?.damage).toBe(6);
    // The armor pool absorbs it first; the chart's armor curve stays out of the pools' way.
    expect(ctx.scene.entity.stats.get(HERO, "armor")?.current).toBe(94);
    expect(ctx.scene.entity.stats.get(HERO, "health")?.current).toBe(100);
  });

  test("an explosion resolves each body in the radius through the same chart", () => {
    const ctx = boot();
    const ground = ctx.world.groundHeightAt(0, 0);
    ctx.scene.entity.spawn("ganger_dock", { id: "blast_near", position: [1, ground, 0], role: "npc" });
    ctx.scene.entity.spawn("ganger_dock", { id: "blast_far", position: [5, ground, 0], role: "npc" });
    const landed = landExplosion(ctx, { from: HERO, at: [0, ground, 0], radius: 6, weaponId: "grenade_pineapple" });
    const near = landed.find((row) => row.target === "blast_near")!;
    const far = landed.find((row) => row.target === "blast_far")!;
    expect(near).toBeDefined();
    expect(far).toBeDefined();
    // 80 delivered on the shared linear falloff: 6 - distance over 6.
    expect(near.damage).toBeCloseTo(80 * (1 - 1 / 6), 6);
    expect(far.damage).toBeCloseTo(80 * (1 - 5 / 6), 6);
    // The near body takes more than its 45 health and dies; the far one keeps the remainder.
    expect(ctx.scene.entity.get("blast_near")).toBeNull();
    expect(healthOf(ctx, "blast_far")).toBeCloseTo(45 - far.damage, 6);
  });
});
