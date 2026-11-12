import type { CameraWeaponView } from "@jgengine/core/camera/cameraConfig";
import {
  createWeaponHandling,
  type WeaponHandling,
  type WeaponHandlingFrame,
  type WeaponHandlingTuning,
  type WeaponShot,
  type WeaponStance,
} from "@jgengine/core/combat/weaponHandling";
import type { WeaponPresentationTuning } from "@jgengine/core/combat/weaponPresentation";
import { deriveWalkSpeed } from "@jgengine/core/movement/movementSpeed";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { Aim } from "@jgengine/core/scene/spatial";

import { bonus } from "./characters";
import { playerDef } from "./entities/players/catalog";
import type { GunDef, GunFamily } from "./handroll/guns";

/**
 * How each gun family handles, as multipliers on its rolled spread. `hip` widens the cone fired from
 * the hip and `ads` tightens it again while aimed, so a sniper is wild from the hip and exact through
 * the scope while a pistol barely changes. `bloom` is the cone added per shot and `bloomMax` its cap,
 * both in multiples of the resting cone; `kick` is muzzle climb per shot in radians.
 */
interface FamilyHandling {
  hip: number;
  ads: number;
  bloom: number;
  bloomMax: number;
  kick: number;
  zoom: number;
}

const FAMILY_HANDLING: Record<GunFamily, FamilyHandling> = {
  pistol: { hip: 1, ads: 0.55, bloom: 0.4, bloomMax: 2.5, kick: 0.014, zoom: 0.85 },
  smg: { hip: 1.1, ads: 0.65, bloom: 0.22, bloomMax: 2.2, kick: 0.006, zoom: 0.9 },
  shotgun: { hip: 1, ads: 0.75, bloom: 0.25, bloomMax: 1.5, kick: 0.03, zoom: 0.9 },
  rifle: { hip: 1.6, ads: 0.45, bloom: 0.2, bloomMax: 2.5, kick: 0.008, zoom: 0.78 },
  sniper: { hip: 6, ads: 1 / 6, bloom: 0.6, bloomMax: 2, kick: 0.04, zoom: 0.45 },
  launcher: { hip: 1, ads: 0.8, bloom: 0.3, bloomMax: 1.6, kick: 0.035, zoom: 0.9 },
};

/** Spread multiplier while moving, and while crouched and braced. */
export const MOVING_SPREAD = 1.6;
export const BRACED_SPREAD = 0.7;
/** Walk speed share while aimed: aiming trades movement for precision. */
export const AIMED_WALK_SCALE = 0.55;
/** Walk speed while downed in the Emergency Reserve window. */
export const DOWNED_WALK_SPEED = 1.6;
/** Seconds bloom takes to settle back to the resting cone. */
const BLOOM_SETTLE_SECONDS = 0.45;

const DEG = Math.PI / 180;

/** The engine handling tuning for one rolled gun: its own spread, shaped by its family. */
export function handlingTuning(gun: GunDef): WeaponHandlingTuning {
  const family = FAMILY_HANDLING[gun.family];
  const base = gun.weapon.spread * family.hip * DEG;
  const max = base * family.bloomMax;
  return {
    spread: {
      base,
      perShot: base * family.bloom,
      max,
      recoverRate: (max - base) / BLOOM_SETTLE_SECONDS,
      recoverDelay: 0.08,
      ads: family.ads,
      moving: gun.family === "sniper" ? 2 : MOVING_SPREAD,
      crouching: BRACED_SPREAD,
    },
    recoil: { pitch: family.kick, randomCone: family.kick * 0.25, cameraShare: 0.4, recoverRate: family.kick * 22, recoverDelay: 0.12, adsScale: 0.7 },
    adsTime: gun.family === "sniper" ? 0.28 : 0.18,
  };
}

/** How the first-person camera frames a family while aimed. */
export function presentationFor(gun: GunDef): WeaponPresentationTuning {
  return { adsZoom: FAMILY_HANDLING[gun.family].zoom };
}

const MOVE_ACTIONS = ["moveForward", "moveBack", "moveLeft", "moveRight"] as const;

/** The player's stance this tick, read from held actions: aim, crouch-brace, moving, sprinting. */
export interface PlayerStance extends WeaponStance {
  ads: boolean;
  crouching: boolean;
  moving: boolean;
  sprinting: boolean;
}

