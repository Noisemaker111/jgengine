import type { HitReactionConfig } from "@jgengine/core/combat/hitReaction";
import { cameraShake } from "@jgengine/shell/camera";
import type { WeaponFamily } from "./items/weapons/catalog";

export const FIRE_KICK: Record<WeaponFamily, number> = {
  pistol: 0.05,
  smg: 0.035,
  shotgun: 0.15,
  rifle: 0.045,
  dmr: 0.11,
  beam: 0.03,
  launcher: 0.17,
  railgun: 0.22,
};

export const SHOT_KNOCKBACK: HitReactionConfig = { hitstopMs: 35, knockback: 1.3 };
export const EXPLOSION_KNOCKBACK: HitReactionConfig = { hitstopMs: 60, knockback: 3.2, vertical: 0.4 };

export function kickCamera(amount: number): void {
  cameraShake(amount);
}

export function shakeOnPlayerDamage(damage: number): void {
  cameraShake(Math.min(0.55, 0.12 + damage * 0.012));
}

export function shakeOnExplosion(distance: number): void {
  if (distance > 18) return;
  cameraShake(Math.max(0.08, 0.4 - distance * 0.02));
}
