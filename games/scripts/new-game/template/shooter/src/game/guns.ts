import type { EffectResult } from "@jgengine/core/combat/effects";
import { createWeaponHandling, type WeaponHandling } from "@jgengine/core/combat/weaponHandling";
import { createWeaponRuntime, type WeaponRuntime } from "@jgengine/core/combat/weaponFire";
import type { CameraWeaponView } from "@jgengine/core/game/cameraConfig";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { Aim } from "@jgengine/core/scene/spatial";
import { defineSystem } from "@jgengine/shell/gameKit";

import { idea } from "./idea";
import type { GunWord } from "./kindShape";
import { bonus, gunThing, ops } from "./spec";

/**
 * The guns: each is the engine's weapon runtime (cadence + magazine) whose hits are the engine's
 * projectile system, with the weapon handling frame for recoil and aim-down-sights. This file only
 * says which gun is in your hands and what a trigger pull does.
 */

const deg = (value: number) => (value * Math.PI) / 180;

interface Held {
  gun: GunWord;
  runtime: WeaponRuntime<Aim, EffectResult>;
  handling: WeaponHandling;
  view: CameraWeaponView;
}

interface Armory {
  guns: Map<string, Held>;
  selected: string;
  shots: number;
  hits: number;
}

export const armory = perContext((ctx: GameContext): Armory => ({
  guns: new Map(idea.guns.map((gun) => [gun.id, hold(ctx, gun)])),
  selected: idea.guns[0]!.id,
  shots: 0,
  hits: 0,
}));

function hold(ctx: GameContext, gun: GunWord): Held {
  const kick = Math.min(4, 0.4 + gun.damage / 25);
  const handling = createWeaponHandling(
    {
      recoil: { pitch: deg(kick), randomCone: deg(kick * 0.3), cameraShare: 0.4, recoverRate: deg(14), recoverDelay: 0.12, adsScale: 0.6 },
      spread: { base: deg(gun.spread), perShot: deg(gun.spread * 0.25), max: deg(gun.spread * 2.5), recoverRate: deg(gun.spread * 3), ads: 0.45, moving: 1.4 },
      adsTime: 0.2,
    },
    { random: seededRng(`${idea.id}:${gun.id}`) },
  );
  const runtime = createWeaponRuntime<Aim, EffectResult>({
    cadenceMs: 60000 / gun.rpm,
    magazine: { capacity: gun.mag, reloadMs: gun.reloadMs },
    resolveHits: (aim) => {
      const me = ctx.player.userId;
      const shot = handling.fire({ ads: aiming(ctx) });
      const id = ctx.scene.entity.fireProjectile({
        from: me,
        via: { item: gun.id, amount: Math.round(gun.damage * (1 + bonus(ctx, "damage"))) },
        aim: { ...aim, spread: (shot.spread * 180) / Math.PI },
        effect: "damage",
      });
      const settled = ctx.scene.entity.settleProjectile(id);
      return settled.status === "settled" ? settled.hits : [];
    },
    // Damage lands through the projectile's own effect; the runtime only gates and counts.
    damageFor: () => null,
  });
  return { gun, runtime, handling, view: { handling: handling.frame() } };
}

const aiming = (ctx: GameContext) => ctx.input.isDown("aim");

/** Where the shoulder camera sits beside you; the camera config and the shot line both read it. */
export const SHOULDER = { offset: 0.75, height: 1.7, adsOffset: 0.8 } as const;

/**
 * The crosshair's own line: the shoulder camera looks along yaw/pitch through a point beside your
 * head, so a shot starts there instead of at your eye, and what the reticle covers is what gets hit.
 */
function crosshairLine(ctx: GameContext, yaw: number, pitch: number): Aim {
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return { yaw, pitch };
  const ads = heldGun(ctx).view.handling?.adsProgress ?? 0;
  const side = SHOULDER.offset + (SHOULDER.adsOffset - SHOULDER.offset) * ads;
  const cos = Math.cos(pitch);
  return {
    origin: [me.position[0] - Math.cos(yaw) * side, me.position[1] + SHOULDER.height, me.position[2] + Math.sin(yaw) * side],
    direction: [Math.sin(yaw) * cos, Math.sin(pitch), Math.cos(yaw) * cos],
  };
}

export const owns = (ctx: GameContext, gunId: string) => ops.of(ctx).fact(`${gunThing(gunId)}.owned`) === true;