export function playerStance(ctx: GameContext): PlayerStance {
  const ads = ctx.input.isDown("aim");
  const moving = MOVE_ACTIONS.some((action) => ctx.input.isDown(action));
  return {
    ads,
    crouching: ctx.input.isDown("crouch"),
    moving,
    // Aiming takes the sprint away (see `canSprint`), so an aimed walk is never a sprint.
    sprinting: !ads && moving && ctx.input.isDown("sprint"),
  };
}

/** Whether the built-in sprint may run: not while aiming, not while downed. */
export function canSprint(ctx: GameContext, downed: boolean): boolean {
  return !downed && !ctx.input.isDown("aim");
}

interface HandlingSlot {
  gunId: string | null;
  handling: WeaponHandling | null;
  view: CameraWeaponView | null;
}

const handlingOf = perContext((): HandlingSlot => ({ gunId: null, handling: null, view: null }));
/** The world's recoil stream; per world, so one world's spray never shifts another's. */
const recoilRngOf = perContext(() => seededRng("scrap-handling"));

function slotFor(ctx: GameContext, gun: GunDef | null): HandlingSlot {
  const slot = handlingOf(ctx);
  if (gun === null) {
    slot.gunId = null;
    slot.handling = null;
    slot.view = null;
    return slot;
  }
  if (slot.gunId !== gun.id || slot.handling === null) {
    // A swapped gun starts settled: its cone and climb are its own, not the last gun's.
    slot.gunId = gun.id;
    slot.handling = createWeaponHandling(handlingTuning(gun), { random: recoilRngOf(ctx) });
    slot.view = { handling: slot.handling.frame(), presentation: presentationFor(gun) };
  }
  return slot;
}

/** Advance the held gun's bloom, recoil and aim blend by `dt`, in the player's current stance. */
export function tickHandling(ctx: GameContext, gun: GunDef | null, dt: number): WeaponHandlingFrame | null {
  const slot = slotFor(ctx, gun);
  if (slot.handling === null || slot.view === null) return null;
  const frame = { ...slot.handling.tick(dt, playerStance(ctx)) };
  slot.view = { ...slot.view, handling: frame };
  return frame;
}

/** Register one shot on the held gun and return its cone and kick, in the stance it was fired from. */
export function fireHandling(ctx: GameContext, gun: GunDef): WeaponShot {
  const slot = slotFor(ctx, gun);
  if (slot.handling === null) return { spread: 0, kickPitch: 0, kickYaw: 0 };
  return slot.handling.fire(playerStance(ctx));
}

/** The held gun's last handling frame, for the camera rig, the reticle and the viewmodel. */
export function handlingView(ctx: GameContext): CameraWeaponView | null {
  return handlingOf(ctx).view;
}

/**
 * The aim a shot leaves along: the look the player holds plus the climb the gun has already put on
 * the view, so the round goes where the camera now points, inside the cone this shot fired into.
 */
export function shotAim(aim: Aim, view: CameraWeaponView | null, spreadRad: number): Aim {
  const spread = spreadRad / DEG;
  // A world ray (a cursor or a capture host) already points where it means to; only the cone applies.
  if (!("yaw" in aim)) return { ...aim, spread };
  const recoil = view?.handling;
  return {
    yaw: aim.yaw - (recoil === undefined ? 0 : recoil.aimYaw),
    pitch: aim.pitch + (recoil === undefined ? 0 : recoil.aimPitch),
    spread,
  };
}

/**
 * The player's walk speed for the moment: the chassis base, its move-speed talent, slowed while aimed,
 * and a crawl while downed. The one place walk speed is decided, so a respawn or a respec never
 * forgets a talent and aiming never outlives the button.
 */
export function playerWalkSpeed(ctx: GameContext, downed: boolean): number {
  if (downed) return DOWNED_WALK_SPEED;
  const aimed = ctx.input.isDown("aim") ? AIMED_WALK_SCALE : 1;
  return Math.round(deriveWalkSpeed(playerDef.walkSpeed, { multiplier: (1 + bonus("moveSpeed")) * aimed }) * 100) / 100;
}

/** Write {@link playerWalkSpeed} onto the chassis when it changed. */
export function applyWalkSpeed(ctx: GameContext, downed: boolean): void {
  const userId = ctx.player.userId;
  const entity = ctx.scene.entity.get(userId);
  if (entity === null) return;
  const walkSpeed = playerWalkSpeed(ctx, downed);
  if (entity.movement?.walkSpeed === walkSpeed) return;
  ctx.scene.entity.update(userId, { movement: { ...entity.movement, walkSpeed } });
}
