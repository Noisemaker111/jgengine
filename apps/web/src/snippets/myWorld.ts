import type { DamageTableDef } from "@jgengine/core/combat/damage/damageTable";
import type { HitZoneTable } from "@jgengine/core/combat/hitZones";
import type { WeaponVec3 } from "@jgengine/core/combat/weaponDefinition";
import type { WeaponContact } from "@jgengine/core/combat/weaponSystem";

// Stand-ins for a game's own world, so the projectile snippet compiles.
// The hand-rolled side assumes the same things exist.

export const DAMAGE_TABLE: DamageTableDef = {
  types: [{ id: "kinetic", vs: { flesh: 1 } }],
  armor: { halfValue: 100, maxMitigation: 0.9 },
};
export const HIT_ZONES: HitZoneTable = { zones: [{ id: "body", multiplier: 1 }], defaultZone: "body" };

export const rng = Math.random;
export const shooter = { yaw: 0, pitch: 0.1, triggerHeld: true };

export function muzzle(): WeaponVec3 {
  return [0, 1.5, 0];
}

/** The game's own collision query: the first thing between two points, or null. */
export function firstHit(_from: WeaponVec3, _to: WeaponVec3): WeaponContact | null {
  return null;
}

export function spawnSparks(_target: string): void {}

/** Two poles and a ground mesh's vertices, for the cable and hills snippets. */
export const poleA = { x: -10, z: 0 };
export const poleB = { x: 10, z: 0 };
export const vertices: { x: number; y: number; z: number }[] = [];

/** A game's own units and camera, for the minimap snippet. */
export const units: { id: string; x: number; z: number; team: "ally" | "enemy" | "loot" }[] = [];
export const cam = { x: 0, z: 0, yaw: 0 };

/** A game's own enemy record, for the damage snippet. */
export const enemy = { id: "grunt", armored: true };

/** A game's own event bus. */
export function emit(_event: string, _data: unknown): void {}

/** Reads and writes save.players[id].xp and .level in a game's own save. */
export const saveAccess = {
  get: (_id: string, _stat: string): { current: number; max: number } | null => ({ current: 0, max: 0 }),
  set: (_id: string, _stat: string, _patch: { current?: number; max?: number }) => {},
};
