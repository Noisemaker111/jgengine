import type { Tile } from "@jgengine/core/tactics/tacticalGrid";

export interface AttackerSpec {
  damage: number;
  pushTiles?: number;
}

export interface AttackResolution {
  damage: number;
  pushDirection: Tile | null;
}

export function resolveAttack(attacker: AttackerSpec, attackerTile: Tile, defenderTile: Tile): AttackResolution {
  const damage = Math.max(1, attacker.damage);
  if (attacker.pushTiles === undefined || attacker.pushTiles <= 0) {
    return { damage, pushDirection: null };
  }
  const dc = Math.sign(defenderTile[0] - attackerTile[0]);
  const dr = Math.sign(defenderTile[1] - attackerTile[1]);
  if (dc === 0 && dr === 0) return { damage, pushDirection: null };
  return { damage, pushDirection: [dc, dr] };
}

export function clampHealth(current: number, max: number): number {
  return Math.min(max, Math.max(0, current));
}