export function heldGun(ctx: GameContext): Held {
  const state = armory(ctx);
  return state.guns.get(state.selected)!;
}

/** One trigger pull (or one repeat of a held trigger, for an automatic). */
export function pullTrigger(ctx: GameContext, aim: Aim, held: boolean): void {
  if (gamePhase(ctx) !== "playing" || ctx.scene.entity.get(ctx.player.userId) === null) return;
  const state = armory(ctx);
  const gun = heldGun(ctx);
  if (held && !gun.gun.auto) return;
  const result = gun.runtime.fire(aim);
  if (result.status === "empty") {
    if (gun.runtime.startReload()) ctx.game.notices.push({ text: "Reloading", tone: "info" });
    return;
  }
  if (result.status !== "fired") return;
  state.shots += 1;
  state.hits += result.hits.length;
  for (const hit of result.hits) {
    if (hit.instanceId !== ctx.player.userId) ctx.scene.entity.setTarget(hit.instanceId, ctx.player.userId);
  }
}

/** Switch to a gun you own; a locked one is bought if cash covers it. */
export function selectGun(ctx: GameContext, index: number): void {
  const gun = idea.guns[index];
  if (gun === undefined) return;
  if (!owns(ctx, gun.id)) {
    const done = ops.of(ctx).act(`buy_${gun.id}`, gunThing(gun.id));
    if (!done.ok) {
      ctx.game.notices.push({ text: `${gun.label}: ${gun.price} ${idea.currency.label.toLowerCase()} to unlock`, tone: "deny" });
      return;
    }
    ctx.game.notices.push({ text: `${gun.label} unlocked`, tone: "success" });
  }
  armory(ctx).selected = gun.id;
}

/** Every gun back to a full magazine (a retry, a fresh start). */
export function rearm(ctx: GameContext): void {
  const state = armory(ctx);
  for (const gun of idea.guns) state.guns.set(gun.id, hold(ctx, gun));
  if (!owns(ctx, state.selected)) state.selected = idea.guns[0]!.id;
}

/**
 * What the camera rig reads each frame: the held gun's recoil and aim blend. `camera.weapon` is
 * called without a game context (engine gap: it should be handed one), so the gun system leaves the
 * local player's current view here every frame.
 */
export const shoulderView: { current: CameraWeaponView | null } = { current: null };

/** What the HUD reads about the guns. */
export function gunView(ctx: GameContext) {
  const gun = heldGun(ctx);
  const magazine = gun.runtime.magazine!;
  return {
    id: gun.gun.id,
    label: gun.gun.label,
    loaded: magazine.loaded(),
    capacity: magazine.capacity(),
    reloading: magazine.isReloading(),
    reload: magazine.reloadFraction(),
    guns: idea.guns.map((entry) => ({ id: entry.id, label: entry.label, price: entry.price, owned: owns(ctx, entry.id), held: entry.id === gun.gun.id })),
  };
}

export const gunSystem = defineSystem({
  id: "shooter.guns",
  tick: { type: "frame" },
  create(ctx) {
    ctx.game.commands.define<{ aim?: Aim; yaw?: number; pitch?: number; held?: boolean }>("fire", {
      apply(state, input) {
        const given = input.aim;
        const aim =
          given !== undefined && "origin" in given
            ? given
            : crosshairLine(
                state,
                given?.yaw ?? input.yaw ?? state.scene.entity.get(state.player.userId)?.rotationY ?? 0,
                given?.pitch ?? input.pitch ?? 0,
              );
        pullTrigger(state, aim, input.held === true);
        return state;
      },
    });
    ctx.game.commands.define("reload", {
      apply(state) {
        if (heldGun(state).runtime.startReload()) state.game.notices.push({ text: "Reloading", tone: "info" });
        return state;
      },
    });
    idea.guns.forEach((_, index) => {
      ctx.game.commands.define(`gun${index + 1}`, {
        apply(state) {
          selectGun(state, index);
          return state;
        },
      });
    });
  },
  update(ctx, dt) {
    if (gamePhase(ctx) !== "playing") return;
    const moving = ["moveForward", "moveBack", "moveLeft", "moveRight"].some((action) => ctx.input.isDown(action));
    const stance = { ads: aiming(ctx), moving };
    for (const gun of armory(ctx).guns.values()) {
      gun.runtime.tick(dt);
      gun.view.handling = gun.handling.tick(dt, stance);
    }
    shoulderView.current = heldGun(ctx).view;
  },
});
