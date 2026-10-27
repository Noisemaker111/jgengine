import { createDamageRuntime } from "@jgengine/core/combat/damage/damageRuntime";
import type { WeaponDefinition } from "@jgengine/core/combat/weaponDefinition";
import { createWeaponSystem } from "@jgengine/core/combat/weaponSystem";
import { DAMAGE_TABLE, HIT_ZONES, firstHit, muzzle, rng, shooter, spawnSparks } from "./myWorld";

// The weapon is data. Change a number and it fires differently.
export const launcher: WeaponDefinition = {
  id: "launcher",
  roundsPerMinute: 600,
  fireMode: "auto",
  pellets: 1,
  delivery: { kind: "projectile", speed: 70, gravity: 2, lifetime: 4 },
  magazine: { capacity: 30, reloadMs: 1_200 },
  handling: { spread: { base: 0.01, perShot: 0.004, max: 0.06, recoverRate: 0.1 } },
  damage: { type: "kinetic", base: 20 },
};

const damage = createDamageRuntime({ table: DAMAGE_TABLE, zones: HIT_ZONES, rng });
const weapon = createWeaponSystem(launcher, { rng, damage, origin: muzzle, sweep: firstHit });

// every frame: aim, trigger, then let the engine fly the pellets
export function update(dt: number) {
  weapon.setAim(shooter.yaw, shooter.pitch);
  weapon.setTrigger(shooter.triggerHeld);
  const { impacts } = weapon.tick(dt);
  for (const hit of impacts) spawnSparks(hit.target);
}
